-- Monthly average, minimum and maximum temperature per region  (GROUP BY + HAVING)
--
-- GROUP BY  puts all readings of one region in one month into a single group,
--           and avg/min/max then summarise each group.
-- HAVING    filters GROUPS (WHERE filters rows, before grouping): months with
--           fewer than min_days days of readings are dropped, so a month we
--           only have a few days of can't mislead the comparison.
-- date_trunc('month', d) turns every date into the first day of its month.
SELECT l.region,
       to_char(date_trunc('month', w.reading_date), 'YYYY-MM') AS month,
       count(DISTINCT w.reading_date)                          AS days_of_data,
       round(avg(w.current_temp), 1)                           AS avg_temp,
       min(w.current_temp)                                     AS min_temp,
       max(w.current_temp)                                     AS max_temp
FROM WEATHER_DATA w
JOIN WEATHER_STATION s ON s.station_id = w.station_id
JOIN LOCATION l        ON l.region_id  = s.region_id
GROUP BY l.region, date_trunc('month', w.reading_date)
HAVING count(DISTINCT w.reading_date) >= %(min_days)s
ORDER BY l.region, month;
