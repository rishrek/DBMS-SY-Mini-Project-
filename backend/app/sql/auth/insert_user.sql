-- Self-registration: a new account is always a plain 'user' (never an admin).
-- UNIQUE(email) makes the database refuse a second account with the same email.
INSERT INTO APP_USER (region_id, name, email, password_hash, role)
VALUES (%(region_id)s, %(name)s, %(email)s, %(password_hash)s, 'user')
RETURNING user_id;
