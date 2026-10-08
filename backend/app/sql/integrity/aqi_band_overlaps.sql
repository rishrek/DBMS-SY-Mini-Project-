-- No two AQI bands overlap. The EXCLUDE constraint on AQI_CATEGORY should make
-- this impossible, so this double-checks it.
-- A self-join pairs every band with every other band; a.category < b.category
-- keeps each pair once. && means "the two ranges overlap".  Expected: 0.
SELECT count(*) AS overlapping_pairs
FROM AQI_CATEGORY a
JOIN AQI_CATEGORY b ON a.category < b.category
WHERE int4range(a.aqi_min, a.aqi_max, '[]') && int4range(b.aqi_min, b.aqi_max, '[]');
