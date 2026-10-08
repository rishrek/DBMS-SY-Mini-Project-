-- Create an account, or update it if the email already exists (used by
-- scripts/create_users.py, so running the script twice makes no duplicates).
-- The region is looked up by its name.
INSERT INTO APP_USER (region_id, name, email, password_hash, role)
VALUES ((SELECT region_id FROM LOCATION WHERE region = %(region)s),
        %(name)s, %(email)s, %(password_hash)s, %(role)s)
ON CONFLICT (email) DO UPDATE
   SET region_id     = EXCLUDED.region_id,
       name          = EXCLUDED.name,
       password_hash = EXCLUDED.password_hash,
       role          = EXCLUDED.role
RETURNING user_id, email, role;
