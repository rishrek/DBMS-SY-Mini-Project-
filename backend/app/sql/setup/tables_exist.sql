-- Have the tables been built yet (database/01_schema.sql)?
-- to_regclass('weather_data') returns the table if it exists and NULL if it doesn't,
-- instead of raising an error the way a plain SELECT from a missing table would.
SELECT to_regclass('weather_data') IS NOT NULL AS tables_exist;
