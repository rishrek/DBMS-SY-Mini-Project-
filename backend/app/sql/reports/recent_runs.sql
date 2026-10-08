-- The last few ingestion runs, newest first.
SELECT run_id,
       run_type,
       status,
       rows_inserted,
       warnings_raised,
       to_char(started_at, 'YYYY-MM-DD HH24:MI:SS')                   AS started,
       round(extract(epoch FROM finished_at - started_at)::numeric, 1) AS seconds,
       message
FROM INGESTION_RUN
ORDER BY run_id DESC
LIMIT 5;
