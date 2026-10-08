-- One row per day for a region (daily rainfall and AQI charts), from the
-- function defined in database/03_views_functions.sql.
SELECT *
FROM region_daily_summary(%(region_id)s, %(date_from)s, %(date_to)s);
