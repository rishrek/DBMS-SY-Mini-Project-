-- Does the project's database exist yet? (run while connected to the "postgres" database)
-- pg_database is PostgreSQL's own catalog table: one row per database on the server.
SELECT 1 AS found
FROM pg_database
WHERE datname = %(name)s;
