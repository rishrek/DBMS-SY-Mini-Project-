-- =============================================================================
--  Climate Intelligence System (KJS-CES-01)               database/04_triggers.sql
-- -----------------------------------------------------------------------------
--  Raises warnings automatically, one of the poster's "next steps".
--
--  Every time a row is INSERTed into WEATHER_DATA, the trigger checks three
--  hazards against WARNING_THRESHOLD:
--      Rain         NEW.prec_amount   (mm since 00:00 = the day's total so far)
--      Heat         NEW.max_temp      (highest temperature since 00:00)
--      Air Quality  NEW.aqi
--  and creates or upgrades the REGION_WARNING row for that region, date and
--  hazard (source = 'auto'). Two rules:
--      1. never downgrade an existing warning (Orange stays Orange if a later
--         reading only reaches Yellow level);
--      2. never overwrite a warning an admin issued, edited or cleared.
--  Run after 03_views_functions.sql, connected to climate_db.
--  Safe to re-run on its own after an edit (CREATE OR REPLACE), and no data is lost.
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- raise_auto_warning(region, date, hazard, measured value)
-- Called once per hazard by the trigger function below. Kept separate so each
-- hazard runs exactly the same code, and so it can be tested on its own:
--     SELECT raise_auto_warning(7, DATE '2005-07-26', 'Rain', 944);
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION raise_auto_warning(p_region_id  integer,
                                              p_valid_date date,
                                              p_hazard     text,
                                              p_value      numeric)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
    v_level     text;   -- warning level this value reaches, e.g. 'Orange'
    v_advisory  text;   -- advisory text for that level
BEGIN
    IF p_value IS NULL THEN
        RETURN;                       -- nothing measured, nothing to judge
    END IF;

    -- Step 1: the most serious level whose threshold this value reaches.
    SELECT t.warning_level, t.advisory_text
      INTO v_level, v_advisory
      FROM WARNING_THRESHOLD t
     WHERE t.hazard = p_hazard
       AND p_value >= t.min_value
     ORDER BY warning_rank(t.warning_level) DESC
     LIMIT 1;

    IF v_level IS NULL THEN
        RETURN;                       -- below every threshold: no warning
    END IF;

    -- Step 2: create the warning, or upgrade the one that's already there.
    -- ON CONFLICT fires when a row with the same PRIMARY KEY
    -- (region_id, valid_date, hazard) already exists.
    --   rw       = that existing row (the table's alias)
    --   EXCLUDED = the row we just tried to insert
    INSERT INTO REGION_WARNING AS rw
           (region_id,   valid_date,   hazard,   warning_level, advisory_text, source, issued_at)
    VALUES (p_region_id, p_valid_date, p_hazard, v_level,       v_advisory,    'auto', now())
    ON CONFLICT (region_id, valid_date, hazard) DO UPDATE
       SET warning_level = EXCLUDED.warning_level,
           advisory_text = EXCLUDED.advisory_text,
           issued_at     = EXCLUDED.issued_at
     -- The UPDATE happens only when BOTH rules allow it. When this WHERE is
     -- false, PostgreSQL leaves the existing row exactly as it was (no error).
     WHERE rw.source = 'auto'                        -- rule 2: never touch a warning an admin issued, edited or cleared
       AND warning_rank(EXCLUDED.warning_level)      -- rule 1: only go UP (Yellow 1 → Orange 2 → Red 3),
         > warning_rank(rw.warning_level);           --         never down, and not again at the same level
END;
$$;


-- -----------------------------------------------------------------------------
-- The trigger function: looks up the reading's region, then checks each hazard.
-- NEW is the row that was just inserted into WEATHER_DATA.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION trg_weather_data_raise_warnings()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
    v_region_id integer;
BEGIN
    SELECT s.region_id
      INTO v_region_id
      FROM WEATHER_STATION s
     WHERE s.station_id = NEW.station_id;

    PERFORM raise_auto_warning(v_region_id, NEW.reading_date, 'Rain',        NEW.prec_amount);
    PERFORM raise_auto_warning(v_region_id, NEW.reading_date, 'Heat',        NEW.max_temp);
    PERFORM raise_auto_warning(v_region_id, NEW.reading_date, 'Air Quality', NEW.aqi);

    RETURN NULL;   -- the return value of an AFTER trigger is ignored
END;
$$;


-- AFTER INSERT: the reading has already passed every CHECK, UNIQUE and FK
-- constraint. The warning is written in the SAME transaction as the reading,
-- so either both are saved or neither is.
-- FOR EACH ROW: runs once per inserted reading (a 21,600-row backfill runs it
-- 21,600 times, which is fine at this size).
CREATE OR REPLACE TRIGGER weather_data_raise_warnings
    AFTER INSERT ON WEATHER_DATA
    FOR EACH ROW
    EXECUTE FUNCTION trg_weather_data_raise_warnings();

COMMIT;
