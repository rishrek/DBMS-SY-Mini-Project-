-- "Is there a warning for my area today?"
-- Today's warnings for one region, most serious first. CURRENT_DATE is the
-- Indian date, because the database's time zone is Asia/Kolkata.
-- A Green row means an admin cleared that hazard for today.
SELECT w.hazard,
       w.warning_level,
       warning_rank(w.warning_level) AS level_rank,
       w.advisory_text,
       w.source,
       w.issued_at
FROM REGION_WARNING w
WHERE w.region_id = %(region_id)s
  AND w.valid_date = CURRENT_DATE
ORDER BY warning_rank(w.warning_level) DESC, w.hazard;
