"""
Live updates: the pg_notify triggers (database/05_live_updates.sql), the 'live'
run type, the /api/live stream, and the chart's one-point-per-hour rule.

The triggers are tested straight on the test database: one connection runs
LISTEN, another changes rows, just like the API's listener and a data load.
    cd backend
    .venv/bin/python -m pytest tests/test_live.py -v
"""
import asyncio
from datetime import date, datetime, time, timedelta, timezone
from pathlib import Path
from types import SimpleNamespace

import psycopg
import pytest

from app import db
from app.live import LiveHub
from app.routers import live as live_router

DATABASE_DIR = Path(__file__).resolve().parents[2] / "database"
OLD_DAY = date(2000, 1, 1)          # far away from the test data, and removed again afterwards
READING = "INSERT INTO WEATHER_DATA (station_id, reading_date, reading_time, current_temp) VALUES (%s, %s, %s, 26.0)"


@pytest.fixture()
def listener(database):
    """A connection that has run LISTEN climate_live, like the API's listener thread."""
    with db.connect() as conn:
        conn.execute(db.load_sql("live/listen"))
        yield conn


def received(conn: psycopg.Connection, wait: float = 1.0) -> list[str]:
    """The messages (payloads) that arrive within `wait` seconds."""
    return [notify.payload for notify in conn.notifies(timeout=wait)]


def station_id(conn: psycopg.Connection, name: str) -> int:
    return conn.execute("SELECT station_id FROM WEATHER_STATION WHERE station_name = %s", (name,)).fetchone()["station_id"]


# ------------------------------------------------------------- the triggers
def test_a_data_load_sends_one_message_when_it_commits(listener):
    with db.connect() as conn:
        colaba = station_id(conn, "Mumbai (Colaba)")
        try:
            with conn.transaction():                              # like one ingestion run
                for minute in (0, 15, 30, 45):
                    conn.execute(READING, (colaba, OLD_DAY, time(10, minute)))
                assert received(listener, wait=0.5) == []          # nothing is sent before COMMIT
            assert received(listener) == ["weather_data"]          # four rows, ONE message
        finally:
            conn.execute("DELETE FROM WEATHER_DATA WHERE reading_date = %s", (OLD_DAY,))


def test_a_rolled_back_change_sends_nothing(listener):
    with db.connect() as conn:
        colaba = station_id(conn, "Mumbai (Colaba)")
        with pytest.raises(RuntimeError):
            with conn.transaction():
                conn.execute(READING, (colaba, OLD_DAY, time(11, 0)))
                raise RuntimeError("undo")                        # leaving the block with an error rolls back
    assert received(listener) == []


def test_a_skipped_duplicate_sends_nothing(listener):
    """ON CONFLICT DO NOTHING inserts no row, so the FOR EACH ROW trigger never runs."""
    with db.connect() as conn:
        row = conn.execute("SELECT station_id, reading_date, reading_time FROM WEATHER_DATA LIMIT 1").fetchone()
        conn.execute(READING + " ON CONFLICT DO NOTHING", (row["station_id"], row["reading_date"], row["reading_time"]))
    assert received(listener) == []


def test_each_committed_warning_change_sends_a_message(listener):
    """Autocommit: the INSERT and the DELETE are two transactions, so two messages."""
    with db.connect() as conn:
        nagpur = conn.execute("SELECT region_id FROM LOCATION WHERE region = 'Nagpur'").fetchone()["region_id"]
        key = (nagpur, OLD_DAY, "Test hazard")
        conn.execute("INSERT INTO REGION_WARNING (region_id, valid_date, hazard, warning_level) "
                     "VALUES (%s, %s, %s, 'Yellow')", key)
        conn.execute("DELETE FROM REGION_WARNING WHERE region_id = %s AND valid_date = %s AND hazard = %s", key)
    assert received(listener) == ["region_warning", "region_warning"]


def test_live_updates_file_can_run_again(database):
    """start.py runs 05_live_updates.sql on every start: it must be safe to repeat."""
    with db.connect() as conn:
        conn.execute((DATABASE_DIR / "05_live_updates.sql").read_text(encoding="utf-8"))
        names = [r["tgname"] for r in conn.execute(
            "SELECT tgname FROM pg_trigger WHERE tgname LIKE '%notify_live' ORDER BY tgname").fetchall()]
    assert names == ["ingestion_run_notify_live", "region_forecast_notify_live",
                     "region_warning_notify_live", "weather_data_notify_live"]


