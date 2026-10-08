"""
Live updates, server side: PostgreSQL says that something changed, and we pass
it on to every open dashboard within about a second.

    a transaction COMMITs                     a data load, an admin's warning, pgAdmin ...
      -> its trigger ran pg_notify('climate_live', 'weather_data')   database/05_live_updates.sql
      -> Listener: a thread that ran  LISTEN climate_live             (below)
      -> LiveHub: one queue per open /api/live stream                 (below)
      -> routers/live.py sends it to the browser, which fetches that part of the page again

The listener is a plain thread, like the scheduler, not async code: psycopg's
async mode doesn't work with the event loop Windows uses by default.
"""
import asyncio
import logging
import threading

from . import db

log = logging.getLogger(__name__)


class LiveHub:
    """Everyone with an open /api/live stream: one queue each."""

    def __init__(self) -> None:
        self._queues: set[asyncio.Queue] = set()
        self._loop: asyncio.AbstractEventLoop | None = None

    def bind(self, loop: asyncio.AbstractEventLoop) -> None:
        """Remember the web server's event loop, where the queues are read."""
        self._loop = loop

    def subscribe(self) -> asyncio.Queue:
        queue: asyncio.Queue = asyncio.Queue(maxsize=100)
        self._queues.add(queue)
        return queue

    def unsubscribe(self, queue: asyncio.Queue) -> None:
        self._queues.discard(queue)

    @property
    def listeners(self) -> int:
        return len(self._queues)

    def publish(self, table: str) -> None:
        """Put the table name in every queue. Runs on the event loop."""
        for queue in list(self._queues):
            try:
                queue.put_nowait(table)
            except asyncio.QueueFull:
                pass      # a browser that stopped reading misses this one; it catches up when it reconnects

    def publish_from_thread(self, table: str) -> None:
        """publish(), called from the listener thread. asyncio queues are not
        thread-safe, so we ask the event loop to run publish() for us."""
        loop = self._loop
        if loop is None or loop.is_closed():
            return
        try:
            loop.call_soon_threadsafe(self.publish, table)
        except RuntimeError:
            pass          # the server is shutting down


hub = LiveHub()


class Listener:
    """A background thread that keeps one connection LISTENing on 'climate_live'."""

    def __init__(self, live_hub: LiveHub) -> None:
        self.hub = live_hub
        self._stop = threading.Event()
        self._thread = threading.Thread(target=self._run, name="live-listener", daemon=True)

    def start(self) -> None:
        self._thread.start()

    def stop(self) -> None:
        self._stop.set()
        self._thread.join(timeout=5)

    def _run(self) -> None:
        delay = 1.0
        while not self._stop.is_set():
            try:
                with db.connect() as conn:                     # autocommit, so LISTEN takes effect at once
                    conn.execute(db.load_sql("live/listen"))
                    log.info("Live updates: listening on channel climate_live")
                    # (Re)connected: something may have changed while we weren't listening,
                    # so every page fetches everything once.
                    self.hub.publish_from_thread("all")
                    delay = 1.0
                    while not self._stop.is_set():
                        # Wait at most 1 second for messages, so stop() is noticed quickly.
                        for notify in conn.notifies(timeout=1.0):
                            self.hub.publish_from_thread(notify.payload)
            except Exception as exc:                          # database restarted, network gone ...
                log.warning("Live updates: lost the database connection (%s); trying again in %.0f s", exc, delay)
                self._stop.wait(delay)
                delay = min(delay * 2, 30.0)
