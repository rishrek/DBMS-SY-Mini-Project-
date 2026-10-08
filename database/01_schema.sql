
BEGIN;   -- DDL in PostgreSQL is transactional: if any statement fails, nothing is created.

-- CURRENT_DATE and now() should mean Indian time for every session on this
-- database. India has no daylight saving, so an IST date + time is never ambiguous.
DO $$
BEGIN
    EXECUTE format('ALTER DATABASE %I SET timezone TO %L', current_database(), 'Asia/Kolkata');
END $$;
SET timezone TO 'Asia/Kolkata';   -- ALTER DATABASE affects new sessions; this covers the current one


-- -----------------------------------------------------------------------------
-- 1. LOCATION: one row per region.        Poster: LOCATION(region_id PK, region)
--    FDs:  region_id → region,   region → region_id   (region names are unique)
--    Candidate keys: {region_id}, {region}. Both determinants are keys → BCNF.
-- -----------------------------------------------------------------------------
CREATE TABLE LOCATION (
    region_id  integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,   -- surrogate key, numbered by PostgreSQL
    region     text    NOT NULL UNIQUE                             -- e.g. 'Colaba'
);


-- -----------------------------------------------------------------------------
-- 2. WEATHER_STATION: where readings are taken.   Poster columns + station_name
--    FD:   station_id → station_name, latitude, longitude, altitude, region_id
--    Two stations may share a site (say a rain gauge next to an automatic
--    station), so (latitude, longitude) is not a key and determines nothing
--    on its own. The only determinant is station_id, the key → BCNF.
--    region_id is a plain FK, not part of the key (non-identifying relationship).
-- -----------------------------------------------------------------------------
CREATE TABLE WEATHER_STATION (
    station_id    integer      GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    station_name  text         NOT NULL,                                         -- approved addition
    latitude      numeric(8,5) NOT NULL CHECK (latitude  BETWEEN  -90 AND   90),
    longitude     numeric(8,5) NOT NULL CHECK (longitude BETWEEN -180 AND  180),
    altitude      numeric(6,1) NOT NULL CHECK (altitude  BETWEEN -430 AND 8849),  -- metres: Dead Sea shore .. Everest
    region_id     integer      NOT NULL
                  REFERENCES LOCATION (region_id) ON DELETE RESTRICT             -- can't delete a region that has stations
);

-- Index on the FK column: makes "stations in region X" fast, and lets
-- PostgreSQL check ON DELETE RESTRICT without reading the whole table.
CREATE INDEX idx_weather_station_region_id ON WEATHER_STATION (region_id);


