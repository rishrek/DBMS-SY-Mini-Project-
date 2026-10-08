-- Close the run's log row with its result ('success' or 'failed').
UPDATE INGESTION_RUN
   SET finished_at     = now(),
       status          = %(status)s,
       rows_inserted   = %(rows_inserted)s,
       warnings_raised = %(warnings_raised)s,
       message         = %(message)s
 WHERE run_id = %(run_id)s;
