-- Readings per station and the time span they cover.
-- LEFT JOIN keeps a station that has no readings yet (it shows 0).
SELECT s.station_name,
       count(w.weather_id)                          AS readings,
       min(w.reading_date + w.reading_time)          AS first_reading,
       max(w.reading_date + w.reading_time)          AS last_reading
FROM WEATHER_STATION s
LEFT JOIN WEATHER_DATA w ON w.station_id = s.station_id
GROUP BY s.station_id, s.station_name
ORDER BY s.station_id;
