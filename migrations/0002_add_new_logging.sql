-- Migration number: 0002 	 2026-06-21T11:59:33.856Z
CREATE TABLE IF NOT EXISTS "logs" (
    "id" INTEGER PRIMARY KEY AUTOINCREMENT,
    "email" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "timestamp" INTEGER NOT NULL,
    FOREIGN KEY ("email") REFERENCES "users"("email")
);