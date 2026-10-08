"""
Tests for the formulas in app/ingestion/derive.py (no database, no internet).
    cd backend
    .venv/bin/python -m pytest -v
"""
from datetime import date, datetime, time, timedelta

import pytest

from app.ingestion import derive
from app.ingestion.derive import PM10_BANDS, PM25_BANDS


# ------------------------------------------------------------- CPCB AQI
@pytest.mark.parametrize("pm25, expected", [
    (0, 0), (30, 50),              # Good ends at 30 µg/m³ -> AQI 50
    (31, 51), (60, 100),           # Satisfactory
    (61, 101), (90, 200),          # Moderate
    (91, 201), (120, 300),         # Poor
    (121, 301), (250, 400),        # Very Poor
    (251, 401), (380, 500),        # Severe (upper end is our extension)
    (1000, 500),                   # capped
    (45.5, 76),                    # 45.5 rounds to 46: 49/29 * 15 + 51 = 76.3 -> 76
])
def test_pm25_sub_index(pm25, expected):
    assert derive.sub_index(pm25, PM25_BANDS) == expected


@pytest.mark.parametrize("pm10, expected", [
    (50, 50), (51, 51), (100, 100), (101, 101), (250, 200),
    (251, 201), (350, 300), (351, 301), (430, 400), (431, 401), (510, 500),
])
def test_pm10_sub_index(pm10, expected):
    assert derive.sub_index(pm10, PM10_BANDS) == expected


def test_gap_between_bands_is_closed_by_rounding():
    # 30.4 rounds to 30 (Good); 30.5 rounds half up to 31 (Satisfactory).
    assert derive.sub_index(30.4, PM25_BANDS) == 50
    assert derive.sub_index(30.5, PM25_BANDS) == 51


def test_aqi_is_the_worse_sub_index():
    # PM2.5 30 -> 50; PM10 120 -> 99/149 * 19 + 101 = 113.6 -> 114, the higher one wins
    assert derive.cpcb_aqi(pm25_24h=30, pm10_24h=120) == 114
    assert derive.cpcb_aqi(pm25_24h=None, pm10_24h=50) == 50      # one pollutant is enough
    assert derive.cpcb_aqi(None, None) is None


def test_rolling_mean_needs_16_of_24_hours():
    start = datetime(2026, 9, 1, 0, 0)
    times = [start + timedelta(hours=h) for h in range(30)]
    values = [10.0] * 30
    means = derive.rolling_24h_means(times, values)
    assert means[14] is None            # only 15 hours so far
    assert means[15] == 10.0            # 16 hours: valid
    values[20] = None                   # a missing hour is simply left out
    assert derive.rolling_24h_means(times, values)[29] == 10.0


# ------------------------------------------------------------- so far today
def test_so_far_today_restarts_at_midnight():
    times = [datetime(2026, 9, 1, 22), datetime(2026, 9, 1, 23), datetime(2026, 9, 2, 0), datetime(2026, 9, 2, 1)]
    temps = [26.0, 24.5, 24.0, 25.2]
    precip = [3.0, 0.0, 1.2, 0.4]
    out = derive.so_far_today(times, temps, precip)
    assert (out[1].min_temp, out[1].max_temp, out[1].prec_amount, out[1].prec_duration) == (24.5, 26.0, 3.0, 1)
    # a new day starts again from 00:00
    assert (out[2].min_temp, out[2].max_temp, out[2].prec_amount, out[2].prec_duration) == (24.0, 24.0, 1.2, 1)
    assert (out[3].min_temp, out[3].max_temp, out[3].prec_amount, out[3].prec_duration) == (24.0, 25.2, 1.6, 2)


def test_so_far_today_sums_without_float_noise():
    times = [datetime(2026, 9, 1, h) for h in range(3)]
    out = derive.so_far_today(times, [20.0] * 3, [0.1, 0.2, 0.0])
    assert out[1].prec_amount == 0.3     # not 0.30000000000000004


# ------------------------------------------------------------- other derived values
def test_stull_wet_bulb_matches_the_paper():
    assert derive.stull_wet_bulb(20, 50) == 13.7        # Stull (2011): 20 °C, 50 % -> 13.7 °C


@pytest.mark.parametrize("total, rain, showers, snow_cm, expected", [
    (0.0, 0.0, 0.0, 0.0, "None"),
    (1.2, 1.0, 0.2, 0.0, "Rain"),
    (3.0, 0.5, 2.5, 0.0, "Showers"),
    (0.1, 0.0, 0.0, 0.0, "Rain"),       # parts rounded to 0 but it did rain
    (None, None, None, None, None),     # not measured
])
def test_precipitation_type(total, rain, showers, snow_cm, expected):
    assert derive.precipitation_type(total, rain, showers, snow_cm) == expected


def test_weather_code_descriptions():
    assert derive.describe_weather(63) == "Moderate rain"
    assert derive.describe_weather(95) == "Thunderstorm"
    assert derive.describe_weather(None) is None


def test_forecast_text_never_repeats_other_columns():
    assert derive.forecast_text(80, 2.6) == "Slight rain showers, about 3 mm of rain expected"
    assert derive.forecast_text(1, 0.0) == "Mainly clear, no rain expected"


