-- Migration number: 0007 	 2026-07-02T13:44:49.202Z
ALTER TABLE "users" ADD COLUMN "role" TEXT DEFAULT 'user';