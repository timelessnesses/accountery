-- Migration number: 0006 	 2026-06-25T15:15:42.747Z
CREATE TABLE IF NOT EXISTS "slipok_cache" (
    transaction_id INTEGER NOT NULL,
    slipok_response TEXT NOT NULL,
    FOREIGN KEY ("transaction_id") REFERENCES "transactions"("id") ON DELETE CASCADE
);