# ------------------------------------------------------------- 15-minute data (the live feed)
QUARTER = timedelta(minutes=15)


def test_so_far_today_counts_clock_hours_with_15_minute_data():
    times = [datetime(2026, 9, 2, 10, 15) + k * QUARTER for k in range(6)]   # 10:15 .. 11:30
    precip = [0.5, 0.5, 0.0, 0.0, 0.2, 0.0]
    out = derive.so_far_today(times, [25.0] * 6, precip, step=QUARTER)
    # The rain at 10:15 and 10:30 fell in the same clock hour (10:00-11:00); 11:15's is a second hour.
    assert [o.prec_duration for o in out] == [1, 1, 1, 1, 2, 2]
    assert out[-1].prec_amount == 1.2


def test_rain_last_hour_adds_the_last_four_quarters():
    times = [datetime(2026, 9, 2, 10, 0) + k * QUARTER for k in range(6)]    # 10:00 .. 11:15
    precip = [1.0, 0.5, 0.5, 0.5, 0.5, None]
    assert derive.rain_last_hour(times, precip, step=QUARTER) == [1.0, 1.5, 2.0, 2.5, 2.0, 1.5]
    # hourly data: each value already is "the hour before"
    hours = [datetime(2026, 9, 2, h) for h in range(3)]
    assert derive.rain_last_hour(hours, [0.4, None, 2.0]) == [0.4, None, 2.0]


def test_build_readings_from_15_minute_data():
    """The live feed: a 15-minute series, plus an hourly block for the values with
    no 15-minute version. Those, and the air quality, come from the reading's own hour."""
    quarters = [datetime(2026, 9, 1, 0) + k * QUARTER for k in range(2 * 96)]     # 1 and 2 Sep
    hours = [datetime(2026, 9, 1, 0) + timedelta(hours=h) for h in range(48)]
    q_iso = [t.isoformat(timespec="minutes") for t in quarters]
    h_iso = [t.isoformat(timespec="minutes") for t in hours]
    n = len(quarters)
    weather = {"time": q_iso, "temperature_2m": [25.0] * n, "precipitation": [0.2] * n}
    for name in ("apparent_temperature", "dew_point_2m", "relative_humidity_2m", "rain", "showers", "snowfall",
                 "weather_code", "visibility", "wind_speed_10m", "wind_direction_10m"):
        weather[name] = [None] * n
    hourly = {"time": h_iso, "pressure_msl": [1000.0 + h for h in range(48)],
              "precipitation_probability": [50] * 48, "wet_bulb_temperature_2m": [22.0] * 48}
    air = {"time": h_iso, "pm2_5": [40.0] * 48, "pm10": [60.0] * 48, "ozone": [30.0] * 48, "carbon_dioxide": [430] * 48}

    rows = derive.build_readings(7, weather, air, first_day=date(2026, 9, 2), last_time=datetime(2026, 9, 2, 5, 30),
                                 step=QUARTER, hourly=hourly)
    times = [r["reading_time"] for r in rows]
    assert times[0] == time(0, 0) and times[-1] == time(5, 30) and len(rows) == 23    # 00:00 .. 05:30, every 15 min
    last = rows[-1]                                   # 2 Sep 05:30
    assert last["pressure"] == 1029.0                 # 05:00's hourly value (the 30th hour of the download)
    assert last["wet_bulb"] == 22.0 and last["prec_probability"] == 50
    assert last["prec_intensity"] == 0.8              # 4 x 0.2 mm in the last hour
    assert last["prec_amount"] == 4.6                 # 23 x 0.2 mm since midnight
    # clock hours with rain: 23:00 (the 00:00 value covers 23:45-00:00) and 00:00 to 05:00
    assert last["prec_duration"] == 7
    assert last["aqi"] == 66                          # from 05:00's air quality, as in the hourly test below


# ------------------------------------------------------------- whole rows
def test_build_readings_keeps_only_first_day_to_last_time():
    day = date(2026, 9, 2)
    hours = [datetime(2026, 9, 1, 0) + timedelta(hours=h) for h in range(48)]
    iso = [t.isoformat(timespec="minutes") for t in hours]
    weather = {"time": iso, "temperature_2m": [25.0] * 48, "precipitation": [0.5] * 48}
    for name in ("apparent_temperature", "dew_point_2m", "wet_bulb_temperature_2m", "relative_humidity_2m",
                 "rain", "showers", "snowfall", "precipitation_probability", "weather_code",
                 "pressure_msl", "visibility", "wind_speed_10m", "wind_direction_10m"):
        weather[name] = [None] * 48
    air = {"time": iso, "pm2_5": [40.0] * 48, "pm10": [60.0] * 48, "ozone": [30.0] * 48, "carbon_dioxide": [430] * 48}

    rows = derive.build_readings(7, weather, air, first_day=day, last_time=datetime(2026, 9, 2, 5))
    assert [r["reading_time"].hour for r in rows] == [0, 1, 2, 3, 4, 5]     # 2 Sep 00:00 .. 05:00 only
    assert rows[-1]["prec_amount"] == 3.0 and rows[-1]["prec_duration"] == 6
    # PM2.5 40 -> 49/29 * 9 + 51 = 66.2 -> 66; PM10 60 -> 60; the worse one wins
    assert rows[-1]["aqi"] == 66
