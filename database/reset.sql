-- =============================================================================
--  Climate Intelligence System (KJS-CES-01)                   database/reset.sql
-- -----------------------------------------------------------------------------
--  Removes everything this project created, so you can rebuild from 01_schema.sql.
--  Safe on an empty database too (every DROP says IF EXISTS).
--
--  Order matters. This is the lesson from our poster: dropping a parent table
--  while a child still references it fails with SQLSTATE 2BP01 ("cannot drop
--  table ... because other objects depend on it"). A VIEW that reads a table is
--  also a dependent object, so it has to go first. The order is:
--      the view → child tables → parent tables → support tables → functions
--  There is no CASCADE anywhere: if we get the order wrong, PostgreSQL should
--  stop us rather than silently dropping more than we asked for.
-- =============================================================================

BEGIN;

DROP VIEW IF EXISTS v_current_conditions;          -- reads 4 of the tables below

-- The poster's 7 tables, children first (the trigger on WEATHER_DATA is dropped with it)
DROP TABLE IF EXISTS APP_USER;                     -- child of LOCATION
DROP TABLE IF EXISTS REGION_WARNING;               -- child of LOCATION
DROP TABLE IF EXISTS REGION_FORECAST;              -- child of LOCATION
DROP TABLE IF EXISTS WEATHER_DATA;                 -- child of WEATHER_STATION
DROP TABLE IF EXISTS WEATHER_STATION;              -- child of LOCATION
DROP TABLE IF EXISTS AQI_CATEGORY;                 -- no FKs: matched with BETWEEN
DROP TABLE IF EXISTS LOCATION;                     -- parent of the rest, so last

-- Support tables (no foreign keys)
DROP TABLE IF EXISTS WARNING_THRESHOLD;
DROP TABLE IF EXISTS INGESTION_RUN;

-- Functions (the triggers that used the first two went with their tables)
DROP FUNCTION IF EXISTS notify_live_change();      -- from 05_live_updates.sql
DROP FUNCTION IF EXISTS trg_weather_data_raise_warnings();
DROP FUNCTION IF EXISTS raise_auto_warning(integer, date, text, numeric);
DROP FUNCTION IF EXISTS region_daily_summary(integer, date, date);
DROP FUNCTION IF EXISTS warning_rank(text);

COMMIT;
