"""
Get the database ready for the website. start.py runs this before it starts the
servers; you can also run it on its own:

    cd backend
    .venv/bin/python -m scripts.prepare

Every step checks first, so running it again only does what is still missing:
  1. create the database climate_db if it doesn't exist   (what database/00 does)
  2. build the tables if they don't exist                 (runs database/01 to 04, in order)
  3. switch on the live updates                           (runs database/05 every time: it is
                                                           safe to repeat, and this is how a
                                                           database built earlier gets it)
  4. load 90 days of readings if there are none, or catch up if the newest
     reading is more than 15 minutes old                 (what scripts/backfill.py does)
  5. create the admin account if it doesn't exist         (what scripts/create_users.py does)

Exit codes, which start.py reads: 0 ready, 2 PostgreSQL not reachable,
3 wrong PostgreSQL password, 1 anything else.
"""
import logging
import sys
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

import psycopg
from psycopg import sql

from app import db
from app.config import PROJECT_ROOT, settings
from app.ingestion.open_meteo import OpenMeteoError
from app.ingestion.pipeline import IngestionBusy, run_ingestion
from app.queries import fetch_one

BUILD_FILES = ("01_schema.sql", "02_seed.sql", "03_views_functions.sql", "04_triggers.sql")
LIVE_FILE = "05_live_updates.sql"
NOT_REACHABLE, WRONG_PASSWORD = 2, 3


def done(message: str) -> None:
    print(f"  [ok] {message}", flush=True)


def note(message: str) -> None:
    print(f"  [!]  {message}", flush=True)


def ensure_database() -> None:
    """Step 1, connected to the server's built-in "postgres" database."""
    with psycopg.connect(db.conninfo("postgres"), autocommit=True) as server:
        if server.execute(db.load_sql("setup/database_exists"), {"name": settings.db_name}).fetchone():
            return done(f"database {settings.db_name} exists")
        # A database name can't be a query parameter, so it is quoted with sql.Identifier.
        # UTF8 on purpose: the SQL files contain °C and µg/m³ (this matters on Windows).
        name = sql.Identifier(settings.db_name)
        try:
            server.execute(sql.SQL("CREATE DATABASE {} TEMPLATE template0 ENCODING 'UTF8'").format(name))
        except psycopg.Error:                      # a server whose locale can't do UTF8: use its default
            server.execute(sql.SQL("CREATE DATABASE {}").format(name))
        done(f"created database {settings.db_name}")


def ensure_tables(conn: psycopg.Connection) -> None:
    """Step 2: the same four files, in the same order, as README step 3."""
    if fetch_one(conn, "setup/tables_exist")["tables_exist"]:
        return done("tables exist")
    for name in BUILD_FILES:
        conn.execute((PROJECT_ROOT / "database" / name).read_text(encoding="utf-8"))
        done(f"ran database/{name}")


def ensure_live_updates(conn: psycopg.Connection) -> None:
    """Step 3: the pg_notify triggers and the 'live' run type. The file only uses
    CREATE OR REPLACE, DROP ... IF EXISTS and COMMENT, so running it every time is safe."""
    conn.execute((PROJECT_ROOT / "database" / LIVE_FILE).read_text(encoding="utf-8"))
    done("live updates switched on")


def ensure_readings(conn: psycopg.Connection) -> None:
    """Step 4. Readings are write-once (ON CONFLICT DO NOTHING), so a catch-up never duplicates anything."""
    latest = fetch_one(conn, "public/health")["latest_reading"]
    now = datetime.now(ZoneInfo(settings.timezone)).replace(tzinfo=None)
    try:
        if latest is None:
            print("  ...  loading 90 days of readings from Open-Meteo (about 15 seconds)", flush=True)
            result = run_ingestion("backfill", days=90)
        elif now - latest > timedelta(minutes=15):
            days_behind = (now.date() - latest.date()).days
            print(f"  ...  newest reading is from {latest:%d %b %H:%M}; catching up from Open-Meteo", flush=True)
            # the live job's download (from yesterday 00:00) covers a gap of up to a day
            result = run_ingestion("manual") if days_behind <= 1 else run_ingestion("backfill", days=min(days_behind + 1, 365))
        else:
            return done(f"readings are up to date (newest {latest:%d %b %H:%M})")
        done(f"{result.readings_inserted} new readings stored, {result.warnings_raised} warnings raised")
    except OpenMeteoError as exc:
        note(f"could not download from Open-Meteo ({exc}). The website still works with the data already stored.")
    except IngestionBusy:
        note("another data load is running right now, so this one was skipped")


def ensure_admin(conn: psycopg.Connection) -> None:
    """Step 5."""
    email = settings.admin_email.strip().lower()
    if not email or not settings.admin_password:
        return note("ADMIN_EMAIL or ADMIN_PASSWORD is empty in .env, so there is no admin login yet")
    if fetch_one(conn, "auth/user_by_email", {"email": email}):
        return done(f"admin account {email} exists")
    from scripts import create_users           # the same script as README step 7
    create_users.main()


def explain_connection_error(exc: psycopg.OperationalError) -> int:
    text = str(exc).strip()
    first_line = text.splitlines()[0] if text else repr(exc)
    lowered = text.lower()
    if "password authentication failed" in lowered or "no password supplied" in lowered:
        print(f"\nPostgreSQL refused the password for user '{settings.db_user}'.")
        return WRONG_PASSWORD
    if "role" in lowered and "does not exist" in lowered:
        print(f"\nPostgreSQL has no user called '{settings.db_user}'. Put the right user name in DB_USER in .env.")
        return 1
    print(f"\nCould not reach PostgreSQL at {settings.db_host}:{settings.db_port}:\n  {first_line}")
    return NOT_REACHABLE


def main() -> int:
    logging.basicConfig(level=logging.INFO, format="  ...  %(message)s")
    logging.getLogger("httpx").setLevel(logging.WARNING)       # don't print every request URL
    print(f"Preparing the database ({settings.db_name} on {settings.db_host}:{settings.db_port}):", flush=True)
    try:
        ensure_database()
        with db.connect() as conn:
            ensure_tables(conn)
            ensure_live_updates(conn)
            ensure_readings(conn)
            ensure_admin(conn)
    except psycopg.OperationalError as exc:
        return explain_connection_error(exc)
    return 0


if __name__ == "__main__":
    sys.exit(main())
