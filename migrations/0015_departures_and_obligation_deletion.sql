-- Leaving dates use UTC midnight for the selected calendar date, like obligation dates.
ALTER TABLE users ADD COLUMN left_at INTEGER;
-- Retain deleted weeks so the weekly cron does not recreate them.
ALTER TABLE obligations ADD COLUMN deleted_at INTEGER;
