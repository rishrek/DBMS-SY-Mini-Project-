"""
The admin's "Run ingestion" button and the run log (INGESTION_RUN).

The endpoint is a plain `def`, so FastAPI runs it in a worker thread: a
backfill takes around 15 seconds and must not freeze the rest of the website.
"""
from dataclasses import asdict

import psycopg
from fastapi import APIRouter, Depends, HTTPException, Query, Request, status

from ..db import get_conn, load_sql
from ..ingestion.open_meteo import OpenMeteoError
from ..ingestion.pipeline import IngestionBusy, run_ingestion
from ..ingestion.scheduler import JOB_ID
from ..queries import fetch_all
from ..schemas import IngestionRequest
from ..security import require_admin

router = APIRouter(prefix="/api/admin/ingestion", tags=["admin: ingestion"],
                   dependencies=[Depends(require_admin)])


@router.post("/run", summary="Run an ingestion now ('manual' = like the 15-minute job; 'backfill' = N days, hourly)")
def run_now(body: IngestionRequest):
    run_type = "backfill" if body.mode == "backfill" else "manual"
    try:
        result = run_ingestion(run_type, days=body.days)
    except IngestionBusy as exc:
        raise HTTPException(status.HTTP_409_CONFLICT, detail=str(exc))
    except OpenMeteoError as exc:
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, detail=f"Could not download from Open-Meteo: {exc}")
    return asdict(result)


@router.get("/runs", summary="The ingestion log, newest first, and the next scheduled run")
def runs(request: Request, limit: int = Query(20, ge=1, le=200),
         conn: psycopg.Connection = Depends(get_conn)):
    scheduler = getattr(request.app.state, "scheduler", None)
    job = scheduler.get_job(JOB_ID) if scheduler else None
    return {
        "sql": load_sql("admin/ingestion_runs"),
        "runs": fetch_all(conn, "admin/ingestion_runs", {"limit": limit}),
        "scheduler_running": job is not None,
        "next_scheduled_run": job.next_run_time if job else None,
    }
