"""
Tests for the critical API endpoints, run against the climate_test database
(see conftest.py). They cover login and roles, who may see what, the dashboard's
answers, the database's own rules seen through the API, the trigger, the warnings
workflow, the analytics SQL and the integrity checks.

tokens["alice"] and tokens["bob"] are normal users; tokens["admin"] is the team.
"""
import pytest


# ------------------------------------------------------------------- helpers
def region_id(client, name: str) -> int:
    return next(r["region_id"] for r in client.get("/api/regions").json() if r["region"] == name)


def station_id(client, auth: dict, name: str) -> int:
    stations = client.get("/api/stations/map", headers=auth).json()
    return next(s["station_id"] for s in stations if s["station_name"] == name)


def today(client, auth: dict) -> str:
    """Today's date as the API sees it (IST)."""
    return client.get(f"/api/regions/{region_id(client, 'Pune')}/warnings/today", headers=auth).json()["date"]


def test_health(client):
    response = client.get("/api/health")
    assert response.status_code == 200 and response.json()["status"] == "ok"


# ------------------------------------------------------------------- auth
def test_register_login_and_me(client):
    body = {"name": "New User", "email": "New.User@Example.com", "password": "a-long-test-pass",
            "region_id": region_id(client, "Thane")}
    created = client.post("/api/auth/register", json=body)
    assert created.status_code == 201, created.text
    assert created.json()["email"] == "new.user@example.com"       # stored in lower case
    assert created.json()["role"] == "user"                         # self-registration is never admin

    login = client.post("/api/auth/login", data={"username": "new.user@example.com", "password": "a-long-test-pass"})
    assert login.status_code == 200
    me = client.get("/api/auth/me", headers={"Authorization": f"Bearer {login.json()['access_token']}"})
    assert me.json()["region"] == "Thane"


def test_duplicate_email_is_refused(client):
    body = {"name": "Twin", "email": "twin@example.com", "password": "a-long-test-pass",
            "region_id": region_id(client, "Vashi")}
    assert client.post("/api/auth/register", json=body).status_code == 201
    assert client.post("/api/auth/register", json=body).status_code == 409   # UNIQUE(email)


def test_wrong_password_and_short_password(client):
    assert client.post("/api/auth/login", data={"username": "alice@example.com", "password": "nope-nope"}).status_code == 401
    body = {"name": "Short", "email": "short@example.com", "password": "short", "region_id": 1}
    assert client.post("/api/auth/register", json=body).status_code == 422   # Pydantic: under 8 characters


def test_admin_routes_need_an_admin(client, tokens):
    assert client.get("/api/admin/location").status_code == 401                        # not logged in
    assert client.get("/api/admin/location", headers=tokens["alice"]).status_code == 403  # a normal user
    response = client.get("/api/admin/location", headers=tokens["admin"])
    assert response.status_code == 200
    assert response.json()["total"] >= 10 and "SELECT" in response.json()["sql"]


def test_password_hash_is_never_returned(client, tokens):
    rows = client.get("/api/admin/app-user", headers=tokens["admin"]).json()["rows"]
    assert rows and all("password_hash" not in row for row in rows)


# ------------------------------------------------------------- who may see what
DASHBOARD = ("/api/stations/map", "/api/regions/{r}/warnings/today", "/api/regions/{r}/current",
             "/api/regions/{r}/forecast", "/api/regions/{r}/hourly", "/api/regions/{r}/daily",
             "/api/regions/{r}/today")
TEAM_ONLY = ("/api/analytics/monthly-temperature", "/api/analytics/aqi-ranking",
             "/api/analytics/aqi-moving-average", "/api/analytics/rain-above-region-average", "/api/integrity")


def test_access_rules(client, tokens):
    """Visitors get only the open endpoints, users also get the dashboard, and only the team gets the rest."""
    colaba = region_id(client, "Colaba")
    for path in ("/api/health", "/api/regions", "/api/aqi-categories"):     # open: start.py and Register need these
        assert client.get(path).status_code == 200, path
    station = station_id(client, tokens["alice"], "Mumbai (Colaba)")
    for path in [p.format(r=colaba) for p in DASHBOARD] + [f"/api/stations/{station}/latest"]:
        assert client.get(path).status_code == 401, path                         # a visitor: log in first
        assert client.get(path, headers=tokens["alice"]).status_code == 200, path
    for path in TEAM_ONLY:
        assert client.get(path).status_code == 401, path
        assert client.get(path, headers=tokens["alice"]).status_code == 403, path   # a user: not for them
        assert client.get(path, headers=tokens["admin"]).status_code == 200, path


