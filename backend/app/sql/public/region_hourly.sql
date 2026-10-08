-- Hourly temperature and humidity for a region over the last N days (the chart).
-- For a region with several stations, each hour shows their average.
-- Readings arrive every 15 minutes, but the chart keeps ONE point per hour (the
-- HH:00 readings): it spaces its points evenly, so 15-minute days next to the
-- older hourly days would look stretched.
SELECT w.reading_date + w.reading_time AS reading_at,
       round(avg(w.current_temp), 1)   AS temp,
       round(avg(w.humidity), 0)       AS humidity
FROM WEATHER_DATA w
JOIN WEATHER_STATION s ON s.station_id = w.station_id
WHERE s.region_id = %(region_id)s
  AND w.reading_date > CURRENT_DATE - %(days)s
  AND extract(minute FROM w.reading_time) = 0
GROUP BY w.reading_date, w.reading_time
ORDER BY w.reading_date, w.reading_time;
