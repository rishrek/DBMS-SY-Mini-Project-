"""
What the website shows.

Two groups, each with ONE access rule written on its router:
  router     open to everyone: the health check (start.py waits for it) and the
             region list (the Register page needs it before anyone has an account)
  dashboard  needs a login: everything that shows readings, warnings or forecasts
"""
from datetime import date, datetime, timedelta
from zoneinfo import ZoneInfo

import psycopg
from fastapi import APIRouter, Depends, HTTPException, Query, status

from ..config import settings
from ..db import get_conn
from ..queries import fetch_all, fetch_one
from ..security import get_current_user

router = APIRouter(prefix="/api", tags=["open"])
dashboard = APIRouter(prefix="/api", tags=["dashboard"], dependencies=[Depends(get_current_user)])


def _today() -> date:
    return datetime.now(ZoneInfo(settings.timezone)).date()


def _region_or_404(conn: psycopg.Connection, region_id: int) -> dict:
    region = fetch_one(conn, "public/region_by_id", {"region_id": region_id})
    if region is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail=f"No region with id {region_id}.")
    return region


@router.get("/health", summary="Is the API up, and can it reach the database?")
def health(conn: psycopg.Connection = Depends(get_conn)):
    return {"status": "ok", **fetch_one(conn, "public/health")}


@router.get("/regions", summary="All regions (for the region pickers)")
def regions(conn: psycopg.Connection = Depends(get_conn)):
    return fetch_all(conn, "public/regions")


@dashboard.get("/regions/{region_id}/warnings/today",
               summary="Is there a warning for this region today? (the dashboard's first question)")
def warnings_today(region_id: int, conn: psycopg.Connection = Depends(get_conn)):
    region = _region_or_404(conn, region_id)
    warnings = fetch_all(conn, "public/warnings_today", {"region_id": region_id})
    highest = warnings[0]["warning_level"] if warnings else "Green"     # sorted most serious first
    return {
        "region_id": region_id,
        "region": region["region"],
        "date": _today(),
        "highest_level": highest,
        "has_warning": highest != "Green",
        "warnings": warnings,
    }


@dashboard.get("/stations/map", summary="Every station with today's warning colour and latest reading")
def stations_map(conn: psycopg.Connection = Depends(get_conn)):
    return fetch_all(conn, "public/stations_map")


@dashboard.get("/stations/{station_id}/latest", summary="A station's latest reading (all 22 values)")
def station_latest(station_id: int, conn: psycopg.Connection = Depends(get_conn)):
    row = fetch_one(conn, "public/station_latest", {"station_id": station_id})
    if row is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="This station has no readings yet.")
    return row


@dashboard.get("/regions/{region_id}/current", summary="Current conditions for a region")
def region_current(region_id: int, conn: psycopg.Connection = Depends(get_conn)):
    _region_or_404(conn, region_id)
    return fetch_all(conn, "public/region_current", {"region_id": region_id})


@dashboard.get("/regions/{region_id}/forecast", summary="7-day forecast for a region")
def region_forecast(region_id: int, conn: psycopg.Connection = Depends(get_conn)):
    _region_or_404(conn, region_id)
    return fetch_all(conn, "public/region_forecast", {"region_id": region_id})


@dashboard.get("/regions/{region_id}/hourly", summary="Hourly temperature and humidity (chart)")
def region_hourly(region_id: int, days: int = Query(7, ge=1, le=90),
                  conn: psycopg.Connection = Depends(get_conn)):
    _region_or_404(conn, region_id)
    return fetch_all(conn, "public/region_hourly", {"region_id": region_id, "days": days})


@dashboard.get("/regions/{region_id}/today", summary="Today's readings on the hour (the dashboard's hour cards)")
def region_today(region_id: int, conn: psycopg.Connection = Depends(get_conn)):
    _region_or_404(conn, region_id)
    return fetch_all(conn, "public/region_today", {"region_id": region_id})


@dashboard.get("/regions/{region_id}/daily",
               summary="One row per day: rainfall, AQI, temperatures (from region_daily_summary)")
def region_daily(region_id: int, date_from: date | None = None, date_to: date | None = None,
                 conn: psycopg.Connection = Depends(get_conn)):
    _region_or_404(conn, region_id)
    date_to = date_to or _today()
    date_from = date_from or date_to - timedelta(days=29)          # default: the last 30 days
    if date_from > date_to:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, detail="date_from is after date_to.")
    return fetch_all(conn, "public/region_daily",
                     {"region_id": region_id, "date_from": date_from, "date_to": date_to})


@router.get("/aqi-categories", summary="The CPCB AQI bands")
def aqi_categories(conn: psycopg.Connection = Depends(get_conn)):
    return fetch_all(conn, "public/aqi_categories")
