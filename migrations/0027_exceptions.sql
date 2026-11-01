-- Migration number: 0027 	 2026-11-01T13:01:09.739Z
CREATE TABLE IF NOT EXISTS exception_obligation (
    obligation_id INTEGER NOT NULL,
    email TEXT NOT NULL,
    granted_by TEXT NOT NULL,
    granted_at INTEGER NOT NULL,
    grant_reason TEXT NOT NULL,
    voided_at INTEGER,
    FOREIGN KEY (obligation_id) REFERENCES obligations(id),
    FOREIGN KEY (email) REFERENCES users(email),
    FOREIGN KEY (granted_by) REFERENCES users(email)
);

CREATE INDEX IF NOT EXISTS idx_exception_obligation_email_active
    ON exception_obligation (email, voided_at);

CREATE UNIQUE INDEX IF NOT EXISTS idx_exception_obligation_one_active
    ON exception_obligation (obligation_id, email)
    WHERE voided_at IS NULL;
