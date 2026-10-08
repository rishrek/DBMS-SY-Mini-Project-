-- Store one hourly reading.
-- If this station already has a reading for this date and time, ON CONFLICT DO
-- NOTHING skips the row instead of failing, so re-running a load never creates
-- duplicates (readings are write-once history).
-- The trigger on WEATHER_DATA runs for every row that really gets inserted.
INSERT INTO WEATHER_DATA (
    station_id, reading_date, reading_time,
    current_conditions, current_temp, min_temp, max_temp,
    feels_like, dew_point, wet_bulb, humidity,
    wind_speed, wind_direction, pressure,
    prec_type, prec_probability, prec_intensity, prec_amount, prec_duration,
    aqi, visibility, co2, pm2_5, pm10, ozone
) VALUES (
    %(station_id)s, %(reading_date)s, %(reading_time)s,
    %(current_conditions)s, %(current_temp)s, %(min_temp)s, %(max_temp)s,
    %(feels_like)s, %(dew_point)s, %(wet_bulb)s, %(humidity)s,
    %(wind_speed)s, %(wind_direction)s, %(pressure)s,
    %(prec_type)s, %(prec_probability)s, %(prec_intensity)s, %(prec_amount)s, %(prec_duration)s,
    %(aqi)s, %(visibility)s, %(co2)s, %(pm2_5)s, %(pm10)s, %(ozone)s
)
ON CONFLICT (station_id, reading_date, reading_time) DO NOTHING;
