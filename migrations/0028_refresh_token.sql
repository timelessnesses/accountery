-- Migration number: 0028 	 2026-11-11T03:03:09.066Z
ALTER TABLE "users" ADD COLUMN "refresh_token" TEXT NOT NULL DEFAULT '';