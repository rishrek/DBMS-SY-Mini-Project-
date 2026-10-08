-- Is the database reachable? Also shows its clock (IST) and version.
SELECT now()                 AS database_time,
       current_setting('TimeZone') AS time_zone,
       version()             AS postgres_version,
       (SELECT max(reading_date + reading_time) FROM WEATHER_DATA) AS latest_reading;
