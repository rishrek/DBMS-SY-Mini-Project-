-- Current conditions for a region: the latest reading of each of its stations.
SELECT *
FROM v_current_conditions
WHERE region_id = %(region_id)s
ORDER BY station_id;
