-- Log the start of a run. status starts as 'running' (the column's default).
-- This is saved on its own, before the data transaction, so even a run that
-- fails half-way leaves a row in the log.
INSERT INTO INGESTION_RUN (run_type)
VALUES (%(run_type)s)
RETURNING run_id, started_at;
