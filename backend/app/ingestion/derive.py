"""
Values we derive ourselves: anything calculated instead of copied straight
from Open-Meteo. Every formula is written out in full so it can be explained
in the viva.

Only plain functions (no database, no network), so tests can check each one.
Why these rules keep WEATHER_DATA in BCNF: see the note on WEATHER_DATA in
database/01_schema.sql.
"""
from __future__ import annotations

import math
from dataclasses import dataclass
from datetime import date, datetime, timedelta
from decimal import ROUND_HALF_UP, Decimal
from fractions import Fraction

HOUR = timedelta(hours=1)       # backfilled days have one value per hour; the live feed one every 15 minutes


# ------------------------------------------------------------------- rounding
def round_half_up(value: float, digits: int = 0):
    """School rounding: 2.5 -> 3. (Python's round() gives 2: "banker's rounding".)"""
    step = Decimal(1).scaleb(-digits)                       # 1, 0.1, 0.01, ...
    rounded = Decimal(str(value)).quantize(step, rounding=ROUND_HALF_UP)
    return int(rounded) if digits == 0 else float(rounded)


# ---------------------------------------------------- current_conditions (WMO)
# WMO weather interpretation codes, as sent in Open-Meteo's `weather_code`.
WMO_DESCRIPTIONS = {
    0: "Clear sky", 1: "Mainly clear", 2: "Partly cloudy", 3: "Overcast",
    45: "Fog", 48: "Depositing rime fog",
    51: "Light drizzle", 53: "Moderate drizzle", 55: "Dense drizzle",
    56: "Light freezing drizzle", 57: "Dense freezing drizzle",
    61: "Slight rain", 63: "Moderate rain", 65: "Heavy rain",
    66: "Light freezing rain", 67: "Heavy freezing rain",
    71: "Slight snowfall", 73: "Moderate snowfall", 75: "Heavy snowfall", 77: "Snow grains",
    80: "Slight rain showers", 81: "Moderate rain showers", 82: "Violent rain showers",
    85: "Slight snow showers", 86: "Heavy snow showers",
    95: "Thunderstorm", 96: "Thunderstorm with slight hail", 99: "Thunderstorm with heavy hail",
}


def describe_weather(code) -> str | None:
    """WMO code -> text, e.g. 63 -> 'Moderate rain'."""
    if code is None:
        return None
    return WMO_DESCRIPTIONS.get(int(code), f"Weather code {int(code)}")


# --------------------------------------------------------------------- prec_type
SNOW_CM_TO_MM = 10 / 7          # Open-Meteo: 7 cm of snow is about 10 mm of water


def precipitation_type(total_mm, rain_mm, showers_mm, snowfall_cm) -> str | None:
    """'None' / 'Rain' / 'Showers' / 'Snow' for one hour.

    Decided from the precipitation AMOUNTS, never from the weather code, so
    current_conditions does not determine prec_type (no hidden FD).
    """
    if total_mm is None:
        return None                                  # not measured
    if total_mm <= 0:
        return "None"
    shares = {
        "Rain": rain_mm or 0.0,
        "Showers": showers_mm or 0.0,
        "Snow": (snowfall_cm or 0.0) * SNOW_CM_TO_MM,
    }
    kind = max(shares, key=shares.get)               # the biggest part of this hour's total
    return kind if shares[kind] > 0 else "Rain"      # tiny totals can round every part to 0


# ------------------------------------------------ "so far today" day-level values
@dataclass(frozen=True)
class SoFarToday:
    min_temp: float | None       # lowest temperature since 00:00
    max_temp: float | None       # highest temperature since 00:00   -> Heat warnings
    prec_amount: float | None    # mm since 00:00                    -> Rain warnings
    prec_duration: int | None    # clock hours with precipitation since 00:00


def so_far_today(times: list[datetime], temps: list, precip: list, step: timedelta = HOUR) -> list[SoFarToday]:
    """Running values for one station's series (sorted by time, one value every
    `step`), restarting at 00:00.

    Each precipitation value is the amount that fell in the `step` BEFORE its
    timestamp (Open-Meteo's convention), so a date's total starts with the last
    step of the evening before: a small offset we accept for simplicity.

    prec_duration counts clock HOURS with any precipitation, so it stays a whole
    number with 15-minute data: rain at 10:15 and at 10:30 is one rainy hour
    (10:00-11:00). With hourly data every value is its own hour, so it simply
    counts the rainy values.
    """
    out: list[SoFarToday] = []
    day = None
    for t, temp, p in zip(times, temps, precip):
        if t.date() != day:                                  # new day: start again
            day, low, high = t.date(), None, None
            amount, rainy_hours, seen_precip = 0.0, set(), False
        if temp is not None:
            low = temp if low is None else min(low, temp)
            high = temp if high is None else max(high, temp)
        if p is not None:
            seen_precip = True
            amount += p
            if p > 0:
                rainy_hours.add((t - step).replace(minute=0))   # the clock hour this rain fell in
        out.append(SoFarToday(
            min_temp=low,
            max_temp=high,
            prec_amount=round_half_up(amount, 1) if seen_precip else None,
            prec_duration=len(rainy_hours) if seen_precip else None,
        ))
    return out