def test_ingestion_run_accepts_live_and_rejects_unknown_types(database):
    with db.connect() as conn:
        with conn.transaction(force_rollback=True):               # try it, then undo
            conn.execute("INSERT INTO INGESTION_RUN (run_type) VALUES ('live')")
        with pytest.raises(psycopg.errors.CheckViolation):        # SQLSTATE 23514
            conn.execute("INSERT INTO INGESTION_RUN (run_type) VALUES ('weekly')")


def test_live_feed_only_adds_readings_newer_than_the_stored_ones():
    from app.ingestion.pipeline import newer_than_stored
    rows = [{"station_id": s, "reading_date": date(2026, 10, 7), "reading_time": time(12, m)}
            for s in (1, 2) for m in (0, 15, 30)]
    latest = {1: datetime(2026, 10, 7, 12, 0)}        # station 1 has 12:00 stored; station 2 has nothing yet
    kept = [(r["station_id"], r["reading_time"].minute) for r in newer_than_stored(rows, latest)]
    assert kept == [(1, 15), (1, 30), (2, 0), (2, 15), (2, 30)]


# ------------------------------------------------------------- the API
def test_live_stream_needs_a_login(client):
    assert client.get("/api/live").status_code == 401
    assert client.get("/api/live", headers={"Authorization": "Bearer not-a-token"}).status_code == 401


def test_hub_gives_every_stream_its_own_copy():
    async def scenario():
        hub = LiveHub()
        hub.bind(asyncio.get_running_loop())
        a, b = hub.subscribe(), hub.subscribe()
        hub.publish_from_thread("weather_data")                   # what the listener thread does
        await asyncio.sleep(0)                                    # let the event loop deliver it
        assert (a.get_nowait(), b.get_nowait()) == ("weather_data", "weather_data")
        hub.unsubscribe(a)
        hub.publish("region_warning")
        assert a.empty() and b.get_nowait() == "region_warning" and hub.listeners == 1

    asyncio.run(scenario())


def test_stream_says_hello_passes_changes_on_and_ends_with_the_login(monkeypatch):
    hub = LiveHub()
    monkeypatch.setattr(live_router, "hub", hub)                  # a hub of its own, not the server's
    monkeypatch.setattr(live_router.settings, "live_heartbeat_seconds", 0.1)
    request = SimpleNamespace(app=SimpleNamespace(state=SimpleNamespace(scheduler=None)))

    async def scenario():
        expires = datetime.now(timezone.utc) + timedelta(seconds=0.5)
        stream = live_router.live_events(request, expires)
        hello = await anext(stream)
        assert hello.startswith("event: hello\n") and hello.endswith("\n\n")
        hub.publish("weather_data")
        change = await anext(stream)
        assert change.startswith("event: change\n") and '"table": "weather_data"' in change
        assert await anext(stream) == ": still here\n\n"         # 0.1 s of quiet: a heartbeat line
        rest = [chunk async for chunk in stream]                  # ends by itself when the login expires
        assert all(chunk == ": still here\n\n" for chunk in rest)
        assert hub.listeners == 0                                 # and leaves the hub

    asyncio.run(scenario())


def test_chart_keeps_one_point_per_hour_while_current_shows_the_newest(client, tokens):
    with db.connect() as conn:
        pune = station_id(conn, "Pune (Shivajinagar)")
        region = conn.execute("SELECT region_id FROM WEATHER_STATION WHERE station_id = %s", (pune,)).fetchone()["region_id"]
        conn.execute("INSERT INTO WEATHER_DATA (station_id, reading_date, reading_time, current_temp, humidity) "
                     "VALUES (%s, CURRENT_DATE, '06:15', 25.5, 81)", (pune,))
    try:
        hourly = client.get(f"/api/regions/{region}/hourly?days=1", headers=tokens["bob"]).json()
        current = client.get(f"/api/regions/{region}/current", headers=tokens["bob"]).json()
        assert hourly and all(row["reading_at"].endswith(":00:00") for row in hourly)
        assert current[0]["reading_at"].endswith("06:15:00")     # the dashboard card shows the 15-minute reading
    finally:
        with db.connect() as conn:
            conn.execute("DELETE FROM WEATHER_DATA WHERE station_id = %s AND reading_date = CURRENT_DATE "
                         "AND reading_time = '06:15'", (pune,))
