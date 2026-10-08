"""
Admin CRUD (Create, Read, Update, Delete) for the poster's 7 tables, plus
WARNING_THRESHOLD so the trigger's thresholds can be tuned from the website.

Each table below is described once (a TableSpec). make_router() turns every
spec into five endpoints:
    GET    /api/admin/<table>          list (with filters and paging)
    GET    /api/admin/<table>/<key>    one row
    POST   /api/admin/<table>          insert
    PUT    /api/admin/<table>/<key>    update
    DELETE /api/admin/<table>/<key>    delete
A composite key is written with slashes, e.g. /api/admin/region-forecast/3/2026-10-01.

Safety: SQL is assembled with psycopg.sql from the table and column names
listed HERE (never from user input), and all values are sent as parameters.
Every response includes the SQL that ran, so the admin page can show it.
"""
from collections.abc import Callable
from dataclasses import dataclass, field
from datetime import date

import psycopg
from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from psycopg import sql
from pydantic import BaseModel

from ..db import get_conn
from ..schemas import (AppUserIn, AppUserUpdate, AqiCategoryIn, AqiCategoryUpdate, LocationIn,
                       RegionForecastIn, RegionForecastUpdate, WarningThresholdIn,
                       WarningThresholdUpdate, WeatherDataIn, WeatherStationIn)
from ..security import hash_password, require_admin


@dataclass(frozen=True)
class TableSpec:
    slug: str                                   # URL name, e.g. "weather-station"
    table: str                                  # SQL name (lower case: how PostgreSQL stores it)
    pk: tuple[str, ...]                         # primary key column(s), in URL order
    pk_types: tuple[type, ...]                  # how to read each key part from the URL
    columns: tuple[str, ...]                    # columns returned (never password_hash)
    create_model: type[BaseModel] | None        # None = no inserting from this page
    update_model: type[BaseModel] | None
    order_by: str                               # fixed ORDER BY, written here (not user input)
    filters: dict[str, tuple[str, str, type]] = field(default_factory=dict)  # ?name=value -> (column, operator, type)
    note: str = ""
    to_db: Callable[[dict], dict] | None = None                        # adjust values before saving
    guard: Callable[[str, dict, dict | None, dict], None] | None = None  # refuse unsafe actions


# ------------------------------------------------------------ APP_USER helpers
def _user_to_db(values: dict) -> dict:
    """Never store a password: replace it with its bcrypt hash (or keep the old hash)."""
    password = values.pop("password", None)
    if password:
        values["password_hash"] = hash_password(password)
    return values


def _user_guard(action: str, key: dict, values: dict | None, admin: dict) -> None:
    """An admin can't delete their own account or take away their own admin role
    (otherwise the site could end up with no admin at all)."""
    if key["pk_user_id"] == admin["user_id"]:
        if action == "delete":
            raise HTTPException(status.HTTP_409_CONFLICT, detail="You can't delete the account you are logged in with.")
        if values is not None and values.get("role") != "admin":
            raise HTTPException(status.HTTP_409_CONFLICT, detail="You can't remove your own admin role.")


WEATHER_DATA_COLUMNS = (
    "weather_id", "station_id", "reading_date", "reading_time", "current_conditions",
    "current_temp", "min_temp", "max_temp", "feels_like", "dew_point", "wet_bulb", "humidity",
    "wind_speed", "wind_direction", "pressure", "prec_type", "prec_probability", "prec_intensity",
    "prec_amount", "prec_duration", "aqi", "visibility", "co2", "pm2_5", "pm10", "ozone",
)

