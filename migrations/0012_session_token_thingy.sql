-- Migration number: 0012 	 2026-07-11T11:09:56.159Z
ALTER TABLE "users" ADD COLUMN "session_token" TEXT;
CREATE INDEX IF NOT EXISTS idx_users_session_token ON users(session_token);
