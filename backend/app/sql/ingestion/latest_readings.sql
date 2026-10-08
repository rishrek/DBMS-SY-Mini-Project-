-- The newest stored reading of each station. The live feed stores only readings
-- NEWER than this: Open-Meteo's 15-minute values are smoothed separately from
-- its hourly ones, so filling them in between stored hourly readings would make
-- the "so far today" values zig-zag. History stays write-once.
SELECT station_id,
       max(reading_date + reading_time) AS latest
FROM WEATHER_DATA
GROUP BY station_id;