# ------------------------------------------------------------ dashboard answers
def test_today_hour_cards(client, tokens):
    """Colaba's seed readings today are at 06:00, 07:00 and 08:00 (yesterday's 10:00 is left out)."""
    rows = client.get(f"/api/regions/{region_id(client, 'Colaba')}/today", headers=tokens["alice"]).json()
    assert [r["reading_at"][11:16] for r in rows] == ["06:00", "07:00", "08:00"]
    assert rows[1]["temp"] == 27.0 and rows[1]["humidity"] == 95 and rows[1]["rain_mm"] == 60.0
    assert client.get("/api/regions/999/today", headers=tokens["alice"]).status_code == 404


def test_warning_today_answers_for_each_region(client, tokens):
    user = tokens["alice"]
    colaba = client.get(f"/api/regions/{region_id(client, 'Colaba')}/warnings/today", headers=user).json()
    assert colaba["has_warning"] and colaba["highest_level"] == "Orange"   # 130 mm since midnight
    assert colaba["warnings"][0]["hazard"] == "Rain" and colaba["warnings"][0]["source"] == "auto"

    satara = client.get(f"/api/regions/{region_id(client, 'Satara')}/warnings/today", headers=user).json()
    assert not satara["has_warning"] and satara["highest_level"] == "Green"


def test_map_colours_stations_by_todays_warning(client, tokens):
    stations = {s["station_name"]: s for s in client.get("/api/stations/map", headers=tokens["alice"]).json()}
    assert len(stations) == 10
    assert stations["Mumbai (Colaba)"]["warning_level"] == "Orange"
    assert stations["Satara"]["warning_level"] == "Green"
    assert stations["Satara"]["reading_at"] is None          # no readings yet: still on the map


def test_current_conditions_forecast_and_404(client, tokens):
    user, colaba = tokens["alice"], region_id(client, "Colaba")
    current = client.get(f"/api/regions/{colaba}/current", headers=user).json()
    assert current[0]["prec_amount"] == 130.0 and current[0]["aqi_category"] == "Good"
    assert len(client.get(f"/api/regions/{colaba}/forecast", headers=user).json()) == 7
    assert client.get("/api/regions/99999/warnings/today", headers=user).status_code == 404


# -------------------------------------------- the database's rules via the API
def test_check_constraint_rejects_humidity_140(client, tokens):
    body = {"station_id": station_id(client, tokens["admin"], "Satara"), "reading_date": "2005-07-26",
            "reading_time": "06:00:00", "humidity": 140}
    response = client.post("/api/admin/weather-data", json=body, headers=tokens["admin"])
    assert response.status_code == 422
    assert response.json()["sqlstate"] == "23514" and "humidity" in response.json()["constraint"]


def test_exclude_constraint_rejects_overlapping_band(client, tokens):
    body = {"category": "Test band", "aqi_min": 150, "aqi_max": 250}
    response = client.post("/api/admin/aqi-category", json=body, headers=tokens["admin"])
    assert response.status_code == 409 and response.json()["sqlstate"] == "23P01"


def test_station_with_readings_cannot_be_deleted(client, tokens):
    admin = tokens["admin"]
    response = client.delete(f"/api/admin/weather-station/{station_id(client, admin, 'Mumbai (Colaba)')}",
                             headers=admin)
    assert response.status_code == 409
    assert response.json()["sqlstate"] in ("23001", "23503")     # PostgreSQL 18 / 16


def test_crud_round_trip(client, tokens):
    admin = tokens["admin"]
    created = client.post("/api/admin/location", json={"region": "Test Region"}, headers=admin)
    assert created.status_code == 201 and "INSERT INTO" in created.json()["sql"]
    new_id = created.json()["row"]["region_id"]
    renamed = client.put(f"/api/admin/location/{new_id}", json={"region": "Renamed Region"}, headers=admin)
    assert renamed.json()["row"]["region"] == "Renamed Region"
    assert client.delete(f"/api/admin/location/{new_id}", headers=admin).status_code == 200
    assert client.get(f"/api/admin/location/{new_id}", headers=admin).status_code == 404


def test_admin_cannot_delete_own_account(client, tokens):
    me = client.get("/api/auth/me", headers=tokens["admin"]).json()
    assert client.delete(f"/api/admin/app-user/{me['user_id']}", headers=tokens["admin"]).status_code == 409


# ------------------------------------------------------- trigger and warnings
def test_inserting_a_reading_fires_the_trigger(client, tokens):
    admin, nagpur = tokens["admin"], region_id(client, "Nagpur")
    body = {"station_id": station_id(client, admin, "Nagpur (Sonegaon)"), "reading_date": today(client, admin),
            "reading_time": "01:00:00", "aqi": 420}
    assert client.post("/api/admin/weather-data", json=body, headers=admin).status_code == 201
    answer = client.get(f"/api/regions/{nagpur}/warnings/today", headers=admin).json()
    assert answer["highest_level"] == "Red"
    assert answer["warnings"][0]["hazard"] == "Air Quality" and answer["warnings"][0]["source"] == "auto"


