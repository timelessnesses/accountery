ALTER TABLE users ADD COLUMN anonymized_at INTEGER;

-- A keyed digest prevents re-import/sign-in without retaining the original email.
CREATE TABLE departed_account_blocks (
	email_hash TEXT PRIMARY KEY
);

INSERT INTO app_settings (key, value) VALUES ('instance_status', 'active');
