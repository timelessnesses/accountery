-- Stop in-flight writes from recreating data after instance destruction begins.
-- These guards also freeze new charges and student imports during the 90-day close.

CREATE TRIGGER instance_guard_retention_update BEFORE UPDATE ON app_settings
WHEN EXISTS (SELECT 1 FROM app_settings WHERE key = 'instance_status' AND value = 'closing')
AND ((OLD.key = 'instance_status' AND NEW.value NOT IN ('closing', 'destroying'))
    OR (OLD.key IN ('instance_closed_at', 'instance_delete_after') AND NEW.value != OLD.value))
BEGIN SELECT RAISE(ABORT, 'The instance retention schedule cannot be changed'); END;
CREATE TRIGGER instance_guard_users_insert BEFORE INSERT ON users
WHEN EXISTS (SELECT 1 FROM app_settings WHERE key = 'instance_status' AND value IN ('destroying', 'destroyed')) OR (NEW.anonymized_at IS NULL AND EXISTS (SELECT 1 FROM app_settings WHERE key = 'instance_status' AND value = 'closing'))
BEGIN SELECT RAISE(ABORT, 'This instance is closed for this operation'); END;

CREATE TRIGGER instance_guard_users_update BEFORE UPDATE ON users
WHEN EXISTS (SELECT 1 FROM app_settings WHERE key = 'instance_status' AND value IN ('destroying', 'destroyed'))
BEGIN SELECT RAISE(ABORT, 'This instance is closed for this operation'); END;

CREATE TRIGGER instance_guard_transactions_insert BEFORE INSERT ON transactions
WHEN EXISTS (SELECT 1 FROM app_settings WHERE key = 'instance_status' AND value IN ('destroying', 'destroyed'))
BEGIN SELECT RAISE(ABORT, 'This instance is closed for this operation'); END;

CREATE TRIGGER instance_guard_transactions_update BEFORE UPDATE ON transactions
WHEN EXISTS (SELECT 1 FROM app_settings WHERE key = 'instance_status' AND value IN ('destroying', 'destroyed'))
BEGIN SELECT RAISE(ABORT, 'This instance is closed for this operation'); END;

CREATE TRIGGER instance_guard_logs_insert BEFORE INSERT ON logs
WHEN EXISTS (SELECT 1 FROM app_settings WHERE key = 'instance_status' AND value IN ('destroying', 'destroyed'))
BEGIN SELECT RAISE(ABORT, 'This instance is closed for this operation'); END;

CREATE TRIGGER instance_guard_logs_update BEFORE UPDATE ON logs
WHEN EXISTS (SELECT 1 FROM app_settings WHERE key = 'instance_status' AND value IN ('destroying', 'destroyed'))
BEGIN SELECT RAISE(ABORT, 'This instance is closed for this operation'); END;

CREATE TRIGGER instance_guard_obligations_insert BEFORE INSERT ON obligations
WHEN EXISTS (SELECT 1 FROM app_settings WHERE key = 'instance_status' AND value IN ('destroying', 'destroyed')) OR EXISTS (SELECT 1 FROM app_settings WHERE key = 'instance_status' AND value = 'closing')
BEGIN SELECT RAISE(ABORT, 'This instance is closed for this operation'); END;

CREATE TRIGGER instance_guard_obligations_update BEFORE UPDATE ON obligations
WHEN EXISTS (SELECT 1 FROM app_settings WHERE key = 'instance_status' AND value IN ('destroying', 'destroyed')) OR EXISTS (SELECT 1 FROM app_settings WHERE key = 'instance_status' AND value = 'closing')
BEGIN SELECT RAISE(ABORT, 'This instance is closed for this operation'); END;

CREATE TRIGGER instance_guard_obligation_creation_pauses_insert BEFORE INSERT ON obligation_creation_pauses
WHEN EXISTS (SELECT 1 FROM app_settings WHERE key = 'instance_status' AND value IN ('destroying', 'destroyed'))
BEGIN SELECT RAISE(ABORT, 'This instance is closed for this operation'); END;

CREATE TRIGGER instance_guard_obligation_creation_pauses_update BEFORE UPDATE ON obligation_creation_pauses
WHEN EXISTS (SELECT 1 FROM app_settings WHERE key = 'instance_status' AND value IN ('destroying', 'destroyed'))
BEGIN SELECT RAISE(ABORT, 'This instance is closed for this operation'); END;

