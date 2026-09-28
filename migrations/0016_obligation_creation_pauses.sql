-- Inclusive calendar dates, stored as UTC-midnight Unix seconds like obligations.
CREATE TABLE obligation_creation_pauses (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    start_date INTEGER NOT NULL,
    end_date INTEGER NOT NULL CHECK (end_date >= start_date),
    reason TEXT NOT NULL DEFAULT '',
    created_at INTEGER NOT NULL
);

CREATE INDEX idx_obligation_creation_pauses_dates
    ON obligation_creation_pauses (start_date, end_date);
