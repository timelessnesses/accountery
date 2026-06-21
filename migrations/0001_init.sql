-- Migration number: 0001 	 2026-06-21T03:33:47.897Z
CREATE TABLE IF NOT EXISTS "users" (
    "session_token" TEXT,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL PRIMARY KEY,
    "nickname" TEXT NOT NULL,
    "session_expiry" INTEGER
);

CREATE TABLE IF NOT EXISTS "transactions" (
    "id" INTEGER PRIMARY KEY AUTOINCREMENT,
    "email" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "description" TEXT NOT NULL,
    "date" INTEGER NOT NULL,
    "type" TEXT NOT NULL,
    FOREIGN KEY ("email") REFERENCES "users"("email")
);

CREATE TABLE IF NOT EXISTS "obligations" (
    "id" INTEGER PRIMARY KEY AUTOINCREMENT,
    "start_date" INTEGER NOT NULL,
    "end_date" INTEGER NOT NULL,
    "amount" INTEGER NOT NULL,
    "description" TEXT NOT NULL
);