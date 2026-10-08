-- Daily AQI per region and its 7-day moving average  (window function AVG ... OVER)
--
-- Step 1 (the CTE "daily"): one row per region per day with that day's average AQI.
-- Step 2: AVG(day_avg_aqi) OVER (PARTITION BY region ORDER BY day
--                                ROWS BETWEEN 6 PRECEDING AND CURRENT ROW)
--   PARTITION BY region  -> each region is averaged separately
--   ORDER BY day         -> rows in date order
--   ROWS BETWEEN 6 PRECEDING AND CURRENT ROW -> today plus the 6 rows before it
-- so every day shows the average of the last 7 days: a smoothed trend line.
-- "(region_id value IS NULL OR ...)" makes the region filter optional.
WITH daily AS (
    SELECT l.region,
           w.reading_date AS day,
           avg(w.aqi)     AS day_avg_aqi
    FROM WEATHER_DATA w
    JOIN WEATHER_STATION s ON s.station_id = w.station_id
    JOIN LOCATION l        ON l.region_id  = s.region_id
    WHERE w.reading_date > CURRENT_DATE - %(days)s
      AND (%(region_id)s::integer IS NULL OR l.region_id = %(region_id)s)
    GROUP BY l.region, w.reading_date
)
SELECT region,
       day,
       round(day_avg_aqi, 1) AS day_avg_aqi,
       round(avg(day_avg_aqi) OVER (PARTITION BY region
                                    ORDER BY day
                                    ROWS BETWEEN 6 PRECEDING AND CURRENT ROW), 1) AS moving_avg_7d
FROM daily
ORDER BY region, day;
