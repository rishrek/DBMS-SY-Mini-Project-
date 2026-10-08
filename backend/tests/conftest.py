"""
Test set-up.

The API tests run against a SEPARATE database, climate_test, rebuilt from
database/01..05 at the start of every run and filled with a little test data.
Your real climate_db is never touched. It uses the same DB_HOST / DB_PORT /
DB_USER / DB_PASSWORD as your .env file.

    cd backend
    .venv/bin/python -m pytest -v
"""
import os
import secrets

# These must be set BEFORE the app is imported, because app/config.py reads them once.
TEST_DB = os.environ.get("TEST_DB_NAME", "climate_test")
if not TEST_DB.endswith("_test"):
    raise RuntimeError("TEST_DB_NAME must end with '_test' (a guard against wiping a real database)")
os.environ["DB_NAME"] = TEST_DB
os.environ["ENABLE_SCHEDULER"] = "false"          # no Open-Meteo downloads during tests
os.environ["JWT_SECRET"] = secrets.token_hex(32)   # a throwaway secret for this run

from pathlib import Path  # noqa: E402

import psycopg  # noqa: E402
import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402
from psycopg import sql  # noqa: E402

from app import db  # noqa: E402
from app.security import hash_password  # noqa: E402

DATABASE_DIR = Path(__file__).resolve().parents[2] / "database"

# Test accounts: fresh random passwords on every run (never real ones).
ACCOUNTS = {
    "admin": {"name": "Test Admin", "email": "admin@example.com", "role": "admin", "region": "Santacruz"},
    "alice": {"name": "Alice (test)", "email": "alice@example.com", "role": "user", "region": "Colaba"},
    "bob":   {"name": "Bob (test)", "email": "bob@example.com", "role": "user", "region": "Pune"},
}
for account in ACCOUNTS.values():
    account["password"] = secrets.token_urlsafe(12)

# A little data: rain builds up at Colaba today until the trigger raises an
# Orange warning; Pune and Nagpur get one quiet reading; Colaba also gets a
# forecast and a lighter day yesterday.
SEED_SQL = """
INSERT INTO WEATHER_DATA (station_id, reading_date, reading_time, current_temp, min_temp, max_temp,
                          humidity, prec_intensity, prec_amount, prec_duration, aqi)
SELECT s.station_id, t.day, t.tm, 27.0, 26.5, 27.5, 95, t.intensity, t.amount, t.hours, 40
FROM WEATHER_STATION s,
     (VALUES (CURRENT_DATE - 1, TIME '10:00', 10.0,  10.0, 1),
             (CURRENT_DATE,     TIME '06:00', 10.0,  10.0, 1),
             (CURRENT_DATE,     TIME '07:00', 60.0,  70.0, 2),
             (CURRENT_DATE,     TIME '08:00', 60.0, 130.0, 3)) AS t (day, tm, intensity, amount, hours)
WHERE s.station_name = 'Mumbai (Colaba)';

INSERT INTO WEATHER_DATA (station_id, reading_date, reading_time, current_temp, min_temp, max_temp,
                          humidity, prec_intensity, prec_amount, prec_duration, aqi)
SELECT station_id, CURRENT_DATE, TIME '06:00', 25.0, 24.0, 25.0, 80, 2.0, 2.0, 1, 60
FROM WEATHER_STATION WHERE station_name IN ('Pune (Shivajinagar)', 'Nagpur (Sonegaon)');

INSERT INTO REGION_FORECAST (region_id, forecast_date, forecast_text, min_temp, max_temp, rain_probability)
SELECT region_id, CURRENT_DATE + g, 'Test forecast', 25.0, 30.0, 50
FROM LOCATION, generate_series(0, 6) AS g
WHERE region = 'Colaba';
"""


@pytest.fixture(scope="session")
def database():
    """Drop and rebuild climate_test, then add the test accounts and data."""
    with psycopg.connect(db.conninfo("postgres"), autocommit=True) as server:
        server.execute(sql.SQL("DROP DATABASE IF EXISTS {} WITH (FORCE)").format(sql.Identifier(TEST_DB)))
        server.execute(sql.SQL("CREATE DATABASE {}").format(sql.Identifier(TEST_DB)))
    with psycopg.connect(db.conninfo(), autocommit=True) as conn:
        for name in ("01_schema.sql", "02_seed.sql", "03_views_functions.sql", "04_triggers.sql",
                     "05_live_updates.sql"):
            conn.execute((DATABASE_DIR / name).read_text(encoding="utf-8"))   # the files use °C, µg/m³
        for a in ACCOUNTS.values():
            conn.execute(db.load_sql("admin/upsert_user"), {
                "region": a["region"], "name": a["name"], "email": a["email"],
                "password_hash": hash_password(a["password"]), "role": a["role"]})
        conn.execute(SEED_SQL)
    yield TEST_DB          # left in place afterwards, for a look in pgAdmin; rebuilt next run


@pytest.fixture(scope="session")
def client(database):
    from app.main import app            # imported here, after the settings above
    with TestClient(app) as test_client:        # "with" runs the start-up (opens the pool)
        yield test_client


@pytest.fixture(scope="session")
def tokens(client):
    """Log every test account in once: {"admin": {"Authorization": "Bearer ..."}, ...}"""
    headers = {}
    for who, a in ACCOUNTS.items():
        response = client.post("/api/auth/login", data={"username": a["email"], "password": a["password"]})
        assert response.status_code == 200, response.text
        headers[who] = {"Authorization": f"Bearer {response.json()['access_token']}"}
    return headers
