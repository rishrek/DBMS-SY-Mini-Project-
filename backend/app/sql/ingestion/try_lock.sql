-- Only one ingestion run at a time: the hourly job and the admin's "Run
-- ingestion" button could otherwise overlap.
-- An advisory lock is a named lock that PostgreSQL keeps for us; the "name" is
-- just a number that every run agrees on. pg_try_advisory_lock returns false at
-- once (instead of waiting) if another session already holds it.
SELECT pg_try_advisory_lock(%(key)s) AS locked;
