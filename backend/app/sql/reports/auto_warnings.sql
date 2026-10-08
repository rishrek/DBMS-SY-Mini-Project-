-- Every warning the trigger raised, oldest first, with the value that caused it.
-- The two scalar subqueries are CORRELATED: they use w.region_id and
-- w.valid_date from the outer row, so they run once per warning.
SELECT l.region,
       w.valid_date,
       w.hazard,
       w.warning_level,
       (SELECT max(d.prec_amount)                     -- the day's rain (mm since 00:00 peaks at the last reading)
          FROM WEATHER_DATA d
          JOIN WEATHER_STATION s ON s.station_id = d.station_id
         WHERE s.region_id = w.region_id
           AND d.reading_date = w.valid_date)          AS day_rain_mm,
       (SELECT max(d.max_temp)
          FROM WEATHER_DATA d
          JOIN WEATHER_STATION s ON s.station_id = d.station_id
         WHERE s.region_id = w.region_id
           AND d.reading_date = w.valid_date)          AS day_max_temp
FROM REGION_WARNING w
JOIN LOCATION l ON l.region_id = w.region_id
WHERE w.source = 'auto'
ORDER BY w.valid_date, l.region, w.hazard;
