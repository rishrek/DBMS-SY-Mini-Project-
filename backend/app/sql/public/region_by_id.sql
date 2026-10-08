-- One region by its id (used to answer 404 for an unknown region).
SELECT region_id, region
FROM LOCATION
WHERE region_id = %(region_id)s;
