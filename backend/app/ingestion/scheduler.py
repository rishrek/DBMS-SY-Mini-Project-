"""
The live feed: runs the ingestion every 15 minutes, IST (00:00:10, 00:15:10,
00:30:10 ...), the fastest Open-Meteo's values change.

The FastAPI app starts this inside the web server. To try it on its own
(it keeps running until you press Ctrl+C):
    cd backend
    .venv/bin/python -m app.ingestion.scheduler
"""
import logging

from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.schedulers.blocking import BlockingScheduler
from apscheduler.triggers.cron import CronTrigger

from ..config import settings
from .pipeline import IngestionBusy, run_ingestion

log = logging.getLogger(__name__)

JOB_ID = "live_ingestion"      # the admin page and the live stream ask the scheduler about this job


def live_job() -> None:
    """One scheduled run. Errors are logged (and saved in INGESTION_RUN), never
    raised, so one bad run (say, no internet) doesn't stop the scheduler."""
    try:
        result = run_ingestion("live")
        log.info("Live ingestion done: %s", result.message)
    except IngestionBusy:
        log.warning("Live ingestion skipped: another run is in progress")
    except Exception:
        log.exception("Live ingestion failed")


def create_scheduler(blocking: bool = False):
    """BackgroundScheduler runs in a thread next to the web server;
    BlockingScheduler takes over the terminal (the __main__ block below)."""
    scheduler_class = BlockingScheduler if blocking else BackgroundScheduler
    scheduler = scheduler_class(timezone=settings.timezone)
    scheduler.add_job(
        live_job,
        # minute="*/15": at :00, :15, :30 and :45. second=10: ten seconds in, so the
        # new quarter-hour has surely begun by this computer's clock.
        CronTrigger(minute="*/15", second=10, timezone=settings.timezone),
        id=JOB_ID,
        max_instances=1,           # never two copies of this job at once
        coalesce=True,             # after the laptop sleeps, do ONE catch-up run, not one per missed quarter
        misfire_grace_time=10 * 60,
    )
    return scheduler


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
    logging.getLogger("httpx").setLevel(logging.WARNING)      # don't print every request URL
    log.info("Scheduler started: ingestion every 15 minutes (IST). Ctrl+C to stop.")
    try:
        create_scheduler(blocking=True).start()
    except (KeyboardInterrupt, SystemExit):
        log.info("Scheduler stopped.")
