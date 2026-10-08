-- Look up a user by email to check their password at login.
-- (This is the only query that reads password_hash, and it never leaves the server.)
SELECT user_id, region_id, name, email, password_hash, role, created_at
FROM APP_USER
WHERE email = %(email)s;
