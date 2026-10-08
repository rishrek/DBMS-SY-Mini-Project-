-- Days on which a user's region had an Orange or Red warning  (MULTI-TABLE JOIN)
--
-- APP_USER -> LOCATION        (u.region_id = l.region_id): the user's region name
-- APP_USER -> REGION_WARNING  (u.region_id = w.region_id): that region's warnings
-- This is the poster's core idea: the user is linked to a region, so the
-- warnings they see are only the ones for where they live.
SELECT u.name,
       l.region,
       w.valid_date,
       w.hazard,
       w.warning_level,
       w.source,
       w.advisory_text
FROM APP_USER u
JOIN LOCATION l       ON l.region_id = u.region_id
JOIN REGION_WARNING w ON w.region_id = u.region_id
WHERE u.user_id = %(user_id)s
  AND w.warning_level IN ('Orange', 'Red')
ORDER BY w.valid_date DESC, w.hazard;
