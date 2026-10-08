-- Every whole AQI value from 0 to 500 belongs to some band (no gaps).
-- Together with the overlap check this proves each value is in EXACTLY one band,
-- which is what a foreign key would guarantee, and what the poster noted a
-- BETWEEN match cannot enforce on its own.
-- generate_series(0, 500) makes the numbers 0..500; the LEFT JOIN finds each
-- number's band, and a NULL band means a gap.  Expected: 0.
SELECT count(*) AS uncovered_values
FROM generate_series(0, 500) AS g(aqi)
LEFT JOIN AQI_CATEGORY c ON g.aqi BETWEEN c.aqi_min AND c.aqi_max
WHERE c.category IS NULL;
