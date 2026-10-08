-- Warnings for the admin page, newest first, with optional filters.
-- Each filter reads "(value IS NULL OR column = value)": when the page sends no
-- value for a filter, that condition is simply true, so it filters nothing.
SELECT w.region_id,
       l.region,
       w.valid_date,
       w.hazard,
       w.warning_level,
       w.advisory_text,
       w.source,
       w.issued_at
FROM REGION_WARNING w
JOIN LOCATION l ON l.region_id = w.region_id
WHERE (%(region_id)s::integer IS NULL OR w.region_id  =  %(region_id)s)
  AND (%(date_from)s::date    IS NULL OR w.valid_date >= %(date_from)s)
  AND (%(date_to)s::date      IS NULL OR w.valid_date <= %(date_to)s)
  AND (%(source)s::text       IS NULL OR w.source     =  %(source)s)
ORDER BY w.valid_date DESC, warning_rank(w.warning_level) DESC, l.region, w.hazard
LIMIT %(limit)s;
