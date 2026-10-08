-- Regions ranked by average AQI over the last N days  (window function RANK)
--
-- Step 1 (the CTE "region_aqi"): one row per region with its average AQI.
-- Step 2: RANK() OVER (ORDER BY avg_aqi DESC) numbers the rows from the worst
--         air to the best. Unlike ROW_NUMBER(), RANK gives TIES the same rank
--         and then skips (1, 2, 2, 4). Thane & Santacruz, and Colaba & Alibag,
--         share an air-quality grid cell (about 45 km wide), so they tie.
-- A window function adds a column computed across rows, without merging them
-- into one row the way GROUP BY does.
WITH region_aqi AS (
    SELECT l.region,
           avg(w.aqi)  AS avg_aqi,
           max(w.aqi)  AS worst_aqi,
           count(*)    AS readings
    FROM WEATHER_DATA w
    JOIN WEATHER_STATION s ON s.station_id = w.station_id
    JOIN LOCATION l        ON l.region_id  = s.region_id
    WHERE w.reading_date > CURRENT_DATE - %(days)s
      AND w.aqi IS NOT NULL
    GROUP BY l.region
)
SELECT RANK() OVER (ORDER BY round(avg_aqi, 1) DESC) AS rank,
       region,
       round(avg_aqi, 1) AS avg_aqi,
       worst_aqi,
       readings
FROM region_aqi
ORDER BY rank, region;
