-- =============================================================================
--  Climate Intelligence System (KJS-CES-01)              database/smoke_test.sql
-- -----------------------------------------------------------------------------
--  Phase 2 checks for the constraints, view, function and trigger.
--  Safe to run at any time: everything happens inside ONE transaction that is
--  ROLLED BACK at the end, so no test data is left behind. Test readings use
--  dates in 2005, so they never collide with real data.
--
--  Where to read the results:
--    pgAdmin: the "Messages" tab shows one PASS/FAIL line per check + a summary.
--    psql:    psql -d climate_db -f database/smoke_test.sql
--
--  Expected result: "SUMMARY: all 16 checks passed". Checks 7, 9 and 10 test
--  the two trigger rules (never downgrade, never overwrite an admin's warning).
-- =============================================================================

BEGIN;

-- Results are collected here and summarised at the end.
CREATE TEMP TABLE smoke_result (
    check_no  integer PRIMARY KEY,
    name      text    NOT NULL,
    passed    boolean NOT NULL,
    detail    text
) ON COMMIT DROP;

-- Helper: record one result and print PASS / FAIL.
CREATE FUNCTION pg_temp.report(p_no integer, p_name text, p_passed boolean, p_detail text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
    INSERT INTO smoke_result VALUES (p_no, p_name, coalesce(p_passed, false), p_detail);
    IF coalesce(p_passed, false) THEN
        RAISE NOTICE 'PASS %: %', p_no, p_name;
    ELSE
        RAISE WARNING 'FAIL %: % (%)', p_no, p_name, coalesce(p_detail, 'no detail');
    END IF;
END $$;

-- Helper: station_id from a station name.
CREATE FUNCTION pg_temp.station_id(p_name text) RETURNS integer
LANGUAGE sql AS $$
    SELECT station_id FROM WEATHER_STATION WHERE station_name = p_name;
$$;

-- Helper: 'Orange/auto' = level/source of a region's warning (NULL if none).
CREATE FUNCTION pg_temp.warning(p_region text, p_date date, p_hazard text) RETURNS text
LANGUAGE sql AS $$
    SELECT w.warning_level || '/' || w.source
      FROM REGION_WARNING w
      JOIN LOCATION l ON l.region_id = w.region_id
     WHERE l.region = p_region AND w.valid_date = p_date AND w.hazard = p_hazard;
$$;


-- ---------------------------------------------------------------- constraints
-- 1. CHECK: the poster's own example, a humidity of 140 %, must be rejected.
DO $$
BEGIN
    INSERT INTO WEATHER_DATA (station_id, reading_date, reading_time, humidity)
    VALUES (pg_temp.station_id('Mumbai (Santacruz)'), DATE '2005-07-26', TIME '06:00', 140);
    PERFORM pg_temp.report(1, 'CHECK rejects humidity = 140 %', false, 'row was accepted');
EXCEPTION WHEN check_violation THEN                       -- SQLSTATE 23514
    PERFORM pg_temp.report(1, 'CHECK rejects humidity = 140 %', true);
END $$;

-- 2. CHECK: min_temp <= current_temp <= max_temp.
DO $$
BEGIN
    INSERT INTO WEATHER_DATA (station_id, reading_date, reading_time, current_temp, min_temp, max_temp)
    VALUES (pg_temp.station_id('Mumbai (Santacruz)'), DATE '2005-07-26', TIME '06:00', 31.0, 24.0, 29.0);
    PERFORM pg_temp.report(2, 'CHECK rejects current_temp above max_temp', false, 'row was accepted');
EXCEPTION WHEN check_violation THEN
    PERFORM pg_temp.report(2, 'CHECK rejects current_temp above max_temp', true);
END $$;

-- 3. UNIQUE (station_id, reading_date, reading_time): a second reading for the
--    same station and hour is refused, and ON CONFLICT DO NOTHING skips it
--    quietly. This is how the ingestion re-runs without making duplicates.
DO $$
DECLARE
    v_skipped_rows integer;
BEGIN
    INSERT INTO WEATHER_DATA (station_id, reading_date, reading_time, current_temp, min_temp, max_temp)
    VALUES (pg_temp.station_id('Mumbai (Colaba)'), DATE '2005-01-01', TIME '10:00', 25.0, 20.0, 25.0);

    INSERT INTO WEATHER_DATA (station_id, reading_date, reading_time, current_temp, min_temp, max_temp)
    VALUES (pg_temp.station_id('Mumbai (Colaba)'), DATE '2005-01-01', TIME '10:00', 26.0, 20.0, 26.0)
    ON CONFLICT (station_id, reading_date, reading_time) DO NOTHING;
    GET DIAGNOSTICS v_skipped_rows = ROW_COUNT;           -- rows the statement inserted: should be 0

    BEGIN
        INSERT INTO WEATHER_DATA (station_id, reading_date, reading_time)
        VALUES (pg_temp.station_id('Mumbai (Colaba)'), DATE '2005-01-01', TIME '10:00');
        PERFORM pg_temp.report(3, 'UNIQUE blocks a duplicate reading; ON CONFLICT DO NOTHING skips it',
                               false, 'duplicate was accepted');
    EXCEPTION WHEN unique_violation THEN                  -- SQLSTATE 23505
        PERFORM pg_temp.report(3, 'UNIQUE blocks a duplicate reading; ON CONFLICT DO NOTHING skips it',
                               v_skipped_rows = 0, format('ON CONFLICT inserted %s row(s)', v_skipped_rows));
    END;
END $$;

-- 4. EXCLUDE: an AQI band that overlaps an existing band is refused.
DO $$
BEGIN
    INSERT INTO AQI_CATEGORY (category, aqi_min, aqi_max) VALUES ('Test band', 150, 250);
    PERFORM pg_temp.report(4, 'EXCLUDE rejects an overlapping AQI band (150-250)', false, 'band was accepted');
EXCEPTION WHEN exclusion_violation THEN                   -- SQLSTATE 23P01
    PERFORM pg_temp.report(4, 'EXCLUDE rejects an overlapping AQI band (150-250)', true);
END $$;


-- -------------------------------------------------------------------- trigger
-- 5-9 replay 26 July 2005 at Santacruz (944 mm in 24 hours, poster Table 1).
-- prec_amount is "mm since 00:00", so it grows through the day.

-- 5. 70 mm by 08:00 → Yellow.
DO $$
DECLARE v_got text;
BEGIN
    INSERT INTO WEATHER_DATA (station_id, reading_date, reading_time, prec_amount)
    VALUES (pg_temp.station_id('Mumbai (Santacruz)'), DATE '2005-07-26', TIME '08:00', 70.0);
    v_got := pg_temp.warning('Santacruz', DATE '2005-07-26', 'Rain');
    PERFORM pg_temp.report(5, 'Trigger raises Yellow when rain since midnight reaches 70 mm',
                           v_got IS NOT DISTINCT FROM 'Yellow/auto', 'got ' || coalesce(v_got, 'no warning'));
END $$;

-- 6. 150 mm by 12:00 → upgraded to Orange.
DO $$
DECLARE v_got text;
BEGIN
    INSERT INTO WEATHER_DATA (station_id, reading_date, reading_time, prec_amount)
    VALUES (pg_temp.station_id('Mumbai (Santacruz)'), DATE '2005-07-26', TIME '12:00', 150.0);
    v_got := pg_temp.warning('Santacruz', DATE '2005-07-26', 'Rain');
    PERFORM pg_temp.report(6, 'Trigger upgrades Yellow to Orange at 150 mm',
                           v_got IS NOT DISTINCT FROM 'Orange/auto', 'got ' || coalesce(v_got, 'no warning'));
END $$;

-- 7. A second (temporary) station in the same region measured only 90 mm,
--    which is Yellow level. The region must stay Orange: never downgrade.
DO $$
DECLARE v_got text;
BEGIN
    INSERT INTO WEATHER_STATION (station_name, latitude, longitude, altitude, region_id)
    SELECT 'Smoke-test gauge', 19.10000, 72.85000, 10.0, region_id FROM LOCATION WHERE region = 'Santacruz';

    INSERT INTO WEATHER_DATA (station_id, reading_date, reading_time, prec_amount)
    VALUES (pg_temp.station_id('Smoke-test gauge'), DATE '2005-07-26', TIME '12:00', 90.0);
    v_got := pg_temp.warning('Santacruz', DATE '2005-07-26', 'Rain');
    PERFORM pg_temp.report(7, 'Trigger never downgrades (a 90 mm station keeps the region at Orange)',
                           v_got IS NOT DISTINCT FROM 'Orange/auto', 'got ' || coalesce(v_got, 'no warning'));
END $$;

-- 8. 944 mm by 20:00 → Red.
DO $$
DECLARE v_got text;
BEGIN
    INSERT INTO WEATHER_DATA (station_id, reading_date, reading_time, prec_amount)
    VALUES (pg_temp.station_id('Mumbai (Santacruz)'), DATE '2005-07-26', TIME '20:00', 944.0);
    v_got := pg_temp.warning('Santacruz', DATE '2005-07-26', 'Rain');
    PERFORM pg_temp.report(8, 'Trigger upgrades to Red at 944 mm',
                           v_got IS NOT DISTINCT FROM 'Red/auto', 'got ' || coalesce(v_got, 'no warning'));
END $$;

-- 9. An admin clears the warning: level Green, source admin (what the website's
--    Clear button will do). More rain afterwards must NOT bring it back.
DO $$
DECLARE v_got text;
BEGIN
    UPDATE REGION_WARNING
       SET warning_level = 'Green', source = 'admin', advisory_text = 'Cleared by admin', issued_at = now()
     WHERE region_id = (SELECT region_id FROM LOCATION WHERE region = 'Santacruz')
       AND valid_date = DATE '2005-07-26'
       AND hazard = 'Rain';

    INSERT INTO WEATHER_DATA (station_id, reading_date, reading_time, prec_amount)
    VALUES (pg_temp.station_id('Mumbai (Santacruz)'), DATE '2005-07-26', TIME '23:00', 950.0);
    v_got := pg_temp.warning('Santacruz', DATE '2005-07-26', 'Rain');
    PERFORM pg_temp.report(9, 'A warning cleared by an admin stays cleared (950 mm does not re-raise it)',
                           v_got IS NOT DISTINCT FROM 'Green/admin', 'got ' || coalesce(v_got, 'no warning'));
END $$;

-- 10. An admin issued a Yellow heat warning. A reading of 46 °C (Orange level)
--     must not replace the admin's warning.
DO $$
DECLARE v_got text;
BEGIN
    INSERT INTO REGION_WARNING (region_id, valid_date, hazard, warning_level, advisory_text, source)
    SELECT region_id, DATE '2005-05-20', 'Heat', 'Yellow', 'Admin: very hot afternoon expected', 'admin'
      FROM LOCATION WHERE region = 'Nagpur';

    INSERT INTO WEATHER_DATA (station_id, reading_date, reading_time, current_temp, min_temp, max_temp)
    VALUES (pg_temp.station_id('Nagpur (Sonegaon)'), DATE '2005-05-20', TIME '15:00', 45.5, 31.0, 46.0);
    v_got := pg_temp.warning('Nagpur', DATE '2005-05-20', 'Heat');
    PERFORM pg_temp.report(10, 'Trigger never overwrites an admin warning (46 °C leaves admin Yellow alone)',
                           v_got IS NOT DISTINCT FROM 'Yellow/admin', 'got ' || coalesce(v_got, 'no warning'));
END $$;

-- 11. AQI 420 → Red air-quality warning, and 420 falls in the 'Severe' band.
DO $$
DECLARE v_got text; v_band text;
BEGIN
    INSERT INTO WEATHER_DATA (station_id, reading_date, reading_time, aqi)
    VALUES (pg_temp.station_id('Mumbai (Colaba)'), DATE '2005-11-15', TIME '09:00', 420);
    v_got := pg_temp.warning('Colaba', DATE '2005-11-15', 'Air Quality');
    SELECT category INTO v_band FROM AQI_CATEGORY WHERE 420 BETWEEN aqi_min AND aqi_max;
    PERFORM pg_temp.report(11, 'AQI 420 raises a Red Air Quality warning and maps to the Severe band',
                           v_got IS NOT DISTINCT FROM 'Red/auto' AND v_band IS NOT DISTINCT FROM 'Severe',
                           format('warning %s, band %s', coalesce(v_got, 'none'), coalesce(v_band, 'none')));
END $$;


-- ---------------------------------------------------------- view and function
-- 12. The view returns exactly one row per station, and it is the newest reading.
DO $$
DECLARE v_rows integer; v_stations integer; v_not_newest integer;
BEGIN
    SELECT count(*) INTO v_rows FROM v_current_conditions;
    SELECT count(DISTINCT station_id) INTO v_stations FROM WEATHER_DATA;
    SELECT count(*) INTO v_not_newest
      FROM v_current_conditions v
     WHERE (v.reading_date, v.reading_time) <>
           (SELECT w.reading_date, w.reading_time
              FROM WEATHER_DATA w
             WHERE w.station_id = v.station_id
             ORDER BY w.reading_date DESC, w.reading_time DESC
             LIMIT 1);
    PERFORM pg_temp.report(12, 'v_current_conditions: one row per station, each its newest reading',
                           v_rows = v_stations AND v_not_newest = 0,
                           format('%s rows, %s stations with readings, %s not newest', v_rows, v_stations, v_not_newest));
END $$;

-- 13. region_daily_summary: Santacruz on 26 Jul 2005 had two stations
--     (950 mm and 90 mm), so the region's rain_mm is their average, 520.0.
DO $$
DECLARE r record;
BEGIN
    SELECT * INTO r
      FROM region_daily_summary((SELECT region_id FROM LOCATION WHERE region = 'Santacruz'),
                                DATE '2005-07-26', DATE '2005-07-26');
    PERFORM pg_temp.report(13, 'region_daily_summary averages station totals (950 and 90 mm -> 520.0 mm)',
                           r.stations = 2 AND r.rain_mm = 520.0,
                           format('stations=%s rain_mm=%s', r.stations, r.rain_mm));
END $$;


-- ------------------------------------------------------ foreign keys and drops
-- 14. ON DELETE RESTRICT: a station that has readings can't be deleted.
--     The error code depends on the PostgreSQL version (we tested both):
--       PostgreSQL 16 (the lab):  23503 foreign_key_violation
--       PostgreSQL 18 (our Macs): 23001 restrict_violation
--     so this check accepts either one.
DO $$
BEGIN
    DELETE FROM WEATHER_STATION WHERE station_name = 'Mumbai (Santacruz)';
    PERFORM pg_temp.report(14, 'A station with readings cannot be deleted (ON DELETE RESTRICT)', false, 'station was deleted');
EXCEPTION WHEN restrict_violation OR foreign_key_violation THEN   -- SQLSTATE 23001 or 23503
    PERFORM pg_temp.report(14, 'A station with readings cannot be deleted (ON DELETE RESTRICT)', true);
END $$;

-- 15. ON DELETE CASCADE: deleting a region deletes its forecasts and warnings
--     (their primary keys include region_id, so they can't exist without it).
DO $$
DECLARE v_region integer; v_left integer;
BEGIN
    INSERT INTO LOCATION (region) VALUES ('Smoke-test region') RETURNING region_id INTO v_region;
    INSERT INTO REGION_FORECAST (region_id, forecast_date, forecast_text, min_temp, max_temp, rain_probability)
    VALUES (v_region, DATE '2005-07-27', 'Test forecast', 24.0, 30.0, 80);
    INSERT INTO REGION_WARNING (region_id, valid_date, hazard, warning_level, advisory_text, source)
    VALUES (v_region, DATE '2005-07-27', 'Rain', 'Orange', 'Test warning', 'admin');

    DELETE FROM LOCATION WHERE region_id = v_region;

    SELECT (SELECT count(*) FROM REGION_FORECAST WHERE region_id = v_region)
         + (SELECT count(*) FROM REGION_WARNING  WHERE region_id = v_region)
      INTO v_left;
    PERFORM pg_temp.report(15, 'Deleting a region deletes its forecasts and warnings (ON DELETE CASCADE)',
                           v_left = 0, format('%s child rows left', v_left));
END $$;

-- 16. The poster's lab lesson: dropping a parent table first fails with 2BP01.
DO $$
BEGIN
    DROP TABLE LOCATION;
    PERFORM pg_temp.report(16, 'Dropping a parent table first fails with 2BP01 (poster lesson)', false, 'LOCATION was dropped');
EXCEPTION WHEN dependent_objects_still_exist THEN         -- SQLSTATE 2BP01
    PERFORM pg_temp.report(16, 'Dropping a parent table first fails with 2BP01 (poster lesson)', true);
END $$;


-- -------------------------------------------------------------------- summary
DO $$
DECLARE v_pass integer; v_fail integer;
BEGIN
    SELECT count(*) FILTER (WHERE passed), count(*) FILTER (WHERE NOT passed)
      INTO v_pass, v_fail
      FROM smoke_result;
    IF v_fail = 0 THEN
        RAISE NOTICE 'SUMMARY: all % checks passed', v_pass;
    ELSE
        RAISE WARNING 'SUMMARY: % passed, % FAILED (see the FAIL lines above)', v_pass, v_fail;
    END IF;
END $$;

-- psql prints this table; in pgAdmin, read the Messages tab instead.
SELECT check_no, passed, name, detail FROM smoke_result ORDER BY check_no;

ROLLBACK;   -- undo every test row: the database is exactly as it was before
