-- =============================================================================
--  Climate Intelligence System (KJS-CES-01)                 database/02_seed.sql
-- -----------------------------------------------------------------------------
--  Starting data: 10 regions, 10 stations, the 6 CPCB AQI bands and the 8
--  warning thresholds. Run after 01_schema.sql, connected to climate_db.
--
--  Users are NOT created here. A password hash has to be made with bcrypt, and
--  passwords must come from the .env file (never from a file in the repo), so
--  backend/scripts/create_users.py creates them in Phase 4.
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- Regions: one per station in Fig. 1 of the poster.
-- -----------------------------------------------------------------------------
INSERT INTO LOCATION (region) VALUES
    ('Nagpur'), ('Nashik'), ('Pune'), ('Satara'), ('Ratnagiri'),
    ('Thane'), ('Santacruz'), ('Vashi'), ('Colaba'), ('Alibag');


-- -----------------------------------------------------------------------------
-- Stations: real positions and heights.
--   * IMD stations with a WMO number: NOAA NCEI "Integrated Surface Database"
--     station history, https://www.ncei.noaa.gov/pub/data/noaa/isd-history.txt
--   * Thane and Vashi have no WMO station, so we use the town-centre position and
--     ground height from GeoNames (through the Open-Meteo Geocoding API).
-- Each station's region_id is looked up by region name (the JOIN below), so this
-- script doesn't depend on which numbers the IDENTITY column handed out.
-- -----------------------------------------------------------------------------
INSERT INTO WEATHER_STATION (station_name, latitude, longitude, altitude, region_id)
SELECT s.station_name, s.latitude, s.longitude, s.altitude, l.region_id
FROM (VALUES
    --  station_name            latitude  longitude  altitude(m)  region        source
    ('Nagpur (Sonegaon)',       21.09200, 79.04700,  314.9,       'Nagpur'),    -- WMO 42867
    ('Nashik',                  19.96700, 73.81700,  598.0,       'Nashik'),    -- WMO 42921
    ('Pune (Shivajinagar)',     18.53300, 73.85000,  558.0,       'Pune'),      -- WMO 43063
    ('Satara',                  17.51700, 74.05000,  612.0,       'Satara'),    -- WMO 43113 (ISD position; the town centre is 17.686 N, 73.993 E)
    ('Ratnagiri',               16.98300, 73.33300,   67.0,       'Ratnagiri'), -- WMO 43110
    ('Thane',                   19.19704, 72.96355,   23.0,       'Thane'),     -- GeoNames
    ('Mumbai (Santacruz)',      19.08900, 72.86800,   11.3,       'Santacruz'), -- WMO 43003
    ('Vashi',                   19.07867, 73.00055,    5.0,       'Vashi'),     -- GeoNames
    ('Mumbai (Colaba)',         18.90000, 72.81700,   11.0,       'Colaba'),    -- WMO 43057
    ('Alibag',                  18.63300, 72.86700,    7.0,       'Alibag')     -- WMO 43058
) AS s (station_name, latitude, longitude, altitude, region)
JOIN LOCATION l ON l.region = s.region;


-- -----------------------------------------------------------------------------
-- CPCB National Air Quality Index bands (CPCB, 2014; poster reference [7]).
-- The EXCLUDE constraint on AQI_CATEGORY guarantees these never overlap.
-- -----------------------------------------------------------------------------
INSERT INTO AQI_CATEGORY (category, aqi_min, aqi_max) VALUES
    ('Good',           0,  50),
    ('Satisfactory',  51, 100),
    ('Moderate',     101, 200),
    ('Poor',         201, 300),
    ('Very Poor',    301, 400),
    ('Severe',       401, 500);


-- -----------------------------------------------------------------------------
-- Warning thresholds used by the trigger (a warning is raised when value >= min_value).
--   Rain:        IMD rainfall categories heavy (64.5 mm), very heavy (115.6 mm)
--                and extremely heavy (204.5 mm), applied to the total since 00:00.
--   Heat:        max_temp of 40 / 45 / 47 °C.
--   Air Quality: the CPCB 'Very Poor' (301) and 'Severe' (401) bands.
-- These are simplified IMD-style rules, NOT official IMD warnings, and the
-- website says so. To tune one:  UPDATE WARNING_THRESHOLD SET min_value = ...
-- -----------------------------------------------------------------------------
INSERT INTO WARNING_THRESHOLD (hazard, warning_level, min_value, advisory_text) VALUES
    ('Rain',        'Yellow',  64.5, 'Heavy rain: 64.5 mm or more since midnight. Avoid waterlogged roads and low-lying areas.'),
    ('Rain',        'Orange', 115.6, 'Very heavy rain: 115.6 mm or more since midnight. Expect flooding in low-lying areas; travel only if you must.'),
    ('Rain',        'Red',    204.5, 'Extremely heavy rain: 204.5 mm or more since midnight. Stay indoors and keep away from rivers, nullahs and hill slopes.'),
    ('Heat',        'Yellow',  40.0, 'Hot day: 40 °C or more. Drink water often and avoid direct sun from 12 to 4 pm.'),
    ('Heat',        'Orange',  45.0, 'Severe heat: 45 °C or more. Stay indoors in the afternoon and check on elderly neighbours.'),
    ('Heat',        'Red',     47.0, 'Extreme heat: 47 °C or more. High risk of heatstroke; avoid outdoor work and open-air events.'),
    ('Air Quality', 'Orange', 301.0, 'Very poor air (AQI 301-400). Limit time outdoors; children, older people and anyone with asthma should stay inside.'),
    ('Air Quality', 'Red',    401.0, 'Severe air (AQI 401 or more). Everyone should avoid outdoor activity; wear an N95 mask if you must go out.');

COMMIT;
