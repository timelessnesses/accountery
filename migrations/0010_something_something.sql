-- Migration number: 0010 	 2026-07-06T14:59:21.427Z
DROP INDEX IF EXISTS idx_users_session_token;
ALTER TABLE "users" DROP COLUMN "session_token";
ALTER TABLE "users" ADD COLUMN "logged_in_when" INTEGER;