def rain_last_hour(times: list[datetime], precip: list, step: timedelta = HOUR) -> list[float | None]:
    """prec_intensity for each time t: the precipitation in the hour before t, in mm,
    which is the same number as mm/h. Hourly data: the value itself. 15-minute
    data: the sum of the four values from t-45 min to t. None if none is known."""
    by_time = dict(zip(times, precip))
    steps = round(HOUR / step)                               # 1 for hourly data, 4 for 15-minute data
    out = []
    for t in times:
        present = [v for v in (by_time.get(t - k * step) for k in range(steps)) if v is not None]
        out.append(round_half_up(sum(present), 1) if present else None)
    return out


# ------------------------------------------------------------------ CPCB AQI
@dataclass(frozen=True)
class Band:
    c_lo: int   # concentration range, µg/m³ (24-hour average)
    c_hi: int
    i_lo: int   # AQI range of the band
    i_hi: int


# CPCB National AQI breakpoints (CPCB 2014). CPCB leaves the top band open
# ("250+", "430+"); we give it the width of the band below and cap at 500.
PM25_BANDS = (
    Band(0, 30, 0, 50),          # Good
    Band(31, 60, 51, 100),       # Satisfactory
    Band(61, 90, 101, 200),      # Moderate
    Band(91, 120, 201, 300),     # Poor
    Band(121, 250, 301, 400),    # Very Poor
    Band(251, 380, 401, 500),    # Severe
)
PM10_BANDS = (
    Band(0, 50, 0, 50),
    Band(51, 100, 51, 100),
    Band(101, 250, 101, 200),
    Band(251, 350, 201, 300),
    Band(351, 430, 301, 400),
    Band(431, 510, 401, 500),
)


def sub_index(concentration, bands) -> int | None:
    """CPCB sub-index for one pollutant.

    1. Round the 24-hour average to a whole µg/m³ (half up). CPCB's breakpoints
       are whole numbers with no gap between bands (30 | 31), so every rounded
       value falls in exactly one band. This is how we handle the "gaps".
    2. Straight-line interpolation inside that band:
           I = (I_hi - I_lo) / (C_hi - C_lo) * (C - C_lo) + I_lo
       computed with exact fractions, then rounded half up.
    3. Above the top band: 500.
    """
    if concentration is None:
        return None
    c = round_half_up(max(concentration, 0.0))
    for b in bands:
        if b.c_lo <= c <= b.c_hi:
            index = Fraction(b.i_hi - b.i_lo, b.c_hi - b.c_lo) * (c - b.c_lo) + b.i_lo
            return math.floor(index + Fraction(1, 2))        # exact "round half up"
    return 500


def cpcb_aqi(pm25_24h, pm10_24h) -> int | None:
    """AQI = the worse (higher) of the PM2.5 and PM10 sub-indices."""
    subs = [s for s in (sub_index(pm25_24h, PM25_BANDS), sub_index(pm10_24h, PM10_BANDS)) if s is not None]
    return max(subs) if subs else None


def rolling_24h_means(times: list[datetime], values: list, min_hours: int = 16) -> list[float | None]:
    """For each hour t: the average of the 24 hourly values from t-23h to t.
    CPCB needs at least 16 of the 24 hours for a valid 24-hour average."""
    by_time = dict(zip(times, values))
    out = []
    for t in times:
        window = [by_time.get(t - timedelta(hours=h)) for h in range(24)]
        present = [v for v in window if v is not None]
        out.append(sum(present) / len(present) if len(present) >= min_hours else None)
    return out


# -------------------------------------------------------------------- wet bulb
def stull_wet_bulb(temp_c, rh_pct) -> float | None:
    """Wet-bulb temperature by Stull (2011), J. Appl. Meteor. Climatol. 50:2267-2269.
    Only used if Open-Meteo leaves wet_bulb_temperature_2m empty.
    Valid for RH 5-99 % and -20..50 °C (error within about ±1 °C).
    Check: 20 °C and 50 % give 13.7 °C, as in Stull's paper."""
    if temp_c is None or rh_pct is None:
        return None
    t, rh = float(temp_c), float(rh_pct)
    tw = (t * math.atan(0.151977 * math.sqrt(rh + 8.313659))
          + math.atan(t + rh) - math.atan(rh - 1.676331)
          + 0.00391838 * rh ** 1.5 * math.atan(0.023101 * rh)
          - 4.686035)
    return round_half_up(tw, 1)


# -------------------------------------------------------------- forecast text
def forecast_text(code, precip_sum_mm) -> str:
    """e.g. 'Slight rain showers, about 3 mm of rain expected'.
    Built from the weather code and expected rain only; it never repeats the
    min/max temperature or probability columns (that would add an FD)."""
    desc = describe_weather(code) or "No description"
    if precip_sum_mm is None:
        return desc
    if precip_sum_mm < 0.1:
        return f"{desc}, no rain expected"
    if precip_sum_mm < 1:
        return f"{desc}, under 1 mm of rain expected"
    return f"{desc}, about {round_half_up(precip_sum_mm)} mm of rain expected"