TABLES: list[TableSpec] = [
    TableSpec("location", "location", ("region_id",), (int,), ("region_id", "region"),
              LocationIn, LocationIn, "region"),
    TableSpec("weather-station", "weather_station", ("station_id",), (int,),
              ("station_id", "station_name", "latitude", "longitude", "altitude", "region_id"),
              WeatherStationIn, WeatherStationIn, "station_id",
              filters={"region_id": ("region_id", "=", int)},
              note="A new station gets readings from the next backfill (it is idempotent)."),
    TableSpec("weather-data", "weather_data", ("weather_id",), (int,), WEATHER_DATA_COLUMNS,
              WeatherDataIn, WeatherDataIn, "reading_date DESC, reading_time DESC, station_id",
              filters={"station_id": ("station_id", "=", int),
                       "date_from": ("reading_date", ">=", date),
                       "date_to": ("reading_date", "<=", date)},
              note="Inserting a reading fires the warning trigger. prec_amount = mm since 00:00."),
    TableSpec("aqi-category", "aqi_category", ("category",), (str,), ("category", "aqi_min", "aqi_max"),
              AqiCategoryIn, AqiCategoryUpdate, "aqi_min",
              note="The EXCLUDE constraint refuses a band that overlaps another."),
    TableSpec("app-user", "app_user", ("user_id",), (int,),
              ("user_id", "region_id", "name", "email", "role", "created_at"),
              AppUserIn, AppUserUpdate, "user_id",
              filters={"region_id": ("region_id", "=", int), "role": ("role", "=", str)},
              note="Passwords are stored only as bcrypt hashes. Leave password empty to keep it.",
              to_db=_user_to_db, guard=_user_guard),
    TableSpec("region-forecast", "region_forecast", ("region_id", "forecast_date"), (int, date),
              ("region_id", "forecast_date", "forecast_text", "min_temp", "max_temp", "rain_probability"),
              RegionForecastIn, RegionForecastUpdate, "forecast_date DESC, region_id",
              filters={"region_id": ("region_id", "=", int),
                       "date_from": ("forecast_date", ">=", date),
                       "date_to": ("forecast_date", "<=", date)},
              note="The hourly job replaces forecasts with the newest ones (upsert)."),
    TableSpec("region-warning", "region_warning", ("region_id", "valid_date", "hazard"), (int, date, str),
              ("region_id", "valid_date", "hazard", "warning_level", "advisory_text", "source", "issued_at"),
              None, None, "valid_date DESC, region_id, hazard",
              filters={"region_id": ("region_id", "=", int), "source": ("source", "=", str),
                       "date_from": ("valid_date", ">=", date), "date_to": ("valid_date", "<=", date)},
              note="Issue, edit and clear warnings on the Warnings page. Deleting an automatic "
                   "warning lets the trigger raise it again at the next reading; clearing does not."),
    TableSpec("warning-threshold", "warning_threshold", ("hazard", "warning_level"), (str, str),
              ("hazard", "warning_level", "min_value", "advisory_text"),
              WarningThresholdIn, WarningThresholdUpdate, "hazard, min_value",
              note="The trigger reads these numbers; changing one takes effect for the next reading."),
]


# ------------------------------------------------------------------ helpers
def _convert(raw: str, typ: type, name: str):
    try:
        return date.fromisoformat(raw) if typ is date else typ(raw)
    except ValueError:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, detail=f"Bad value for {name}: {raw!r}")


def _key_params(spec: TableSpec, key: str) -> dict:
    """'3/2026-10-01' -> {'pk_region_id': 3, 'pk_forecast_date': date(2026, 10, 1)}"""
    parts = key.split("/")
    if len(parts) != len(spec.pk):
        raise HTTPException(status.HTTP_404_NOT_FOUND,
                            detail=f"The key for {spec.table.upper()} is: {' / '.join(spec.pk)}")
    return {f"pk_{col}": _convert(part, typ, col) for col, typ, part in zip(spec.pk, spec.pk_types, parts)}


