-- Station-days whose rainfall beat their region's average daily rainfall
-- (CORRELATED SUBQUERY)
--
-- The CTE "daily" gives one row per station per day. prec_amount is
-- "mm since 00:00", so its largest value that day is the day's total.
--
-- The subquery in WHERE is CORRELATED: it uses d.region_id from the OUTER row,
-- so PostgreSQL works it out again for every station-day, each time averaging
-- only the days of THAT row's region. (A plain subquery would run once and
-- give one number for everybody.)
-- We compare station-days, not whole stations: with one station per region, a
-- station would always equal its own region's average, and the answer would
-- always be empty.
WITH daily AS (
    SELECT s.station_id,
           s.station_name,
           s.region_id,
           w.reading_date,
           max(w.prec_amount) AS rain_mm
    FROM WEATHER_DATA w
    JOIN WEATHER_STATION s ON s.station_id = w.station_id
    GROUP BY s.station_id, s.station_name, s.region_id, w.reading_date
)
SELECT l.region,
       d.station_name,
       d.reading_date,
       d.rain_mm,
       round((SELECT avg(d2.rain_mm)
                FROM daily d2
               WHERE d2.region_id = d.region_id), 1) AS region_avg_mm
FROM daily d
JOIN LOCATION l ON l.region_id = d.region_id
WHERE d.rain_mm > (SELECT avg(d2.rain_mm)        -- correlated: d.region_id comes from the outer row
                     FROM daily d2
                    WHERE d2.region_id = d.region_id)
ORDER BY d.rain_mm DESC
LIMIT %(limit)s;