def test_admin_warning_list_with_and_without_filters(client, tokens):
    admin, colaba = tokens["admin"], region_id(client, "Colaba")
    everything = client.get("/api/admin/warnings", headers=admin)
    assert everything.status_code == 200 and everything.json()["warnings"]
    day = today(client, admin)
    filtered = client.get(f"/api/admin/warnings?region_id={colaba}&date_from={day}&date_to={day}&source=auto",
                          headers=admin)
    assert filtered.status_code == 200
    assert [w["region"] for w in filtered.json()["warnings"]] == ["Colaba"]


def test_issue_edit_clear_and_trigger_respects_admin(client, tokens):
    admin, pune = tokens["admin"], region_id(client, "Pune")
    day = today(client, admin)
    warning = {"region_id": pune, "valid_date": day, "hazard": "Heat",
               "warning_level": "Yellow", "advisory_text": "Hot afternoon expected"}
    assert client.post("/api/admin/warnings", json=warning, headers=tokens["alice"]).status_code == 403

    issued = client.post("/api/admin/warnings", json=warning, headers=admin)
    assert issued.status_code == 201 and issued.json()["warning"]["source"] == "admin"
    edited = client.put(f"/api/admin/warnings/{pune}/{day}/Heat",
                        json={"warning_level": "Orange", "advisory_text": "Hotter than expected"}, headers=admin)
    assert edited.json()["warning"]["warning_level"] == "Orange"
    cleared = client.post(f"/api/admin/warnings/{pune}/{day}/Heat/clear", json={}, headers=admin)
    assert cleared.json()["warning"]["warning_level"] == "Green"

    # A scorching reading must not bring the cleared warning back.
    hot = {"station_id": station_id(client, admin, "Pune (Shivajinagar)"), "reading_date": day,
           "reading_time": "02:00:00", "current_temp": 48.0, "min_temp": 30.0, "max_temp": 48.0}
    assert client.post("/api/admin/weather-data", json=hot, headers=admin).status_code == 201
    heat = next(w for w in client.get(f"/api/regions/{pune}/warnings/today", headers=admin).json()["warnings"]
                if w["hazard"] == "Heat")
    assert heat["warning_level"] == "Green" and heat["source"] == "admin"


# ------------------------------------------------------------------ analytics
@pytest.mark.parametrize("path, sql_feature", [
    ("/api/analytics/monthly-temperature?min_days=1", "HAVING"),
    ("/api/analytics/aqi-ranking", "RANK() OVER"),
    ("/api/analytics/aqi-moving-average", "ROWS BETWEEN 6 PRECEDING AND CURRENT ROW"),
    ("/api/analytics/rain-above-region-average", "d2.region_id = d.region_id"),
])
def test_analytics_return_rows_and_their_sql(client, tokens, path, sql_feature):
    response = client.get(path, headers=tokens["admin"])
    assert response.status_code == 200
    body = response.json()
    assert sql_feature in body["sql"] and body["columns"] and body["rows"]


def test_user_warning_days_multi_table_join(client, tokens):
    mine = client.get("/api/analytics/user-warning-days", headers=tokens["alice"])     # Alice lives in Colaba
    assert mine.status_code == 200 and mine.json()["rows"][0]["warning_level"] == "Orange"
    bob = client.get("/api/auth/me", headers=tokens["bob"]).json()["user_id"]
    assert client.get(f"/api/analytics/user-warning-days?user_id={bob}", headers=tokens["alice"]).status_code == 403
    assert client.get(f"/api/analytics/user-warning-days?user_id={bob}", headers=tokens["admin"]).status_code == 200
    assert client.get("/api/analytics/user-warning-days").status_code == 401


# ------------------------------------------------------------------ integrity
def test_integrity_checks_all_pass(client, tokens):
    body = client.get("/api/integrity", headers=tokens["admin"]).json()
    failures = [f"{c['title']}: {c['summary']}" for c in body["checks"] if not c["passed"]]
    assert body["all_passed"], failures
    assert len(body["checks"]) == 6


def test_ingestion_log_is_admin_only(client, tokens):
    assert client.get("/api/admin/ingestion/runs", headers=tokens["alice"]).status_code == 403
    response = client.get("/api/admin/ingestion/runs", headers=tokens["admin"])
    assert response.status_code == 200 and "runs" in response.json()
