-- =============================================================================
--  Climate Intelligence System (KJS-CES-01)       database/03_views_functions.sql
-- -----------------------------------------------------------------------------
--  Reusable SQL objects the website is built on:
--    warning_rank()           turns an IMD colour into a number so levels can be compared
--    v_current_conditions     newest reading of each station + station, region, AQI band
--    region_daily_summary()   one row per day for a region (feeds the charts)
--  Run after 02_seed.sql, connected to climate_db.
--  Safe to re-run on its own after an edit (CREATE OR REPLACE). If you change a
--  view's columns or a function's result columns, run reset.sql and rebuild.
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- warning_rank('Orange') = 2
-- Text can't be compared with > to find the more serious colour ('Red' sorts
-- before 'Yellow' alphabetically), so each IMD colour gets a number.
-- IMMUTABLE tells PostgreSQL the same input always gives the same output,
-- which lets it be used freely in indexes and WHERE clauses.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION warning_rank(p_level text)
RETURNS integer
LANGUAGE sql
IMMUTABLE
AS $$
    SELECT CASE p_level
               WHEN 'Green'  THEN 0
               WHEN 'Yellow' THEN 1
               WHEN 'Orange' THEN 2
               WHEN 'Red'    THEN 3
           END;
$$;


-- -----------------------------------------------------------------------------
-- v_current_conditions: the latest reading of every station that has readings.
--
-- DISTINCT ON (w.station_id) keeps the FIRST row of each station after sorting,
-- and the ORDER BY puts the newest reading first (date DESC, then time DESC).
--
-- The AQI band is matched with BETWEEN, as on the poster (Fig. 4). It's a LEFT
-- JOIN so a reading with no AQI (NULL) still shows up, with a NULL category.
--
-- prec_intensity_label: the Light / Moderate / Heavy classes of rainfall rate
-- (light < 2.5 mm/h, moderate 2.5–7.6 mm/h, heavy > 7.6 mm/h). The label is
-- computed here rather than stored, the same way the AQI band is, so
-- WEATHER_DATA gets no transitive dependency prec_intensity → label.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE VIEW v_current_conditions AS
SELECT DISTINCT ON (w.station_id)
       w.station_id,
       s.station_name,
       s.latitude,
       s.longitude,
       s.altitude,
       s.region_id,
       l.region,
       w.weather_id,
       w.reading_date,
       w.reading_time,
       w.reading_date + w.reading_time AS reading_at,       -- date + time = timestamp
       w.current_conditions,
       w.current_temp,
       w.min_temp,
       w.max_temp,
       w.feels_like,
       w.dew_point,
       w.wet_bulb,
       w.humidity,
       w.wind_speed,
       w.wind_direction,
       w.pressure,
       w.prec_type,
       w.prec_probability,
       w.prec_intensity,
       CASE
           WHEN w.prec_intensity IS NULL THEN NULL
           WHEN w.prec_intensity = 0     THEN 'None'
           WHEN w.prec_intensity < 2.5   THEN 'Light'
           WHEN w.prec_intensity <= 7.6  THEN 'Moderate'
           ELSE                               'Heavy'
       END AS prec_intensity_label,
       w.prec_amount,
       w.prec_duration,
       w.aqi,
       c.category AS aqi_category,
       w.visibility,
       w.co2,
       w.pm2_5,
       w.pm10,
       w.ozone
FROM WEATHER_DATA w
JOIN WEATHER_STATION s   ON s.station_id = w.station_id
JOIN LOCATION l          ON l.region_id  = s.region_id
LEFT JOIN AQI_CATEGORY c ON w.aqi BETWEEN c.aqi_min AND c.aqi_max
ORDER BY w.station_id, w.reading_date DESC, w.reading_time DESC;

COMMENT ON VIEW v_current_conditions IS
    'Latest reading per station, joined to its station, region and CPCB AQI band';


-- -----------------------------------------------------------------------------
-- region_daily_summary(region_id, from_date, to_date)
--   → one row per day: temperatures, rainfall, rain hours, humidity, wind, AQI.
--   Example:  SELECT * FROM region_daily_summary(3, DATE '2026-09-01', DATE '2026-09-07');
--
-- Two steps, because a region can have several stations:
--   1. station_day: squash each station's hourly readings into one row per day.
--      Rain uses MAX(prec_amount): prec_amount is "mm since 00:00", so its
--      largest value that day is the day's total.
--   2. Average those station-days into one row per day for the region
--      (for a region with one station, this just passes the values through).
-- STABLE: it only reads the database and doesn't change anything.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION region_daily_summary(p_region_id integer, p_from date, p_to date)
RETURNS TABLE (
    reading_date    date,
    stations        integer,   -- how many stations reported that day
    readings        integer,   -- how many hourly readings in total
    avg_temp        numeric,
    min_temp        numeric,
    max_temp        numeric,
    rain_mm         numeric,   -- the day's rainfall (average over the region's stations)
    rain_hours      numeric,   -- hours with rain (average over the stations)
    avg_humidity    numeric,
    max_wind_speed  numeric,
    avg_aqi         numeric,
    max_aqi         integer
)
LANGUAGE sql
STABLE
AS $$
    WITH station_day AS (                                   -- step 1
        SELECT w.station_id,
               w.reading_date,
               count(*)             AS readings,
               avg(w.current_temp)  AS avg_temp,
               min(w.min_temp)      AS min_temp,
               max(w.max_temp)      AS max_temp,
               max(w.prec_amount)   AS rain_mm,
               max(w.prec_duration) AS rain_hours,
               avg(w.humidity)      AS avg_humidity,
               max(w.wind_speed)    AS max_wind_speed,
               avg(w.aqi)           AS avg_aqi,
               max(w.aqi)           AS max_aqi
        FROM WEATHER_DATA w
        JOIN WEATHER_STATION s ON s.station_id = w.station_id
        WHERE s.region_id = p_region_id
          AND w.reading_date BETWEEN p_from AND p_to
        GROUP BY w.station_id, w.reading_date
    )
    SELECT sd.reading_date,                                 -- step 2
           count(*)::integer                      AS stations,
           sum(sd.readings)::integer              AS readings,
           round(avg(sd.avg_temp), 1)             AS avg_temp,
           min(sd.min_temp)::numeric              AS min_temp,
           max(sd.max_temp)::numeric              AS max_temp,
           round(avg(sd.rain_mm), 1)              AS rain_mm,
           round(avg(sd.rain_hours), 1)           AS rain_hours,
           round(avg(sd.avg_humidity), 0)         AS avg_humidity,
           max(sd.max_wind_speed)::numeric        AS max_wind_speed,
           round(avg(sd.avg_aqi), 0)              AS avg_aqi,
           max(sd.max_aqi)::integer               AS max_aqi
    FROM station_day sd
    GROUP BY sd.reading_date
    ORDER BY sd.reading_date;
$$;

COMMIT;
