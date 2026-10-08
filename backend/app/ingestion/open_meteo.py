"""
Downloads from the free Open-Meteo APIs (no API key needed).
Data licence: CC BY 4.0, so the website credits "Open-Meteo.com".

    Historical Forecast API  past hourly weather            -> backfill
    Forecast API             recent weather every 15 min     -> the live job (every 15 minutes)
                             + 7-day daily forecast          -> REGION_FORECAST (once an hour)
    Air Quality API          PM2.5, PM10, ozone, CO2, hourly -> both

One request covers ALL stations: latitude/longitude are sent as comma-separated
lists, and Open-Meteo answers with a list in the same order.
"""
from __future__ import annotations

import time
from datetime import date

import httpx

from ..config import settings

HISTORICAL_URL = "https://historical-forecast-api.open-meteo.com/v1/forecast"
FORECAST_URL = "https://api.open-meteo.com/v1/forecast"
AIR_QUALITY_URL = "https://air-quality-api.open-meteo.com/v1/air-quality"

HOURLY_WEATHER = [
    "temperature_2m", "apparent_temperature", "dew_point_2m", "wet_bulb_temperature_2m",
    "relative_humidity_2m", "precipitation", "rain", "showers", "snowfall",
    "precipitation_probability", "weather_code", "pressure_msl", "visibility",
    "wind_speed_10m", "wind_direction_10m",
]
# Open-Meteo also gives these every 15 minutes (its "minutely_15" block). For India
# the 15-minute values are smoothed between its hourly model values.
MINUTELY_WEATHER = [
    "temperature_2m", "apparent_temperature", "dew_point_2m", "relative_humidity_2m",
    "precipitation", "rain", "showers", "snowfall", "weather_code", "visibility",
    "wind_speed_10m", "wind_direction_10m",
]
# ...but not these three (wet bulb, chance of rain, pressure): they stay hourly.
HOURLY_ONLY = [name for name in HOURLY_WEATHER if name not in MINUTELY_WEATHER]
HOURLY_AIR = ["pm2_5", "pm10", "ozone", "carbon_dioxide"]
DAILY_FORECAST = [
    "weather_code", "temperature_2m_max", "temperature_2m_min",
    "precipitation_sum", "precipitation_probability_max",
]


class OpenMeteoError(RuntimeError):
    """Open-Meteo could not be reached, or rejected the request."""


def _get(url: str, params: dict, expected: int, attempts: int = 3) -> list[dict]:
    """GET with a few retries. Always returns a list with one item per location."""
    for attempt in range(1, attempts + 1):
        try:
            response = httpx.get(url, params=params, timeout=settings.open_meteo_timeout)
            if response.status_code == 400:                  # our request is wrong: retrying won't help
                raise OpenMeteoError(f"Open-Meteo rejected the request: {response.json().get('reason')}")
            response.raise_for_status()
            data = response.json()
            items = data if isinstance(data, list) else [data]
            if len(items) != expected:
                raise OpenMeteoError(f"asked for {expected} locations, got {len(items)}")
            return items
        # ValueError: a reply that isn't valid JSON (cut off half-way); seen once, worth another try too
        except (httpx.TransportError, httpx.HTTPStatusError, ValueError) as exc:
            if attempt == attempts:
                raise OpenMeteoError(f"{url} failed after {attempts} tries: {exc}") from exc
            time.sleep(2 * attempt)                          # wait 2 s, then 4 s, before trying again


def _locations(points: list[dict], with_elevation: bool = True) -> dict:
    """Comma-separated coordinates. Passing each station's own altitude lets
    Open-Meteo correct the temperature for height."""
    params = {
        "latitude": ",".join(str(p["latitude"]) for p in points),
        "longitude": ",".join(str(p["longitude"]) for p in points),
        "timezone": settings.timezone,              # times come back in IST
    }
    if with_elevation:
        params["elevation"] = ",".join(str(p["altitude"]) for p in points)
    return params


def fetch_hourly_weather(points: list[dict], start: date, end: date, historical: bool) -> list[dict]:
    """Hourly weather from start 00:00 to end 23:00 for every point.
    historical=True uses the Historical Forecast API (the only Open-Meteo source
    with every field for the last 90 days); False uses the live Forecast API."""
    params = {
        **_locations(points),
        "hourly": ",".join(HOURLY_WEATHER),
        "start_date": start.isoformat(),
        "end_date": end.isoformat(),
    }
    return _get(HISTORICAL_URL if historical else FORECAST_URL, params, expected=len(points))


def fetch_recent_weather(points: list[dict], start: date, end: date) -> list[dict]:
    """The live feed, from the Forecast API, start 00:00 to end 23:45, in ONE request:
    the weather every 15 minutes ("minutely_15") plus an "hourly" block with the
    three values that have no 15-minute version. start_date/end_date bound both blocks."""
    params = {
        **_locations(points),
        "minutely_15": ",".join(MINUTELY_WEATHER),
        "hourly": ",".join(HOURLY_ONLY),
        "start_date": start.isoformat(),
        "end_date": end.isoformat(),
    }
    return _get(FORECAST_URL, params, expected=len(points))


def fetch_hourly_air_quality(points: list[dict], start: date, end: date) -> list[dict]:
    """Hourly PM2.5, PM10, ozone (µg/m³) and CO2 (ppm) for every point."""
    params = {
        **_locations(points, with_elevation=False),
        "hourly": ",".join(HOURLY_AIR),
        "start_date": start.isoformat(),
        "end_date": end.isoformat(),
    }
    return _get(AIR_QUALITY_URL, params, expected=len(points))


def fetch_daily_forecast(points: list[dict], days: int = 7) -> list[dict]:
    """Daily forecast for the next `days` days (today included) for every point."""
    params = {
        **_locations(points),
        "daily": ",".join(DAILY_FORECAST),
        "forecast_days": days,
    }
    return _get(FORECAST_URL, params, expected=len(points))
