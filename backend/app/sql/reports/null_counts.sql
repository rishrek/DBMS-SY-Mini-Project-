-- How many readings are missing each of the 22 values (NULL = not measured).
-- count(column) counts only the non-NULL values, so count(*) - count(column)
-- is the number of NULLs in that column.
SELECT count(*)                              AS total_readings,
       count(*) - count(current_conditions)  AS current_conditions,
       count(*) - count(current_temp)        AS current_temp,
       count(*) - count(min_temp)            AS min_temp,
       count(*) - count(max_temp)            AS max_temp,
       count(*) - count(feels_like)          AS feels_like,
       count(*) - count(dew_point)           AS dew_point,
       count(*) - count(wet_bulb)            AS wet_bulb,
       count(*) - count(humidity)            AS humidity,
       count(*) - count(wind_speed)          AS wind_speed,
       count(*) - count(wind_direction)      AS wind_direction,
       count(*) - count(pressure)            AS pressure,
       count(*) - count(prec_type)           AS prec_type,
       count(*) - count(prec_probability)    AS prec_probability,
       count(*) - count(prec_intensity)      AS prec_intensity,
       count(*) - count(prec_amount)         AS prec_amount,
       count(*) - count(prec_duration)       AS prec_duration,
       count(*) - count(aqi)                 AS aqi,
       count(*) - count(visibility)          AS visibility,
       count(*) - count(co2)                 AS co2,
       count(*) - count(pm2_5)               AS pm2_5,
       count(*) - count(pm10)                AS pm10,
       count(*) - count(ozone)               AS ozone
FROM WEATHER_DATA;
