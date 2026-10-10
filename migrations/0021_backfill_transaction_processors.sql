-- Attribute historical decisions that predate processor tracking.
UPDATE transactions
SET processor = '6910310259@tsu.ac.th'
WHERE approved IN ('approved', 'rejected', 'voided')
  AND (processor IS NULL OR TRIM(processor) = '');
