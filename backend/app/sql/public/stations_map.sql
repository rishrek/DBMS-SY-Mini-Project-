-- Every station for the map: where it is, its region, the most serious warning
-- in that region today (Green if there is none) and its latest reading.
-- The scalar subquery is correlated (it uses s.region_id from the outer row).
-- LEFT JOIN v_current_conditions keeps a new station that has no readings yet.
SELECT s.station_id,
       s.station_name,
       s.latitude,
       s.longitude,
       s.altitude,
       l.region_id,
       l.region,
       coalesce((SELECT w.warning_level
                   FROM REGION_WARNING w
                  WHERE w.region_id = s.region_id
                    AND w.valid_date = CURRENT_DATE
                  ORDER BY warning_rank(w.warning_level) DESC
                  LIMIT 1), 'Green')  AS warning_level,
       v.reading_at,
       v.current_conditions,
       v.current_temp,
       v.humidity,
       v.aqi,
       v.aqi_category
FROM WEATHER_STATION s
JOIN LOCATION l                  ON l.region_id = s.region_id
LEFT JOIN v_current_conditions v ON v.station_id = s.station_id
ORDER BY s.station_id;