# ------------------------------------------------ Open-Meteo JSON -> table rows
def build_readings(station_id: int, weather: dict, air: dict, first_day: date, last_time: datetime,
                   step: timedelta = HOUR, hourly: dict | None = None) -> list[dict]:
    """One station's Open-Meteo blocks -> WEATHER_DATA rows (dicts whose keys
    match the %(name)s placeholders in sql/ingestion/insert_reading.sql).

    weather:   the series to store, one value every `step`: the "hourly" block
               (backfill) or the "minutely_15" block (the live feed, step = 15 min)
    hourly:    live feed only: the "hourly" block with the values that have no
               15-minute version (wet bulb, chance of rain, pressure)
    air:       the Air Quality "hourly" block
               A 15-minute reading takes these hourly values from its own hour
               (12:15, 12:30 and 12:45 use 12:00's).
    first_day: first date to store (the downloads start a day earlier, so the
               24-hour PM averages and the one-hour rain windows are complete).
    last_time: nothing after this (IST): later times are forecasts, not readings.
    """
    times = [datetime.fromisoformat(t) for t in weather["time"]]
    sofar = so_far_today(times, weather["temperature_2m"], weather["precipitation"], step)
    rain_hour = rain_last_hour(times, weather["precipitation"], step)

    by_hour: dict[str, dict] = {}                     # {"pressure_msl": {12:00: 1008.4, ...}, ...}
    if hourly:
        hourly_times = [datetime.fromisoformat(t) for t in hourly["time"]]
        by_hour = {name: dict(zip(hourly_times, values)) for name, values in hourly.items() if name != "time"}

    air_times = [datetime.fromisoformat(t) for t in air["time"]]
    no_data = [None] * len(air_times)                 # if a pollutant is missing from the reply, store NULL
    air_now = {name: dict(zip(air_times, air.get(name) or no_data))
               for name in ("pm2_5", "pm10", "ozone", "carbon_dioxide")}
    pm25_24h = dict(zip(air_times, rolling_24h_means(air_times, air.get("pm2_5") or no_data)))
    pm10_24h = dict(zip(air_times, rolling_24h_means(air_times, air.get("pm10") or no_data)))

    rows = []
    for i, t in enumerate(times):
        if t.date() < first_day or t > last_time:
            continue
        hour = t.replace(minute=0)                    # the hour this reading belongs to (12:15 -> 12:00)
        w = {name: values[i] for name, values in weather.items() if name != "time"}
        for name, values_by_time in by_hour.items():  # the values that only come hourly
            w.setdefault(name, values_by_time.get(hour))
        wet_bulb = w.get("wet_bulb_temperature_2m")
        if wet_bulb is None:
            wet_bulb = stull_wet_bulb(w.get("temperature_2m"), w.get("relative_humidity_2m"))
        visibility_m = w.get("visibility")
        rows.append({
            "station_id": station_id,
            "reading_date": t.date(),
            "reading_time": t.time(),
            "current_conditions": describe_weather(w.get("weather_code")),
            "current_temp": w.get("temperature_2m"),
            "min_temp": sofar[i].min_temp,
            "max_temp": sofar[i].max_temp,
            "feels_like": w.get("apparent_temperature"),
            "dew_point": w.get("dew_point_2m"),
            "wet_bulb": wet_bulb,
            "humidity": w.get("relative_humidity_2m"),
            "wind_speed": w.get("wind_speed_10m"),
            "wind_direction": w.get("wind_direction_10m"),
            "pressure": w.get("pressure_msl"),
            "prec_type": precipitation_type(w.get("precipitation"), w.get("rain"),
                                            w.get("showers"), w.get("snowfall")),
            "prec_probability": w.get("precipitation_probability"),
            "prec_intensity": rain_hour[i],                   # mm in the hour before = mm/h
            "prec_amount": sofar[i].prec_amount,
            "prec_duration": sofar[i].prec_duration,
            "aqi": cpcb_aqi(pm25_24h.get(hour), pm10_24h.get(hour)),
            "visibility": None if visibility_m is None else round_half_up(visibility_m / 1000, 1),  # m -> km
            "co2": air_now["carbon_dioxide"].get(hour),
            "pm2_5": air_now["pm2_5"].get(hour),
            "pm10": air_now["pm10"].get(hour),
            "ozone": air_now["ozone"].get(hour),
        })
    return rows


def build_forecasts(region_id: int, daily: dict) -> list[dict]:
    """One region's Open-Meteo "daily" block -> REGION_FORECAST rows."""
    return [{
        "region_id": region_id,
        "forecast_date": date.fromisoformat(day),
        "forecast_text": forecast_text(daily["weather_code"][i], daily["precipitation_sum"][i]),
        "min_temp": daily["temperature_2m_min"][i],
        "max_temp": daily["temperature_2m_max"][i],
        "rain_probability": daily["precipitation_probability_max"][i],
    } for i, day in enumerate(daily["time"])]
