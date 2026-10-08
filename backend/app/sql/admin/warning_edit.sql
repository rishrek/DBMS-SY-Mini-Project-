-- An admin edits a warning. Editing makes it admin-owned (source = 'admin'),
-- so the trigger won't change it afterwards.
UPDATE REGION_WARNING
   SET warning_level = %(warning_level)s,
       advisory_text = %(advisory_text)s,
       source        = 'admin',
       issued_at     = now()
 WHERE region_id  = %(region_id)s
   AND valid_date = %(valid_date)s
   AND hazard     = %(hazard)s
RETURNING *;
