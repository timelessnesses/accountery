-- Migration number: 0014 	 2026-09-12T02:34:53.105Z
ALTER TABLE "obligations" ADD COLUMN "end_date" INTEGER
    CHECK (end_date IS NULL OR end_date >= start_date);

UPDATE "obligations" SET "end_date" = "start_date" + 6 * 86400;
