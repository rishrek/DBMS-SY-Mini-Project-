"""
Turns database errors into clear HTTP responses.

The database is the final judge of every rule (CHECK, UNIQUE, FOREIGN KEY,
EXCLUDE). When it refuses something, PostgreSQL reports a five-character
SQLSTATE code; we map that code to an HTTP status and pass along the
constraint's name, so the website can say exactly which rule was broken.
"""
import logging

import psycopg
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse

log = logging.getLogger(__name__)

# SQLSTATE -> (HTTP status, plain explanation)
SQLSTATE_TO_HTTP = {
    "23505": (409, "That value already exists"),                      # unique_violation
    "23503": (409, "That row is linked to a row in another table"),    # foreign_key_violation (NO ACTION; PostgreSQL 16 RESTRICT)
    "23001": (409, "That row is still used by rows in another table"), # restrict_violation (ON DELETE RESTRICT, PostgreSQL 18)
    "23P01": (409, "That overlaps an existing row"),                   # exclusion_violation (AQI bands)
    "23514": (422, "A value breaks a database rule"),                  # check_violation
    "23502": (422, "A required value is missing"),                     # not_null_violation
    "22P02": (422, "A value has the wrong format"),                    # invalid_text_representation
    "22003": (422, "A number is too big for its column"),              # numeric_value_out_of_range
    "22007": (422, "A date or time has the wrong format"),             # invalid_datetime_format
    "22008": (422, "A date or time is out of range"),                  # datetime_field_overflow
}


def register_error_handlers(app: FastAPI) -> None:
    @app.exception_handler(psycopg.OperationalError)
    async def database_unavailable(request: Request, exc: psycopg.OperationalError):
        log.error("Database unavailable: %s", exc)
        return JSONResponse(status_code=503, content={
            "detail": "The database is not reachable. Is PostgreSQL running, and is .env correct?"})

    @app.exception_handler(psycopg.Error)
    async def database_error(request: Request, exc: psycopg.Error):
        diag = exc.diag
        status_code, summary = SQLSTATE_TO_HTTP.get(diag.sqlstate or "", (500, "Database error"))
        if status_code == 500:
            log.exception("Unexpected database error on %s %s", request.method, request.url.path)
        # Errors raised inside the driver (e.g. a missing query parameter) never
        # reached PostgreSQL, so they have no SQLSTATE; show the driver's message.
        message = diag.message_primary or str(exc)
        return JSONResponse(status_code=status_code, content={
            "detail": f"{summary}: {message}",
            "sqlstate": diag.sqlstate,                    # e.g. "23514"
            "constraint": diag.constraint_name,           # e.g. "weather_data_humidity_check"
            "database_message": diag.message_primary,
            "database_detail": diag.message_detail,
        })
