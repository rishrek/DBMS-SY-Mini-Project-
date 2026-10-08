-- The 7-day forecast for a region: today and the next 6 days.
SELECT forecast_date,
       forecast_text,
       min_temp,
       max_temp,
       rain_probability
FROM REGION_FORECAST
WHERE region_id = %(region_id)s
  AND forecast_date BETWEEN CURRENT_DATE AND CURRENT_DATE + 6
ORDER BY forecast_date;
