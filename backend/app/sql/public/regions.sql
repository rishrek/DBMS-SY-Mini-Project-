-- All regions, for the region pickers, with how many stations each has.
-- LEFT JOIN keeps a region that has no station yet (it shows 0).
SELECT l.region_id,
       l.region,
       count(s.station_id) AS stations
FROM LOCATION l
LEFT JOIN WEATHER_STATION s ON s.region_id = l.region_id
GROUP BY l.region_id, l.region
ORDER BY l.region;
