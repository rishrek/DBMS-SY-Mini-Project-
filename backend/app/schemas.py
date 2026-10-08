"""
Pydantic models: the shape of the JSON the API accepts and returns.

Division of work, one place for each rule:
  * Pydantic checks the SHAPE of a request: types, required fields, email
    format, password length. Bad shape -> 422 before any SQL runs.
  * PostgreSQL checks the RULES: value ranges, allowed words, uniqueness,
    foreign keys, non-overlapping AQI bands (the CHECK / UNIQUE / FK / EXCLUDE
    constraints in database/01_schema.sql). A broken rule -> the database
    refuses, and errors.py reports which constraint said no.
So "humidity 140" gets past Pydantic (it IS a number) and is stopped by the
database's CHECK, just like the poster's example.
"""
from datetime import date, datetime, time
from typing import Any

from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator


def _password_ok(value: str) -> str:
    if len(value) < 8:
        raise ValueError("password must be at least 8 characters")
    if len(value.encode("utf-8")) > 72:
        raise ValueError("password must be at most 72 bytes (a bcrypt limit)")
    return value


class _Model(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)


# ------------------------------------------------------------------------- auth
class RegisterIn(_Model):
    name: str = Field(min_length=1, max_length=100)
    email: EmailStr
    password: str
    region_id: int

    @field_validator("email")
    @classmethod
    def lower_email(cls, v: str) -> str:
        return v.lower()                     # emails are stored in lower case, so UNIQUE ignores case

    @field_validator("password")
    @classmethod
    def check_password(cls, v: str) -> str:
        return _password_ok(v)


class UserOut(BaseModel):
    user_id: int
    region_id: int
    region: str | None = None
    name: str
    email: str
    role: str
    created_at: datetime


class TokenOut(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserOut


# --------------------------------------------------------- a query and its SQL
class QueryResult(BaseModel):
    """Analytics and integrity answers: the result AND the exact SQL behind it."""
    title: str
    description: str
    sql: str
    params: dict[str, Any]
    columns: list[str]
    rows: list[dict[str, Any]]


# ---------------------------------------------------------------- the 7 tables
class LocationIn(_Model):
    region: str = Field(min_length=1, max_length=100)


class WeatherStationIn(_Model):
    station_name: str = Field(min_length=1, max_length=100)
    latitude: float
    longitude: float
    altitude: float
    region_id: int


class WeatherDataIn(_Model):
    station_id: int
    reading_date: date
    reading_time: time
    current_conditions: str | None = None
    current_temp: float | None = None
    min_temp: float | None = None
    max_temp: float | None = None
    feels_like: float | None = None
    dew_point: float | None = None
    wet_bulb: float | None = None
    humidity: int | None = None
    wind_speed: float | None = None
    wind_direction: int | None = None
    pressure: float | None = None
    prec_type: str | None = None
    prec_probability: int | None = None
    prec_intensity: float | None = None
    prec_amount: float | None = None
    prec_duration: float | None = None
    aqi: int | None = None
    visibility: float | None = None
    co2: float | None = None
    pm2_5: float | None = None
    pm10: float | None = None
    ozone: float | None = None


class AqiCategoryIn(_Model):
    category: str = Field(min_length=1, max_length=50)
    aqi_min: int
    aqi_max: int


class AqiCategoryUpdate(_Model):
    aqi_min: int
    aqi_max: int


class AppUserIn(_Model):
    region_id: int
    name: str = Field(min_length=1, max_length=100)
    email: EmailStr
    role: str = "user"                       # the database allows 'admin' or 'user'
    password: str

    @field_validator("email")
    @classmethod
    def lower_email(cls, v: str) -> str:
        return v.lower()

    @field_validator("password")
    @classmethod
    def check_password(cls, v: str) -> str:
        return _password_ok(v)


class AppUserUpdate(_Model):
    region_id: int
    name: str = Field(min_length=1, max_length=100)
    email: EmailStr
    role: str
    password: str | None = None              # leave empty to keep the current password

    @field_validator("email")
    @classmethod
    def lower_email(cls, v: str) -> str:
        return v.lower()

    @field_validator("password")
    @classmethod
    def check_password(cls, v: str | None) -> str | None:
        return None if v in (None, "") else _password_ok(v)


class RegionForecastIn(_Model):
    region_id: int
    forecast_date: date
    forecast_text: str = Field(min_length=1)
    min_temp: float | None = None
    max_temp: float | None = None
    rain_probability: int | None = None


class RegionForecastUpdate(_Model):
    forecast_text: str = Field(min_length=1)
    min_temp: float | None = None
    max_temp: float | None = None
    rain_probability: int | None = None


class WarningThresholdIn(_Model):
    hazard: str = Field(min_length=1)
    warning_level: str
    min_value: float
    advisory_text: str = Field(min_length=1)


class WarningThresholdUpdate(_Model):
    min_value: float
    advisory_text: str = Field(min_length=1)


# ------------------------------------------------------------- admin warnings
class WarningIssue(_Model):
    region_id: int
    valid_date: date
    hazard: str = Field(min_length=1, max_length=50)
    warning_level: str                       # Green / Yellow / Orange / Red (checked by the database)
    advisory_text: str | None = None


class WarningEdit(_Model):
    warning_level: str
    advisory_text: str | None = None


class WarningClear(_Model):
    advisory_text: str | None = None         # optional note; defaults to "Cleared by admin"


# --------------------------------------------------------------- ingestion
class IngestionRequest(_Model):
    mode: str = Field("manual", pattern="^(manual|backfill)$")
    days: int = Field(90, ge=1, le=365)      # only used by backfill
