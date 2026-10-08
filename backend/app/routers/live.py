"""
GET /api/live: a stream that tells the browser when something changed.

The browser keeps this one request open. The server writes short text messages
into it ("Server-Sent Events"), each ending with a blank line:

    event: change
    data: {"table": "region_warning", "next_update": "2026-10-07T12:30:10+05:30"}

The page then fetches the parts that show that table again, through the usual
endpoints and their login rules. The stream itself carries no weather data.
"""
import asyncio
import json
from datetime import datetime, timezone
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Depends, Request
from fastapi.responses import StreamingResponse

from ..config import settings
from ..ingestion.scheduler import JOB_ID
from ..live import hub
from ..security import login_for_stream, oauth2_scheme

router = APIRouter(prefix="/api", tags=["live"])


def next_update(request: Request) -> str | None:
    """When the 15-minute job runs next (None if the scheduler is switched off)."""
    scheduler = getattr(request.app.state, "scheduler", None)
    job = scheduler.get_job(JOB_ID) if scheduler else None
    return job.next_run_time.isoformat() if job and job.next_run_time else None


def sse(event: str, data: dict) -> str:
    """One Server-Sent Event: an 'event:' line, a 'data:' line, then a blank line."""
    return f"event: {event}\ndata: {json.dumps(data)}\n\n"


async def live_events(request: Request, expires_at: datetime):
    """The stream: 'hello' first, then one 'change' per database change, and a
    comment line whenever it's quiet. It ends when the login expires; the browser
    then reconnects, and goes to the login page if the login is no longer valid."""
    queue = hub.subscribe()
    try:
        yield sse("hello", {"server_time": datetime.now(ZoneInfo(settings.timezone)).isoformat(),
                            "next_update": next_update(request)})
        while True:
            seconds_left = (expires_at - datetime.now(timezone.utc)).total_seconds()
            if seconds_left <= 0:
                break
            try:
                table = await asyncio.wait_for(queue.get(), timeout=min(settings.live_heartbeat_seconds, seconds_left))
            except asyncio.TimeoutError:
                yield ": still here\n\n"       # a comment line: the browser ignores it, the connection stays open
                continue
            yield sse("change", {"table": table, "next_update": next_update(request)})
    finally:
        hub.unsubscribe(queue)                # the browser left, or the login expired


@router.get("/live", summary="Live updates: a stream that says when readings, warnings or forecasts change")
def live(request: Request, token: str | None = Depends(oauth2_scheme)):
    _user, expires_at = login_for_stream(token)          # 401 if not logged in
    return StreamingResponse(
        live_events(request, expires_at),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},   # don't store or buffer the stream
    )
