CREATE TABLE app_settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
);

-- Public financial summaries remain unavailable until an administrator enables them.
INSERT INTO app_settings (key, value) VALUES ('public_obligations_enabled', '0');
