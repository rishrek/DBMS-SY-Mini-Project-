"""
Analytics for the DBMS demo. Each endpoint runs ONE query from app/sql/analytics/
and returns the rows together with that exact SQL.

Who may call them:
  the four DBMS-demo queries   the team only (admin login): users never see this page
  user-warning-days            any logged-in user, for their own region (the
                               dashboard's "recent warnings" card); admins may pick anyone
"""
import psycopg
from fastapi import APIRouter, Depends, HTTPException, Query, status

from ..db import get_conn
from ..queries import query_result
from ..schemas import QueryResult
from ..security import get_current_user, require_admin

router = APIRouter(prefix="/api/analytics", tags=["analytics"])
TEAM_ONLY = [Depends(require_admin)]


@router.get("/monthly-temperature", response_model=QueryResult, dependencies=TEAM_ONLY)
def monthly_temperature(min_days: int = Query(20, ge=1, le=31, description="HAVING: minimum days of data"),
                        conn: psycopg.Connection = Depends(get_conn)):
    return query_result(
        conn, "analytics/monthly_temperature", {"min_days": min_days},
        title="Monthly temperature per region",
        description="GROUP BY region and month, then HAVING keeps only months with enough days of data.")


@router.get("/aqi-ranking", response_model=QueryResult, dependencies=TEAM_ONLY)
def aqi_ranking(days: int = Query(30, ge=1, le=365), conn: psycopg.Connection = Depends(get_conn)):
    return query_result(
        conn, "analytics/aqi_ranking", {"days": days},
        title="Regions ranked by average AQI",
        description="Window function RANK() over the regions' average AQI; ties share a rank.")


@router.get("/aqi-moving-average", response_model=QueryResult, dependencies=TEAM_ONLY)
def aqi_moving_average(days: int = Query(30, ge=7, le=365), region_id: int | None = None,
                       conn: psycopg.Connection = Depends(get_conn)):
    return query_result(
        conn, "analytics/aqi_moving_average", {"days": days, "region_id": region_id},
        title="Daily AQI and its 7-day moving average",
        description="Window function AVG() OVER (PARTITION BY region ORDER BY day ROWS 6 PRECEDING).")


@router.get("/rain-above-region-average", response_model=QueryResult, dependencies=TEAM_ONLY)
def rain_above_region_average(limit: int = Query(50, ge=1, le=1000),
                              conn: psycopg.Connection = Depends(get_conn)):
    return query_result(
        conn, "analytics/rain_above_region_average", {"limit": limit},
        title="Station-days wetter than their region's average day",
        description="Correlated subquery: the average is recomputed for each row's own region.")


@router.get("/user-warning-days", response_model=QueryResult)
def user_warning_days(user_id: int | None = Query(None, description="Admins may pick any user; default: yourself"),
                      user: dict = Depends(get_current_user),
                      conn: psycopg.Connection = Depends(get_conn)):
    target = user_id or user["user_id"]
    if target != user["user_id"] and user["role"] != "admin":
        raise HTTPException(status.HTTP_403_FORBIDDEN, detail="You can only look up your own region.")
    return query_result(
        conn, "analytics/user_warning_days", {"user_id": target},
        title="Days my region had an Orange or Red warning",
        description="Multi-table join: APP_USER to LOCATION to REGION_WARNING.")
