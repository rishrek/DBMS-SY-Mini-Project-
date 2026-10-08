-- An admin clears a warning. We keep the row but set it to Green and make it
-- admin-owned. (Deleting it would let the trigger raise it again at the next
-- hourly reading, while the day's rain is still above the threshold.)
UPDATE REGION_WARNING
   SET warning_level = 'Green',
       advisory_text = %(advisory_text)s,
       source        = 'admin',
       issued_at     = now()
 WHERE region_id  = %(region_id)s
   AND valid_date = %(valid_date)s
   AND hazard     = %(hazard)s
RETURNING *;