def make_router(spec: TableSpec) -> APIRouter:
    router = APIRouter(prefix=f"/api/admin/{spec.slug}", tags=[f"admin: {spec.table.upper()}"])
    table = sql.Identifier(spec.table)
    columns = sql.SQL(", ").join(map(sql.Identifier, spec.columns))
    key_match = sql.SQL(" AND ").join(
        sql.SQL("{} = {}").format(sql.Identifier(c), sql.Placeholder(f"pk_{c}")) for c in spec.pk)

    @router.get("", summary=f"List {spec.table.upper()} rows")
    def list_rows(request: Request,
                  limit: int = Query(50, ge=1, le=500), offset: int = Query(0, ge=0),
                  conn: psycopg.Connection = Depends(get_conn), _admin: dict = Depends(require_admin)):
        conditions, params = [], {}
        for name, (column, operator, typ) in spec.filters.items():
            raw = request.query_params.get(name)
            if raw not in (None, ""):
                params[name] = _convert(raw, typ, name)
                conditions.append(sql.SQL("{} {} {}").format(
                    sql.Identifier(column), sql.SQL(operator), sql.Placeholder(name)))
        where = sql.SQL(" WHERE ") + sql.SQL(" AND ").join(conditions) if conditions else sql.SQL("")
        query = sql.SQL("SELECT {columns} FROM {table}{where} ORDER BY {order} LIMIT {limit} OFFSET {offset}").format(
            columns=columns, table=table, where=where, order=sql.SQL(spec.order_by),
            limit=sql.Placeholder("limit"), offset=sql.Placeholder("offset"))
        count_query = sql.SQL("SELECT count(*) AS total FROM {table}{where}").format(table=table, where=where)
        rows = conn.execute(query, {**params, "limit": limit, "offset": offset}).fetchall()
        total = conn.execute(count_query, params).fetchone()["total"]
        return {"table": spec.table.upper(), "sql": query.as_string(conn), "params": params,
                "rows": rows, "total": total, "limit": limit, "offset": offset}

    @router.get("/{key:path}", summary=f"One {spec.table.upper()} row")
    def get_row(key: str, conn: psycopg.Connection = Depends(get_conn),
                _admin: dict = Depends(require_admin)):
        query = sql.SQL("SELECT {columns} FROM {table} WHERE {match}").format(
            columns=columns, table=table, match=key_match)
        row = conn.execute(query, _key_params(spec, key)).fetchone()
        if row is None:
            raise HTTPException(status.HTTP_404_NOT_FOUND, detail="No such row.")
        return {"sql": query.as_string(conn), "row": row}

    if spec.create_model is not None:
        CreateModel = spec.create_model

        @router.post("", status_code=status.HTTP_201_CREATED, summary=f"Insert a {spec.table.upper()} row")
        def create_row(body: CreateModel, conn: psycopg.Connection = Depends(get_conn),
                       _admin: dict = Depends(require_admin)):
            values = body.model_dump()
            if spec.to_db:
                values = spec.to_db(values)
            names = list(values)
            query = sql.SQL("INSERT INTO {table} ({names}) VALUES ({values}) RETURNING {columns}").format(
                table=table, names=sql.SQL(", ").join(map(sql.Identifier, names)),
                values=sql.SQL(", ").join(map(sql.Placeholder, names)), columns=columns)
            row = conn.execute(query, values).fetchone()
            return {"sql": query.as_string(conn), "row": row}

    if spec.update_model is not None:
        UpdateModel = spec.update_model

        @router.put("/{key:path}", summary=f"Update a {spec.table.upper()} row")
        def update_row(key: str, body: UpdateModel, conn: psycopg.Connection = Depends(get_conn),
                       admin: dict = Depends(require_admin)):
            key_params = _key_params(spec, key)
            values = body.model_dump()
            if spec.to_db:
                values = spec.to_db(values)
            if spec.guard:
                spec.guard("update", key_params, values, admin)
            assignments = sql.SQL(", ").join(
                sql.SQL("{} = {}").format(sql.Identifier(n), sql.Placeholder(n)) for n in values)
            query = sql.SQL("UPDATE {table} SET {assignments} WHERE {match} RETURNING {columns}").format(
                table=table, assignments=assignments, match=key_match, columns=columns)
            row = conn.execute(query, {**values, **key_params}).fetchone()
            if row is None:
                raise HTTPException(status.HTTP_404_NOT_FOUND, detail="No such row.")
            return {"sql": query.as_string(conn), "row": row}

    @router.delete("/{key:path}", summary=f"Delete a {spec.table.upper()} row")
    def delete_row(key: str, conn: psycopg.Connection = Depends(get_conn),
                   admin: dict = Depends(require_admin)):
        key_params = _key_params(spec, key)
        if spec.guard:
            spec.guard("delete", key_params, None, admin)
        query = sql.SQL("DELETE FROM {table} WHERE {match} RETURNING {pk}").format(
            table=table, match=key_match, pk=sql.SQL(", ").join(map(sql.Identifier, spec.pk)))
        row = conn.execute(query, key_params).fetchone()
        if row is None:
            raise HTTPException(status.HTTP_404_NOT_FOUND, detail="No such row.")
        return {"sql": query.as_string(conn), "deleted": row}

    return router


# ------------------------------------------------------- table list for the UI
meta_router = APIRouter(prefix="/api/admin", tags=["admin: tables"])


@meta_router.get("/tables", summary="Which tables the admin page can edit, and their form fields")
def list_tables(_admin: dict = Depends(require_admin)):
    return [{
        "slug": s.slug,
        "table": s.table.upper(),
        "primary_key": list(s.pk),
        "columns": list(s.columns),
        "filters": list(s.filters),
        "can_create": s.create_model is not None,
        "can_update": s.update_model is not None,
        "create_schema": s.create_model.model_json_schema() if s.create_model else None,
        "update_schema": s.update_model.model_json_schema() if s.update_model else None,
        "note": s.note,
    } for s in TABLES]


table_routers = [make_router(spec) for spec in TABLES]