-- -----------------------------------------------------------------------------
-- 3. WEATHER_DATA: one row per station per reading time (the 22 reading values)
--
--    Candidate keys: {weather_id} (surrogate PK) and
--                    {station_id, reading_date, reading_time} (UNIQUE below;
--                    this is what lets a station keep its full history)
--    FDs:  weather_id → every column
--          (station_id, reading_date, reading_time) → every column
--
--    Why there are no other FDs, so the table is in BCNF:
--      * Day-level values are stored "so far today": min_temp, max_temp,
--        prec_amount and prec_duration run from 00:00 up to this reading.
--        They change from reading to reading, so (station_id, reading_date) alone
--        does NOT determine them: no partial dependency (2NF).
--      * No stored value is calculated from another column of the same row:
--          - prec_intensity is stored as a number (mm/h); its Light/Moderate/
--            Heavy label is worked out in v_current_conditions, the same fix
--            the poster used for AQI -> Air_Condition (3NF);
--          - prec_type comes from Open-Meteo's rain/showers/snowfall amounts,
--            not from the weather code behind current_conditions;
--          - aqi uses 24-hour rolling averages of PM2.5 and PM10 (earlier
--            rows), so this row's pm2_5 and pm10 do not determine it.
--        So there is no transitive dependency and no non-key determinant.
--      * Measured values (temperature, humidity, dew point, ...) come from the
--        data source as separate observations; we never compute one from another.
--
--    Units: °C, %, km/h, degrees, hPa, mm, mm/h, h, km, ppm, µg/m³.
--    Reading values may be NULL. NULL means "not measured" (a sensor gap).
-- -----------------------------------------------------------------------------
CREATE TABLE WEATHER_DATA (
    weather_id          bigint       GENERATED ALWAYS AS IDENTITY PRIMARY KEY,  -- bigint: ~350,000 new rows a year
    station_id          integer      NOT NULL
                        REFERENCES WEATHER_STATION (station_id) ON DELETE RESTRICT,  -- keep history: refuse to delete a station with readings
    reading_date        date         NOT NULL,                                   -- IST
    reading_time        time(0)      NOT NULL,                                   -- IST; every 15 minutes (backfilled days: hourly)

    -- conditions and temperature --------------------------------------------
    current_conditions  text,                                                    -- e.g. 'Moderate rain' (from the WMO weather code)
    current_temp        numeric(4,1) CHECK (current_temp BETWEEN  -90 AND 60),   -- world records: -89.2 .. 56.7 °C
    min_temp            numeric(4,1) CHECK (min_temp     BETWEEN  -90 AND 60),   -- lowest since 00:00
    max_temp            numeric(4,1) CHECK (max_temp     BETWEEN  -90 AND 60),   -- highest since 00:00 (Heat warnings)
    feels_like          numeric(4,1) CHECK (feels_like   BETWEEN -100 AND 80),   -- apparent temp can go past the air-temp records
    dew_point           numeric(4,1) CHECK (dew_point    BETWEEN  -90 AND 60),
    wet_bulb            numeric(4,1) CHECK (wet_bulb     BETWEEN  -90 AND 60),
    humidity            smallint     CHECK (humidity     BETWEEN    0 AND 100),  -- the poster's "humidity of 140%" is rejected here

    -- wind and pressure ------------------------------------------------------
    wind_speed          numeric(5,1) CHECK (wind_speed     BETWEEN   0 AND  410), -- km/h; record gust 408 km/h
    wind_direction      smallint     CHECK (wind_direction BETWEEN   0 AND  360), -- degrees the wind blows FROM; 0 = north
    pressure            numeric(6,1) CHECK (pressure       BETWEEN 870 AND 1085), -- hPa at mean sea level; records ~870 .. 1084

    -- precipitation ----------------------------------------------------------
    prec_type           text         CHECK (prec_type IN ('None', 'Rain', 'Showers', 'Snow')),
    prec_probability    smallint     CHECK (prec_probability BETWEEN 0 AND  100),  -- %
    prec_intensity      numeric(5,1) CHECK (prec_intensity   BETWEEN 0 AND  500),  -- mm/h in the hour before this reading
    prec_amount         numeric(6,1) CHECK (prec_amount      BETWEEN 0 AND 2000),  -- mm since 00:00 (Rain warnings); 24-h record 1,825 mm
    prec_duration       numeric(3,1) CHECK (prec_duration    BETWEEN 0 AND   24),  -- hours with precipitation since 00:00

    -- air quality and visibility ---------------------------------------------
    aqi                 smallint     CHECK (aqi BETWEEN 0 AND 500),  -- Indian National AQI (CPCB); its band comes from AQI_CATEGORY
    visibility          numeric(5,1) CHECK (visibility >= 0),        -- km
    co2                 numeric(6,1) CHECK (co2        >= 0),        -- ppm
    pm2_5               numeric(6,1) CHECK (pm2_5      >= 0),        -- µg/m³
    pm10                numeric(6,1) CHECK (pm10       >= 0),        -- µg/m³
    ozone               numeric(6,1) CHECK (ozone      >= 0),        -- µg/m³

    -- One reading per station per date and time. PostgreSQL enforces UNIQUE with
    -- a B-tree index on (station_id, reading_date, reading_time). That index is
    -- the one the spec asks for, and because station_id is its first column it
    -- also serves the station_id foreign key, so no separate index is created.
    CONSTRAINT uq_weather_data_station_date_time UNIQUE (station_id, reading_date, reading_time),

    -- The lowest-so-far can't be above the current temperature, and so on.
    -- A CHECK only fails when its condition is FALSE; NULL (a missing value) passes.
    CONSTRAINT ck_weather_data_temp_order
        CHECK (min_temp <= max_temp AND min_temp <= current_temp AND current_temp <= max_temp)
);


