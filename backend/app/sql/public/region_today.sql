-- Today's readings on the hour for a region (the dashboard's "Earlier today" cards).
-- For a region with several stations, each hour shows their average and the
-- condition most of them reported: mode() WITHIN GROUP (ORDER BY ...) is an
-- ordered-set aggregate that returns the most frequent value in the group.
SELECT w.reading_date + w.reading_time                     AS reading_at,
       round(avg(w.current_temp), 1)                       AS temp,
       round(avg(w.humidity), 0)                           AS humidity,
       round(avg(w.prec_intensity), 1)                     AS rain_mm,
       mode() WITHIN GROUP (ORDER BY w.current_conditions) AS conditions
FROM WEATHER_DATA w
JOIN WEATHER_STATION s ON s.station_id = w.station_id
WHERE s.region_id = %(region_id)s
  AND w.reading_date = CURRENT_DATE
  AND extract(minute FROM w.reading_time) = 0
GROUP BY w.reading_date, w.reading_time
ORDER BY w.reading_time;
