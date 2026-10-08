"""
The poster's Table 4 checks, run live on the current data. Each check is one
query from app/sql/integrity/; the page shows the SQL, the numbers and PASS/FAIL.
The team only (admin login): the checks show table names and row counts.
"""
from collections.abc import Callable
from dataclasses import dataclass

import psycopg
from fastapi import APIRouter, Depends

from ..db import get_conn
from ..queries import query_result
from ..security import require_admin

router = APIRouter(prefix="/api", tags=["integrity"], dependencies=[Depends(require_admin)])

CORE_TABLES = {"LOCATION", "WEATHER_STATION", "AQI_CATEGORY", "WARNING_THRESHOLD"}


@dataclass(frozen=True)
class Check:
    sql_name: str
    title: str
    description: str
    expected: str
    judge: Callable[[list[dict]], tuple[bool, str]]     # rows -> (passed?, one-line summary)


def _row_counts(rows):
    counts = {r["table_name"]: r["row_count"] for r in rows}
    empty = sorted(t for t in CORE_TABLES if counts.get(t, 0) == 0)
    summary = ", ".join(f"{t} {n:,}" for t, n in counts.items())
    return (not empty, summary if not empty else f"empty reference tables: {', '.join(empty)}")


def _zero(column: str, checked: str | None = None, what: str = ""):
    """Passes when rows[0][column] is 0, e.g. '21,830 readings checked, 0 mismatches'."""
    def judge(rows):
        r = rows[0]
        prefix = f"{r[checked]:,} {what} checked, " if checked else ""
        return (r[column] == 0, f"{prefix}{r[column]} {column.replace('_', ' ')}")
    return judge


def _except(rows):
    r = rows[0]
    return (r["only_in_view"] == 0 and r["only_in_max_method"] == 0,
            f"{r['only_in_view']} rows only in the view, {r['only_in_max_method']} only in the MAX method")


CHECKS = [
    Check("integrity/row_counts", "Rows in each table",
          "Poster Table 4, first check: every table is readable and the reference tables are filled.",
          "reference tables not empty", _row_counts),
    Check("integrity/aqi_band_mismatches", "Stored AQI vs the CPCB bands",
          "Every stored AQI must fall in exactly one AQI_CATEGORY band.",
          "0 mismatches", _zero("mismatches", "readings_checked", "readings")),
    Check("integrity/user_region_conflicts", "User's region vs reading's region",
          "The readings the Home page shows each user must come from the user's own region.",
          "0 conflicts", _zero("conflicts", "pairs_checked", "user-reading pairs")),
    Check("integrity/aqi_band_overlaps", "No two AQI bands overlap",
          "Self-join on AQI_CATEGORY with the range-overlap operator &&.",
          "0 overlapping pairs", _zero("overlapping_pairs")),
    Check("integrity/aqi_band_gaps", "No gaps between AQI bands",
          "Every whole AQI value 0-500 must belong to a band (generate_series + LEFT JOIN).",
          "0 uncovered values", _zero("uncovered_values")),
    Check("integrity/current_conditions_except", "Latest readings, EXCEPT both ways",
          "v_current_conditions (DISTINCT ON) vs an independent GROUP BY + MAX method.",
          "0 and 0 rows different", _except),
]


@router.get("/integrity", summary="Re-run the poster's Table 4 checks on the live data")
def integrity(conn: psycopg.Connection = Depends(get_conn)):
    results = []
    for check in CHECKS:
        result = query_result(conn, check.sql_name, {}, check.title, check.description)
        passed, summary = check.judge(result.rows)
        results.append({**result.model_dump(), "expected": check.expected,
                        "passed": passed, "summary": summary})
    return {"all_passed": all(r["passed"] for r in results), "checks": results}
