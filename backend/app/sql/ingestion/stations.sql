-- Every station and where it is, to build the Open-Meteo request.
-- The order matters: Open-Meteo answers a multi-location request in the same order.
SELECT station_id,
       station_name,
       latitude,
       longitude,
       altitude
FROM WEATHER_STATION
ORDER BY station_id;
