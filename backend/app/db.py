"""
Database helpers: connections and SQL files.

Every query the backend runs lives in its own .sql file under app/sql/, so the
exact SQL can be read, run in pgAdmin, and shown on the website. Python only
passes the values, as parameters (%(name)s), which psycopg sends separately
from the SQL text, so SQL injection is not possible.
"""
from collections.abc import Iterator
from contextlib import contextmanager
from pathlib import Path

import psycopg
from psycopg.conninfo import make_conninfo
from psycopg.rows import dict_row
from psycopg.types.numeric import FloatLoader
from psycopg_pool import ConnectionPool

from .config import settings

SQL_DIR = Path(__file__).parent / "sql"

# PostgreSQL "numeric" values arrive in Python as Decimal by default, which JSON
# would turn into text ("25.4"). Reading them as float gives the website real
# numbers for its charts. Exact to the 1 decimal place we store.
psycopg.adapters.register_loader("numeric", FloatLoader)


def conninfo(dbname: str | None = None) -> str:
    """Connection string built from the settings. make_conninfo quotes every value,
    so special characters in the password are safe."""
    return make_conninfo(
        host=settings.db_host,
        port=settings.db_port,
        dbname=dbname or settings.db_name,
        user=settings.db_user,
        password=settings.db_password,
        options=f"-c timezone={settings.timezone}",    # CURRENT_DATE / now() in IST
        client_encoding="utf8",                        # text is UTF-8 on every OS (°C, µg/m³)
        connect_timeout=10,
    )


def connect(autocommit: bool = True) -> psycopg.Connection:
    """Open one connection to climate_db (used by the scripts and the ingestion).

    autocommit=True: each statement is saved at once, unless we open an explicit
    transaction with `with conn.transaction():`, which is how the ingestion
    stores a whole run as one unit. Rows come back as dicts: row["station_id"].
    """
    return psycopg.connect(conninfo(), autocommit=autocommit, row_factory=dict_row)


def load_sql(name: str) -> str:
    """Text of app/sql/<name>.sql, e.g. load_sql("ingestion/insert_reading").
    Read fresh every time (no caching), so an edited .sql file takes effect at
    once, without restarting the server."""
    return (SQL_DIR / f"{name}.sql").read_text(encoding="utf-8")


# ----------------------------------------------------------------------------- pool
# The web server keeps a few connections open (a "pool") and lends one to each
# request, instead of opening a new connection every time.
_pool: ConnectionPool | None = None


def open_pool() -> None:
    global _pool
    _pool = ConnectionPool(
        conninfo(),
        kwargs={"autocommit": True, "row_factory": dict_row},
        min_size=1,
        max_size=10,
        timeout=10,        # a request waits at most 10 s for a free connection
        open=True,
    )


def close_pool() -> None:
    global _pool
    if _pool is not None:
        _pool.close()
        _pool = None


@contextmanager
def borrow() -> Iterator[psycopg.Connection]:
    """Borrow a pool connection for a short block of work, then give it back:
        with db.borrow() as conn: ..."""
    if _pool is None:
        raise RuntimeError("database pool is not open")
    with _pool.connection() as conn:
        yield conn


def get_conn() -> Iterator[psycopg.Connection]:
    """FastAPI dependency: borrow a connection for one request, then give it back."""
    with borrow() as conn:
        yield conn
