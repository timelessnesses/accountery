-- Migration number: 0005 	 2026-06-22T00:16:42.550Z
ALTER TABLE "transactions" ADD COLUMN "approved" TEXT DEFAULT 'pending';