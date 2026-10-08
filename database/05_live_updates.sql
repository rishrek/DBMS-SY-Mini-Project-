-- =============================================================================
--  Climate Intelligence System (KJS-CES-01)          database/05_live_updates.sql
-- -----------------------------------------------------------------------------
--  Live updates: PostgreSQL announces every change, so the website can show it
--  on every open dashboard within about a second.
--
--  How it works:
--    1. A trigger on each table the dashboard shows calls
--           pg_notify('climate_live', '<table name>')
--    2. The API keeps one connection that has run  LISTEN climate_live  and
--       passes each message on to the open browsers (backend/app/live.py).
--    3. Each browser fetches again the parts of the page that show that table.
--
--  Two PostgreSQL rules make this safe and cheap:
--    * A notification is delivered only when its transaction COMMITs. A rolled-
--      back insert announces nothing, and nobody hears about half a data load.
--    * Identical notifications from one transaction are delivered once, so a
--      data load that inserts 110 readings sends ONE 'weather_data' message.
--
--  Also here: the run type of the 15-minute job ('live') in INGESTION_RUN, and
--  the table comments for readings every 15 minutes.
--
--  Run after 04_triggers.sql, connected to climate_db. Safe to run again at any
--  time (start.py runs it on every start): nothing is lost and nothing doubles.
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- notify_live_change(): the one trigger function all four triggers use.
-- TG_TABLE_NAME is the name of the table that fired the trigger, in lower case
-- ('weather_data', 'region_warning', ...), so the message says WHAT changed.
-- It never carries the data itself: the website fetches that through the API,
-- with the usual login rules.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION notify_live_change()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    PERFORM pg_notify('climate_live', TG_TABLE_NAME);
    RETURN NULL;   -- the return value of an AFTER trigger is ignored
END;
$$;


-- FOR EACH ROW: only rows that really changed fire it. A reading skipped by
-- ON CONFLICT DO NOTHING announces nothing, and neither does an upsert whose
-- WHERE said no. (Many rows in one transaction still send one message.)
-- AFTER: the row has already passed every CHECK, UNIQUE and FK constraint.
CREATE OR REPLACE TRIGGER weather_data_notify_live
    AFTER INSERT ON WEATHER_DATA
    FOR EACH ROW
    EXECUTE FUNCTION notify_live_change();

CREATE OR REPLACE TRIGGER region_warning_notify_live
    AFTER INSERT OR UPDATE OR DELETE ON REGION_WARNING      -- raised, issued, edited, cleared or deleted
    FOR EACH ROW
    EXECUTE FUNCTION notify_live_change();

CREATE OR REPLACE TRIGGER region_forecast_notify_live
    AFTER INSERT OR UPDATE OR DELETE ON REGION_FORECAST
    FOR EACH ROW
    EXECUTE FUNCTION notify_live_change();

CREATE OR REPLACE TRIGGER ingestion_run_notify_live
    AFTER INSERT OR UPDATE ON INGESTION_RUN                 -- a run starts (INSERT), then finishes (UPDATE)
    FOR EACH ROW
    EXECUTE FUNCTION notify_live_change();


-- -----------------------------------------------------------------------------
-- INGESTION_RUN.run_type: 'live' is the 15-minute job. 'hourly' stays allowed,
-- because the runs from before the change to 15 minutes were logged that way.
-- Dropping and adding the CHECK again makes this safe to re-run. ADD CONSTRAINT
-- checks every existing row, and they all pass.
-- -----------------------------------------------------------------------------
ALTER TABLE INGESTION_RUN DROP CONSTRAINT IF EXISTS ingestion_run_run_type_check;
ALTER TABLE INGESTION_RUN ADD CONSTRAINT ingestion_run_run_type_check
    CHECK (run_type IN ('backfill', 'hourly', 'manual', 'live'));


-- -----------------------------------------------------------------------------
-- Readings now arrive every 15 minutes. The key (station_id, reading_date,
-- reading_time) already allowed that, so no column changes: only the comments
-- (the same text as in 01_schema.sql, for databases built before this change).
-- -----------------------------------------------------------------------------
COMMENT ON TABLE WEATHER_DATA IS 'Readings every 15 minutes (backfilled days are hourly), 22 values each. Keys: weather_id; (station_id, reading_date, reading_time). Day-level values are "so far today". BCNF.';
COMMENT ON COLUMN WEATHER_DATA.reading_time IS 'Time of the reading, IST (every 15 minutes: HH:00, HH:15, HH:30, HH:45; backfilled days are hourly, HH:00)';
COMMENT ON COLUMN WEATHER_DATA.prec_type IS 'None / Rain / Showers / Snow, from the precipitation amounts since the previous reading';
COMMENT ON COLUMN WEATHER_DATA.prec_duration IS 'Clock hours with any precipitation since 00:00 up to this reading';

COMMIT;
