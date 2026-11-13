-- Legado permanece vis?vel e nunca entra na fila retroativamente.
ALTER TABLE user_accounts ADD COLUMN email VARCHAR(254) /*!80000 CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_as_ci */;
ALTER TABLE user_accounts ADD COLUMN email_normalized VARCHAR(254) /*!80000 CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_as_ci */ GENERATED ALWAYS AS (LOWER(email));
CREATE UNIQUE INDEX uk_user_accounts_email ON user_accounts (email_normalized);
ALTER TABLE notification_rules ADD COLUMN app_enabled BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE notifications ADD COLUMN app_visible BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE notifications ADD COLUMN email_attempts INT NOT NULL DEFAULT 0;
ALTER TABLE notifications ADD COLUMN email_next_attempt_at DATETIME(6);
ALTER TABLE notifications ADD COLUMN email_sent_at DATETIME(6);
ALTER TABLE notifications ADD COLUMN email_provider VARCHAR(20);
ALTER TABLE notifications DROP CONSTRAINT ck_notifications_email_status;
ALTER TABLE notifications ADD CONSTRAINT ck_notifications_email_status CHECK (email_status IN ('NOT_REQUESTED', 'PENDING', 'SENT', 'FAILED'));
CREATE INDEX idx_notifications_email_due ON notifications (email_status, email_next_attempt_at);

-- Tipos reservados sem produtor, apenas se ausentes.
INSERT INTO notification_rules (event_type, enabled, app_enabled, severity, notify_assignee, email_enabled, user_mutable, created_at, updated_at) SELECT 'RMA_BLOCKED', FALSE, FALSE, 'WARNING', FALSE, FALSE, TRUE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP WHERE NOT EXISTS (SELECT 1 FROM notification_rules WHERE event_type = 'RMA_BLOCKED');
INSERT INTO notification_rules (event_type, enabled, app_enabled, severity, notify_assignee, email_enabled, user_mutable, created_at, updated_at) SELECT 'WIP_LIMIT_EXCEEDED', FALSE, FALSE, 'WARNING', FALSE, FALSE, TRUE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP WHERE NOT EXISTS (SELECT 1 FROM notification_rules WHERE event_type = 'WIP_LIMIT_EXCEEDED');
INSERT INTO notification_rules (event_type, enabled, app_enabled, severity, notify_assignee, email_enabled, user_mutable, created_at, updated_at) SELECT 'PART_PENDING', FALSE, FALSE, 'WARNING', FALSE, FALSE, TRUE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP WHERE NOT EXISTS (SELECT 1 FROM notification_rules WHERE event_type = 'PART_PENDING');
INSERT INTO notification_rules (event_type, enabled, app_enabled, severity, notify_assignee, email_enabled, user_mutable, created_at, updated_at) SELECT 'INTERNAL_APPROVAL_REQUIRED', FALSE, FALSE, 'WARNING', FALSE, FALSE, TRUE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP WHERE NOT EXISTS (SELECT 1 FROM notification_rules WHERE event_type = 'INTERNAL_APPROVAL_REQUIRED');
INSERT INTO notification_rules (event_type, enabled, app_enabled, severity, notify_assignee, email_enabled, user_mutable, created_at, updated_at) SELECT 'TEST_FAILED', FALSE, FALSE, 'WARNING', FALSE, FALSE, TRUE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP WHERE NOT EXISTS (SELECT 1 FROM notification_rules WHERE event_type = 'TEST_FAILED');
INSERT INTO notification_rules (event_type, enabled, app_enabled, severity, notify_assignee, email_enabled, user_mutable, created_at, updated_at) SELECT 'RECURRENCE_DETECTED', FALSE, FALSE, 'WARNING', FALSE, FALSE, TRUE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP WHERE NOT EXISTS (SELECT 1 FROM notification_rules WHERE event_type = 'RECURRENCE_DETECTED');
