"""Small helpers to run a named SQL file (app/sql/<name>.sql)."""
from typing import Any

import psycopg

from .db import load_sql
from .schemas import QueryResult


def fetch_all(conn: psycopg.Connection, name: str, params: dict | None = None) -> list[dict]:
    return conn.execute(load_sql(name), params or {}).fetchall()


def fetch_one(conn: psycopg.Connection, name: str, params: dict | None = None) -> dict | None:
    return conn.execute(load_sql(name), params or {}).fetchone()


def query_result(conn: psycopg.Connection, name: str, params: dict[str, Any],
                 title: str, description: str) -> QueryResult:
    """Run the query and return its rows TOGETHER WITH the exact SQL text, so the
    Analytics and Integrity pages can show the SQL next to each result."""
    cursor = conn.execute(load_sql(name), params)
    rows = cursor.fetchall()
    columns = [column.name for column in cursor.description] if cursor.description else []
    return QueryResult(title=title, description=description, sql=load_sql(name),
                       params=params, columns=columns, rows=rows)