-- -----------------------------------------------------------------------------
-- 4. AQI_CATEGORY: CPCB National AQI bands. Poster's 3NF fix: Air_Condition is no
--    longer stored; a reading's band is found with
--        WEATHER_DATA.aqi BETWEEN aqi_min AND aqi_max
--    FDs:  category → aqi_min, aqi_max
--          aqi_min  → category, aqi_max     (bands can't overlap, so each start
--          aqi_max  → category, aqi_min      and each end belongs to one band)
--    Candidate keys: {category}, {aqi_min}, {aqi_max}. Every determinant is a
--    key → BCNF.
-- -----------------------------------------------------------------------------
CREATE TABLE AQI_CATEGORY (
    category  text    PRIMARY KEY,                -- 'Good', 'Satisfactory', ...
    aqi_min   integer NOT NULL,
    aqi_max   integer NOT NULL,
    CONSTRAINT ck_aqi_category_bounds CHECK (0 <= aqi_min AND aqi_min <= aqi_max AND aqi_max <= 500),

    -- No two bands may overlap. int4range(aqi_min, aqi_max, '[]') is the band as
    -- a closed range [min, max], and && means "overlaps". The GiST index behind
    -- this EXCLUDE constraint refuses any band that overlaps an existing one
    -- (SQLSTATE 23P01). The poster noted that a BETWEEN match can't be enforced
    -- the way a foreign key is; this constraint, plus the Integrity page's check
    -- that every stored AQI lands in exactly one band, closes that gap.
    CONSTRAINT ex_aqi_category_no_overlap
        EXCLUDE USING gist ((int4range(aqi_min, aqi_max, '[]')) WITH &&)
);


