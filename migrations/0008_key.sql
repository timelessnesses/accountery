-- Migration number: 0008 	 2026-07-05T12:40:13.047Z
CREATE TABLE IF NOT EXISTS "slipok_cache_new" (
    transaction_id INTEGER NOT NULL,
    slipok_response TEXT NOT NULL,
    trans_ref TEXT GENERATED ALWAYS AS (json_extract(slipok_response, '$.data.transRef')) STORED,
    sending_bank TEXT GENERATED ALWAYS AS (json_extract(slipok_response, '$.data.sendingBank')) STORED,
    FOREIGN KEY ("transaction_id") REFERENCES "transactions"("id") ON DELETE CASCADE
);

INSERT INTO "slipok_cache_new" (transaction_id, slipok_response)
SELECT transaction_id, slipok_response
FROM "slipok_cache";

DROP TABLE "slipok_cache";

ALTER TABLE "slipok_cache_new" RENAME TO "slipok_cache";

CREATE INDEX "slipok_cache_trans_ref" ON "slipok_cache" (trans_ref, sending_bank);