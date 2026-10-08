-- An admin issues a warning (source = 'admin').
-- If this region already has a warning for the same date and hazard (for
-- example an automatic one), the admin's version replaces it and becomes
-- admin-owned, so the trigger leaves it alone from then on.
INSERT INTO REGION_WARNING AS rw
       (region_id, valid_date, hazard, warning_level, advisory_text, source, issued_at)
VALUES (%(region_id)s, %(valid_date)s, %(hazard)s, %(warning_level)s, %(advisory_text)s, 'admin', now())
ON CONFLICT (region_id, valid_date, hazard) DO UPDATE
   SET warning_level = EXCLUDED.warning_level,
       advisory_text = EXCLUDED.advisory_text,
       source        = 'admin',
       issued_at     = EXCLUDED.issued_at
RETURNING rw.*;
