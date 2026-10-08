-- One point per region to ask for its 7-day forecast: the average position of
-- the region's stations (for a one-station region, that is just the station).
-- Regions with no station yet have nothing to average, so the JOIN leaves them out.
SELECT l.region_id,
       l.region,
       round(avg(s.latitude), 5)  AS latitude,
       round(avg(s.longitude), 5) AS longitude,
       round(avg(s.altitude), 1)  AS altitude
FROM LOCATION l
JOIN WEATHER_STATION s ON s.region_id = l.region_id
GROUP BY l.region_id, l.region
ORDER BY l.region_id;
