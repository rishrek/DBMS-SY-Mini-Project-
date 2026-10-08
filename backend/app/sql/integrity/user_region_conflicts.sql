-- User's region vs reading's region  (poster Table 4)
-- For every user, take the readings the Home page shows them (their region's
-- rows of v_current_conditions), then look each reading up again in the base
-- tables (WEATHER_DATA -> WEATHER_STATION) and compare the two regions.
-- Expected: 0 conflicts.
SELECT count(*)                                          AS pairs_checked,
       count(*) FILTER (WHERE s.region_id <> u.region_id) AS conflicts
FROM APP_USER u
JOIN v_current_conditions v ON v.region_id  = u.region_id
JOIN WEATHER_DATA d         ON d.weather_id = v.weather_id
JOIN WEATHER_STATION s      ON s.station_id = d.station_id;
