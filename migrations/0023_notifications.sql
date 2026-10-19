-- Migration number: 0023 	 2026-10-07T05:27:59.847Z
CREATE TABLE notifications(
    endpoint TEXT NOT NULL,
    email TEXT NOT NULL REFERENCES users(email) ON DELETE CASCADE,
    p256dh TEXT NOT NULL,
    auth TEXT NOT NULL
);