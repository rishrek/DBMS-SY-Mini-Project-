"""
Admin warnings: issue, edit and clear (all become source = 'admin').
Clearing keeps the row with level Green, so the trigger can't bring the
warning back that day.
"""
from datetime import date

import psycopg
from fastapi import APIRouter, Depends, HTTPException, Query, status

from ..db import get_conn, load_sql
from ..queries import fetch_all, fetch_one
from ..schemas import WarningClear, WarningEdit, WarningIssue
from ..security import require_admin

router = APIRouter(prefix="/api/admin/warnings", tags=["admin: warnings"],
                   dependencies=[Depends(require_admin)])


def _key(region_id: int, valid_date: date, hazard: str) -> dict:
    return {"region_id": region_id, "valid_date": valid_date, "hazard": hazard}


@router.get("", summary="List warnings (optional filters)")
def list_warnings(region_id: int | None = None, date_from: date | None = None, date_to: date | None = None,
                  source: str | None = Query(None, description="'auto' or 'admin'"),
                  limit: int = Query(200, ge=1, le=1000),
                  conn: psycopg.Connection = Depends(get_conn)):
    params = {"region_id": region_id, "date_from": date_from, "date_to": date_to,
              "source": source, "limit": limit}
    return {"sql": load_sql("admin/warnings_list"), "warnings": fetch_all(conn, "admin/warnings_list", params)}


@router.post("", status_code=status.HTTP_201_CREATED, summary="Issue a warning (replaces an existing one)")
def issue_warning(body: WarningIssue, conn: psycopg.Connection = Depends(get_conn)):
    row = fetch_one(conn, "admin/warning_issue", body.model_dump())
    return {"sql": load_sql("admin/warning_issue"), "warning": row}


@router.put("/{region_id}/{valid_date}/{hazard}", summary="Edit a warning")
def edit_warning(region_id: int, valid_date: date, hazard: str, body: WarningEdit,
                 conn: psycopg.Connection = Depends(get_conn)):
    row = fetch_one(conn, "admin/warning_edit", {**_key(region_id, valid_date, hazard), **body.model_dump()})
    if row is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="No such warning.")
    return {"sql": load_sql("admin/warning_edit"), "warning": row}


@router.post("/{region_id}/{valid_date}/{hazard}/clear", summary="Clear a warning (set it to Green, admin-owned)")
def clear_warning(region_id: int, valid_date: date, hazard: str, body: WarningClear | None = None,
                  conn: psycopg.Connection = Depends(get_conn)):
    note = (body.advisory_text if body and body.advisory_text else "Cleared by admin")
    row = fetch_one(conn, "admin/warning_clear", {**_key(region_id, valid_date, hazard), "advisory_text": note})
    if row is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="No such warning.")
    return {"sql": load_sql("admin/warning_clear"), "warning": row}
