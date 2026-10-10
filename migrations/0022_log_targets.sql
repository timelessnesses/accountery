-- Record stable references separately from human-readable audit messages.
ALTER TABLE logs ADD COLUMN targets TEXT NOT NULL DEFAULT '[]';
ALTER TABLE logs ADD COLUMN actor_type TEXT NOT NULL DEFAULT 'user';
