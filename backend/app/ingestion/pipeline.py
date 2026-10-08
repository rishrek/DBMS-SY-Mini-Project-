"""
One ingestion run: download from Open-Meteo, derive the values, and store them
in ONE transaction.

    run_ingestion("backfill", days=90)   scripts/backfill.py: the last 90 days, one reading per hour
    run_ingestion("live")                the scheduled job, every 15 minutes (scheduler.py)
    run_ingestion("manual")              like "live": scripts/ingest_now.py, the admin's button,
                                         and start.py's catch-up

Steps
  1. Take the advisory lock, so two runs can never overlap.
  2. Log the run in INGESTION_RUN (status 'running').
  3. Download. No transaction is open while we wait for the internet.
  4. Derive the 22 values of every reading (derive.py). The live feed keeps only
     readings newer than each station's newest stored one.
  5. ONE transaction: insert the readings (ON CONFLICT DO NOTHING; the trigger
     raises warnings) and upsert the forecasts. Either all of it is saved or
     none of it is. When it commits, the live-update triggers tell every open
     dashboard (database/05_live_updates.sql).
  6. Close the log row ('success' or 'failed') and release the lock.
"""
from __future__ import annotations

import logging
from dataclasses import dataclass
from datetime import date, datetime, timedelta
from zoneinfo import ZoneInfo

import psycopg

from .. import db
from ..config import settings
from . import derive, open_meteo

log = logging.getLogger(__name__)

INGESTION_LOCK_KEY = 20260929      # the advisory lock's "name": any fixed number every run agrees on
RUN_TYPES = ("backfill", "live", "manual")
QUARTER = timedelta(minutes=15)    # the live feed's step


class IngestionBusy(RuntimeError):
    """Another ingestion run is holding the lock."""


@dataclass
class RunResult:
    run_id: int
    run_type: str
    readings_fetched: int      # readings built from the download
    readings_inserted: int     # new rows in WEATHER_DATA (the rest were already stored)
    forecasts_saved: int       # REGION_FORECAST rows inserted or updated
    warnings_raised: int       # warnings the trigger created or upgraded
    message: str


def newer_than_stored(readings: list[dict], latest: dict[int, datetime]) -> list[dict]:
    """Keep the readings that are newer than their station's newest stored reading
    (latest = {station_id: newest reading time}; a station with none keeps all)."""
    return [r for r in readings
            if r["station_id"] not in latest
            or datetime.combine(r["reading_date"], r["reading_time"]) > latest[r["station_id"]]]


def now_quarter_ist() -> datetime:
    """The current quarter-hour in IST (12:07 -> 12:00, 12:15 -> 12:15), without a
    time zone attached, like Open-Meteo's times."""
    now = datetime.now(ZoneInfo(settings.timezone))
    return now.replace(minute=now.minute - now.minute % 15, second=0, microsecond=0, tzinfo=None)


def run_ingestion(run_type: str, days: int = 90) -> RunResult:
    """Run one ingestion and return what it did (see the module docstring)."""
    if run_type not in RUN_TYPES:
        raise ValueError(f"run_type must be one of {RUN_TYPES}")

    last_time = now_quarter_ist()            # store nothing after this: later times are forecasts
    today = last_time.date()
    historical = run_type == "backfill"
    # backfill: the last `days` days.  live/manual: yesterday 00:00 onwards, so
    # today's "so far today" values start at 00:00, and a gap of up to a day (a
    # laptop asleep overnight) is filled in.
    first_day = today - timedelta(days=days if historical else 1)

    with db.connect() as conn:
        # 1. one run at a time
        if not conn.execute(db.load_sql("ingestion/try_lock"), {"key": INGESTION_LOCK_KEY}).fetchone()["locked"]:
            raise IngestionBusy("another ingestion run is already in progress; try again in a minute")
        try:
            # 2. log the start (saved at once: autocommit)
            run_id = conn.execute(db.load_sql("ingestion/start_run"), {"run_type": run_type}).fetchone()["run_id"]
            try:
                result = _download_and_store(conn, run_id, run_type, first_day, today, last_time, historical)
            except Exception as exc:
                try:                                  # record the failure, but never hide the real error
                    conn.execute(db.load_sql("ingestion/finish_run"), {
                        "run_id": run_id, "status": "failed", "rows_inserted": 0, "warnings_raised": 0,
                        "message": f"{type(exc).__name__}: {exc}"[:1000],
                    })
                except psycopg.Error:
                    log.warning("Could not record the failure in INGESTION_RUN")
                raise
            # 6. log the result
            conn.execute(db.load_sql("ingestion/finish_run"), {
                "run_id": run_id, "status": "success", "rows_inserted": result.readings_inserted,
                "warnings_raised": result.warnings_raised, "message": result.message,
            })
            return result
        finally:
            if not conn.closed and not conn.broken:     # a lost connection frees the lock anyway
                conn.execute(db.load_sql("ingestion/unlock"), {"key": INGESTION_LOCK_KEY})