-- -----------------------------------------------------------------------------
-- 5. APP_USER: website users. Poster: (user_id, region_id); + approved columns
--    FDs:  user_id → region_id, name, email, password_hash, role, created_at
--          email   → user_id, region_id, ...            (emails are unique)
--    Candidate keys: {user_id}, {email} → BCNF.
--    Only region_id is stored here, never the region name (the poster's 3NF
--    fix), so a user's region is recorded in exactly one place: LOCATION.
-- -----------------------------------------------------------------------------
CREATE TABLE APP_USER (
    user_id        integer     GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    region_id      integer     NOT NULL
                   REFERENCES LOCATION (region_id) ON DELETE RESTRICT,   -- every user belongs to a region
    name           text        NOT NULL,
    email          text        NOT NULL UNIQUE,           -- the backend saves emails in lower case
    password_hash  text        NOT NULL,                  -- bcrypt hash, never the password itself
    role           text        NOT NULL DEFAULT 'user' CHECK (role IN ('admin', 'user')),
    created_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_app_user_region_id ON APP_USER (region_id);   -- FK index: "users in region X"


-- -----------------------------------------------------------------------------
-- 6. REGION_FORECAST: daily forecast per region. The poster's 2NF fix, plus the
--    approved min_temp, max_temp and rain_probability columns.
--    FD:   (region_id, forecast_date) → forecast_text, min_temp, max_temp, rain_probability
--    forecast_text is written from the day's weather code and expected rain in
--    mm, which no other column stores, so no other column determines it.
--    The only determinant is the key → BCNF.
--    region_id is part of the key (an identifying relationship), so deleting a
--    region deletes its forecasts (ON DELETE CASCADE). The PK index starts with
--    region_id, so it also serves the FK.
-- -----------------------------------------------------------------------------
CREATE TABLE REGION_FORECAST (
    region_id         integer      NOT NULL REFERENCES LOCATION (region_id) ON DELETE CASCADE,
    forecast_date     date         NOT NULL,
    forecast_text     text         NOT NULL,          -- e.g. 'Rain showers, about 12 mm expected'
    min_temp          numeric(4,1) CHECK (min_temp BETWEEN -90 AND 60),
    max_temp          numeric(4,1) CHECK (max_temp BETWEEN -90 AND 60),
    rain_probability  smallint     CHECK (rain_probability BETWEEN 0 AND 100),   -- %
    PRIMARY KEY (region_id, forecast_date),
    CONSTRAINT ck_region_forecast_temp_order CHECK (min_temp <= max_temp)
);


-- -----------------------------------------------------------------------------
-- 7. REGION_WARNING: one warning per region, date and hazard (poster's 1NF fix)
--    FD:   (region_id, valid_date, hazard) → warning_level, advisory_text, source, issued_at
--    The only determinant is the key → BCNF.
--    (hazard, warning_level) does NOT determine advisory_text, because an admin
--    can write any advisory. Auto warnings copy the threshold's text when they
--    are issued, so editing a threshold later doesn't rewrite past warnings.
--    source: 'auto' = raised by the trigger; 'admin' = issued, edited or
--    cleared by an admin. Clearing sets warning_level = 'Green' and
--    source = 'admin'; the trigger never changes admin rows.
-- -----------------------------------------------------------------------------
CREATE TABLE REGION_WARNING (
    region_id      integer     NOT NULL REFERENCES LOCATION (region_id) ON DELETE CASCADE,
    valid_date     date        NOT NULL,
    hazard         text        NOT NULL,             -- 'Rain', 'Heat', 'Air Quality', or a hazard an admin names
    warning_level  text        NOT NULL CHECK (warning_level IN ('Green', 'Yellow', 'Orange', 'Red')),
    advisory_text  text,
    source         text        NOT NULL DEFAULT 'admin' CHECK (source IN ('auto', 'admin')),
    issued_at      timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (region_id, valid_date, hazard)      -- starts with region_id, so it also serves the FK
);


-- -----------------------------------------------------------------------------
-- 8. WARNING_THRESHOLD: support table holding the numbers the trigger compares
--    against, so a threshold can be tuned with an UPDATE instead of by editing
--    the trigger. A warning is raised when the measured value >= min_value.
--    FDs:  (hazard, warning_level) → min_value, advisory_text
--          (hazard, min_value)     → warning_level, advisory_text
--    Candidate keys: {hazard, warning_level}, {hazard, min_value} → BCNF.
--    There is deliberately no "unit" column: the unit depends on the hazard
--    alone (Rain → mm), which would be a partial dependency and break 2NF.
--    The trigger knows which WEATHER_DATA column each hazard uses.
-- -----------------------------------------------------------------------------
CREATE TABLE WARNING_THRESHOLD (
    hazard         text         NOT NULL,     -- 'Rain' | 'Heat' | 'Air Quality'
    warning_level  text         NOT NULL CHECK (warning_level IN ('Yellow', 'Orange', 'Red')),
    min_value      numeric(6,1) NOT NULL,
    advisory_text  text         NOT NULL,
    PRIMARY KEY (hazard, warning_level),
    CONSTRAINT uq_warning_threshold_hazard_value UNIQUE (hazard, min_value)
);


-- -----------------------------------------------------------------------------
-- 9. INGESTION_RUN: support table, one row per data load (approved in Phase 1)
--    FD:   run_id → every column. Single-column key → BCNF.
--    run_type 'live' is the 15-minute job; 'hourly' is kept for older runs.
-- -----------------------------------------------------------------------------
CREATE TABLE INGESTION_RUN (
    run_id           integer     GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    run_type         text        NOT NULL CHECK (run_type IN ('backfill', 'hourly', 'manual', 'live')),
    started_at       timestamptz NOT NULL DEFAULT now(),
    finished_at      timestamptz,
    status           text        NOT NULL DEFAULT 'running' CHECK (status IN ('running', 'success', 'failed')),
    rows_inserted    integer     CHECK (rows_inserted   >= 0),
    warnings_raised  integer     CHECK (warnings_raised >= 0),
    message          text,
    CONSTRAINT ck_ingestion_run_finish CHECK (finished_at IS NULL OR finished_at >= started_at)
);


-- -----------------------------------------------------------------------------
-- Comments: pgAdmin shows these in each table's Properties and Columns panels.
-- -----------------------------------------------------------------------------
COMMENT ON TABLE LOCATION          IS 'Regions. FDs: region_id <-> region. BCNF.';
COMMENT ON TABLE WEATHER_STATION   IS 'Stations, each in one region. FD: station_id -> all. BCNF.';
COMMENT ON TABLE WEATHER_DATA      IS 'Readings every 15 minutes (backfilled days are hourly), 22 values each. Keys: weather_id; (station_id, reading_date, reading_time). Day-level values are "so far today". BCNF.';
COMMENT ON TABLE AQI_CATEGORY      IS 'CPCB AQI bands, matched with aqi BETWEEN aqi_min AND aqi_max. Keys: category; aqi_min; aqi_max. BCNF.';
COMMENT ON TABLE APP_USER          IS 'Website users, each linked to one region. Keys: user_id; email. BCNF.';
COMMENT ON TABLE REGION_FORECAST   IS 'Daily forecast per region. Key: (region_id, forecast_date). BCNF.';
COMMENT ON TABLE REGION_WARNING    IS 'One warning per region, date and hazard. Key: (region_id, valid_date, hazard). BCNF.';
COMMENT ON TABLE WARNING_THRESHOLD IS 'Trigger thresholds (warn when value >= min_value). Keys: (hazard, warning_level); (hazard, min_value). BCNF.';
COMMENT ON TABLE INGESTION_RUN     IS 'Log of data loads from Open-Meteo. Key: run_id. BCNF.';

COMMENT ON COLUMN WEATHER_DATA.reading_date       IS 'Date of the reading, IST';
COMMENT ON COLUMN WEATHER_DATA.reading_time       IS 'Time of the reading, IST (every 15 minutes: HH:00, HH:15, HH:30, HH:45; backfilled days are hourly, HH:00)';
COMMENT ON COLUMN WEATHER_DATA.current_conditions IS 'Weather description from the WMO weather code';
COMMENT ON COLUMN WEATHER_DATA.current_temp       IS 'Air temperature at 2 m, °C';
COMMENT ON COLUMN WEATHER_DATA.min_temp           IS 'Lowest temperature since 00:00 up to this reading, °C';
COMMENT ON COLUMN WEATHER_DATA.max_temp           IS 'Highest temperature since 00:00 up to this reading, °C (used for Heat warnings)';
COMMENT ON COLUMN WEATHER_DATA.feels_like         IS 'Apparent ("feels like") temperature, °C';
COMMENT ON COLUMN WEATHER_DATA.dew_point          IS 'Dew point at 2 m, °C';
COMMENT ON COLUMN WEATHER_DATA.wet_bulb           IS 'Wet-bulb temperature at 2 m, °C';
COMMENT ON COLUMN WEATHER_DATA.humidity           IS 'Relative humidity at 2 m, %';
COMMENT ON COLUMN WEATHER_DATA.wind_speed         IS 'Wind speed at 10 m, km/h';
COMMENT ON COLUMN WEATHER_DATA.wind_direction     IS 'Direction the wind blows from, degrees (0 = north, 90 = east)';
COMMENT ON COLUMN WEATHER_DATA.pressure           IS 'Air pressure at mean sea level, hPa';
COMMENT ON COLUMN WEATHER_DATA.prec_type          IS 'None / Rain / Showers / Snow, from the precipitation amounts since the previous reading';
COMMENT ON COLUMN WEATHER_DATA.prec_probability   IS 'Chance of precipitation in the hour, %';
COMMENT ON COLUMN WEATHER_DATA.prec_intensity     IS 'Precipitation in the hour before this reading, mm/h';
COMMENT ON COLUMN WEATHER_DATA.prec_amount        IS 'Precipitation since 00:00 up to this reading, mm (used for Rain warnings)';
COMMENT ON COLUMN WEATHER_DATA.prec_duration      IS 'Clock hours with any precipitation since 00:00 up to this reading';
COMMENT ON COLUMN WEATHER_DATA.aqi                IS 'Indian National AQI (CPCB), 0-500, from 24-hour rolling PM2.5 and PM10 averages';
COMMENT ON COLUMN WEATHER_DATA.visibility         IS 'Visibility, km';
COMMENT ON COLUMN WEATHER_DATA.co2                IS 'Carbon dioxide, ppm';
COMMENT ON COLUMN WEATHER_DATA.pm2_5              IS 'Fine particulate matter PM2.5, µg/m³';
COMMENT ON COLUMN WEATHER_DATA.pm10               IS 'Particulate matter PM10, µg/m³';
COMMENT ON COLUMN WEATHER_DATA.ozone              IS 'Ozone, µg/m³';
COMMENT ON COLUMN WEATHER_STATION.altitude        IS 'Height above mean sea level, m';
COMMENT ON COLUMN REGION_FORECAST.rain_probability IS 'Highest hourly chance of rain on the day, %';
COMMENT ON COLUMN WARNING_THRESHOLD.min_value     IS 'Warn when the value reaches this: Rain = mm since 00:00, Heat = max_temp in °C, Air Quality = AQI';

COMMIT;