CREATE TRIGGER instance_guard_transfer_promptpay_insert BEFORE INSERT ON transfer_promptpay
WHEN EXISTS (SELECT 1 FROM app_settings WHERE key = 'instance_status' AND value IN ('destroying', 'destroyed'))
BEGIN SELECT RAISE(ABORT, 'This instance is closed for this operation'); END;

CREATE TRIGGER instance_guard_transfer_promptpay_update BEFORE UPDATE ON transfer_promptpay
WHEN EXISTS (SELECT 1 FROM app_settings WHERE key = 'instance_status' AND value IN ('destroying', 'destroyed'))
BEGIN SELECT RAISE(ABORT, 'This instance is closed for this operation'); END;

CREATE TRIGGER instance_guard_slipok_cache_insert BEFORE INSERT ON slipok_cache
WHEN EXISTS (SELECT 1 FROM app_settings WHERE key = 'instance_status' AND value IN ('destroying', 'destroyed'))
BEGIN SELECT RAISE(ABORT, 'This instance is closed for this operation'); END;

CREATE TRIGGER instance_guard_slipok_cache_update BEFORE UPDATE ON slipok_cache
WHEN EXISTS (SELECT 1 FROM app_settings WHERE key = 'instance_status' AND value IN ('destroying', 'destroyed'))
BEGIN SELECT RAISE(ABORT, 'This instance is closed for this operation'); END;

CREATE TRIGGER instance_guard_notifications_insert BEFORE INSERT ON notifications
WHEN EXISTS (SELECT 1 FROM app_settings WHERE key = 'instance_status' AND value IN ('destroying', 'destroyed'))
BEGIN SELECT RAISE(ABORT, 'This instance is closed for this operation'); END;

CREATE TRIGGER instance_guard_notifications_update BEFORE UPDATE ON notifications
WHEN EXISTS (SELECT 1 FROM app_settings WHERE key = 'instance_status' AND value IN ('destroying', 'destroyed'))
BEGIN SELECT RAISE(ABORT, 'This instance is closed for this operation'); END;

CREATE TRIGGER instance_guard_calendar_tokens_insert BEFORE INSERT ON calendar_tokens
WHEN EXISTS (SELECT 1 FROM app_settings WHERE key = 'instance_status' AND value IN ('destroying', 'destroyed'))
BEGIN SELECT RAISE(ABORT, 'This instance is closed for this operation'); END;

CREATE TRIGGER instance_guard_calendar_tokens_update BEFORE UPDATE ON calendar_tokens
WHEN EXISTS (SELECT 1 FROM app_settings WHERE key = 'instance_status' AND value IN ('destroying', 'destroyed'))
BEGIN SELECT RAISE(ABORT, 'This instance is closed for this operation'); END;

CREATE TRIGGER instance_guard_departed_account_blocks_insert BEFORE INSERT ON departed_account_blocks
WHEN EXISTS (SELECT 1 FROM app_settings WHERE key = 'instance_status' AND value IN ('destroying', 'destroyed'))
BEGIN SELECT RAISE(ABORT, 'This instance is closed for this operation'); END;

CREATE TRIGGER instance_guard_departed_account_blocks_update BEFORE UPDATE ON departed_account_blocks
WHEN EXISTS (SELECT 1 FROM app_settings WHERE key = 'instance_status' AND value IN ('destroying', 'destroyed'))
BEGIN SELECT RAISE(ABORT, 'This instance is closed for this operation'); END;

CREATE TRIGGER instance_guard_settings_insert BEFORE INSERT ON app_settings
WHEN EXISTS (SELECT 1 FROM app_settings WHERE key = 'instance_status' AND value IN ('destroying', 'destroyed'))
BEGIN SELECT RAISE(ABORT, 'This instance is closed'); END;

CREATE TRIGGER instance_guard_settings_update BEFORE UPDATE ON app_settings
WHEN EXISTS (SELECT 1 FROM app_settings WHERE key = 'instance_status' AND value IN ('destroying', 'destroyed'))
AND NOT (OLD.key = 'instance_status' AND NEW.key = 'instance_status' AND
    (NEW.value = OLD.value OR (OLD.value = 'destroying' AND NEW.value = 'destroyed')))
BEGIN SELECT RAISE(ABORT, 'This instance is closed'); END;

CREATE TRIGGER instance_guard_status_delete BEFORE DELETE ON app_settings
WHEN OLD.key = 'instance_status' AND OLD.value IN ('destroying', 'destroyed')
BEGIN SELECT RAISE(ABORT, 'This instance is closed'); END;
