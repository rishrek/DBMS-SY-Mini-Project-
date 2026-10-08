-- How many warnings the trigger created or upgraded in THIS transaction.
-- now() does not tick inside a transaction: it is the moment the transaction
-- began. The trigger stamps issued_at = now(), so every warning this run touched
-- carries exactly that timestamp.
SELECT count(*) AS warnings
FROM REGION_WARNING
WHERE source = 'auto'
  AND issued_at = now();
