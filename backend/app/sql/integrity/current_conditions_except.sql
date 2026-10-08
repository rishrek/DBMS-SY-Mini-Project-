-- The poster's "EXCEPT both ways" check (Table 4), applied to our view.
-- "Latest reading per station" is worked out a second, independent way
-- (GROUP BY + MAX, then join back) and compared with v_current_conditions
-- (which uses DISTINCT ON). EXCEPT returns rows in the first result but not
-- the second, so running it in both directions and getting 0 and 0 proves the
-- two methods agree exactly.  Expected: 0 and 0.
WITH by_view AS (
    SELECT station_id, weather_id
    FROM v_current_conditions
),
by_max AS (
    SELECT w.station_id, w.weather_id
    FROM WEATHER_DATA w
    JOIN (SELECT station_id, max(reading_date + reading_time) AS latest
            FROM WEATHER_DATA
           GROUP BY station_id) m
      ON m.station_id = w.station_id
     AND w.reading_date + w.reading_time = m.latest
)
SELECT (SELECT count(*) FROM (SELECT * FROM by_view EXCEPT SELECT * FROM by_max) a) AS only_in_view,
       (SELECT count(*) FROM (SELECT * FROM by_max EXCEPT SELECT * FROM by_view) b) AS only_in_max_method;
