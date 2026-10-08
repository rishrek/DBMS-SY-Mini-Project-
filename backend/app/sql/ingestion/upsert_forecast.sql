-- Save a region's forecast for one day.
-- A forecast changes as the day gets closer, so here the NEWEST forecast wins:
-- ON CONFLICT ... DO UPDATE replaces the stored one ("upsert").
-- Readings use DO NOTHING instead, because history must never change.
INSERT INTO REGION_FORECAST AS f
       (region_id, forecast_date, forecast_text, min_temp, max_temp, rain_probability)
VALUES (%(region_id)s, %(forecast_date)s, %(forecast_text)s, %(min_temp)s, %(max_temp)s, %(rain_probability)s)
ON CONFLICT (region_id, forecast_date) DO UPDATE
   SET forecast_text    = EXCLUDED.forecast_text,
       min_temp         = EXCLUDED.min_temp,
       max_temp         = EXCLUDED.max_temp,
       rain_probability = EXCLUDED.rain_probability;
