-- Migration number: 0028 	 2026-11-13T08:36:43.983Z
CREATE INDEX IF NOT EXISTS idx_transactions_email_approved
ON transactions(email, approved);