def _download_and_store(conn: psycopg.Connection, run_id: int, run_type: str, first_day: date,
                        today: date, last_time: datetime, historical: bool) -> RunResult:
    stations = conn.execute(db.load_sql("ingestion/stations")).fetchall()
    regions = conn.execute(db.load_sql("ingestion/region_centroids")).fetchall()
    if not stations:
        raise RuntimeError("WEATHER_STATION is empty: run database/02_seed.sql first")

    # 3. download. Air quality (and the live feed's weather) start one day earlier,
    #    so the 24-hour PM averages and the one-hour rain windows of the first
    #    readings are complete. The daily forecast changes slowly, so the live job
    #    fetches it on the hour only: fewer calls to Open-Meteo's free service.
    source = "Historical Forecast API, hourly" if historical else "Forecast API, every 15 minutes"
    log.info("Downloading %s to %s for %d stations (%s) ...", first_day, today, len(stations), source)
    if historical:
        weather = open_meteo.fetch_hourly_weather(stations, first_day, today, historical=True)
    else:
        weather = open_meteo.fetch_recent_weather(stations, first_day - timedelta(days=1), today)
    air = open_meteo.fetch_hourly_air_quality(stations, first_day - timedelta(days=1), today)
    forecast_due = run_type != "live" or last_time.minute == 0
    daily = open_meteo.fetch_daily_forecast(regions) if regions and forecast_due else []

    # 4. derive the table rows
    readings: list[dict] = []
    for station, w, a in zip(stations, weather, air):
        if historical:
            readings += derive.build_readings(station["station_id"], w["hourly"], a["hourly"], first_day, last_time)
        else:
            readings += derive.build_readings(station["station_id"], w["minutely_15"], a["hourly"], first_day,
                                              last_time, step=QUARTER, hourly=w["hourly"])
    forecasts: list[dict] = []
    for region, d in zip(regions, daily):
        forecasts += derive.build_forecasts(region["region_id"], d["daily"])
    log.info("Built %d readings and %d forecast days; saving ...", len(readings), len(forecasts))

    # The live feed only adds readings newer than each station's newest stored one,
    # so its 15-minute values never land in between stored hourly readings.
    to_store = readings
    if not historical:
        latest = {r["station_id"]: r["latest"] for r in conn.execute(db.load_sql("ingestion/latest_readings"))}
        to_store = newer_than_stored(readings, latest)

    # 5. store everything in ONE transaction (commits at the end of the block,
    #    or rolls back completely if anything inside fails)
    inserted = forecasts_saved = 0
    with conn.transaction():
        with conn.cursor() as cur:
            if to_store:
                # the same INSERT runs once per reading; rowcount adds up the rows
                # really inserted (skipped duplicates count 0)
                cur.executemany(db.load_sql("ingestion/insert_reading"), to_store)
                inserted = max(cur.rowcount, 0)
            if forecasts:
                cur.executemany(db.load_sql("ingestion/upsert_forecast"), forecasts)
                forecasts_saved = max(cur.rowcount, 0)
        warnings = conn.execute(db.load_sql("ingestion/warnings_this_transaction")).fetchone()["warnings"]

    forecast_note = f"{forecasts_saved} forecast days saved" if forecast_due else "forecast not due (hourly)"
    message = (f"{inserted} new readings ({len(readings) - inserted} already stored or older), "
               f"{forecast_note}, {warnings} warnings raised or upgraded; "
               f"{len(stations)} stations, {first_day} 00:00 to {last_time:%Y-%m-%d %H:%M} IST, "
               f"Open-Meteo {source}")
    return RunResult(run_id, run_type, len(readings), inserted, forecasts_saved, warnings, message)
