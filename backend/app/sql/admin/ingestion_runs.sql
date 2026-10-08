-- The ingestion log for the admin page, newest first.
SELECT run_id,
       run_type,
       status,
       started_at,
       finished_at,
       round(extract(epoch FROM finished_at - started_at)::numeric, 1) AS seconds,
       rows_inserted,
       warnings_raised,
       message
FROM INGESTION_RUN
ORDER BY run_id DESC
LIMIT %(limit)s;
