-- The latest reading of one station, with its region and AQI band (map popup).
SELECT *
FROM v_current_conditions
WHERE station_id = %(station_id)s;
