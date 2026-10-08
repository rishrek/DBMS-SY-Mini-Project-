-- Release the lock taken in try_lock.sql, so the next run can start.
-- (PostgreSQL also releases it automatically if the connection closes.)
SELECT pg_advisory_unlock(%(key)s) AS unlocked;
