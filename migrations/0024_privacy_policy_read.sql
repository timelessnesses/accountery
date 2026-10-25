-- Migration number: 0024 	 2026-10-24T09:20:08.002Z
ALTER TABLE users ADD COLUMN privacy_policy_read_version INTEGER NOT NULL DEFAULT 0;
