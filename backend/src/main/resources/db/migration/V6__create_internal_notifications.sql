CREATE TABLE notification_rules (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    event_type VARCHAR(40) NOT NULL,
    enabled BOOLEAN NOT NULL,
    severity VARCHAR(20) NOT NULL,
    recipient_roles VARCHAR(120) NOT NULL,
    notify_assignee BOOLEAN NOT NULL,
    email_enabled BOOLEAN NOT NULL,
    user_mutable BOOLEAN NOT NULL,
    created_at DATETIME(6) NOT NULL,
    updated_at DATETIME(6) NOT NULL,
    created_by VARCHAR(60),
    updated_by VARCHAR(60),
    CONSTRAINT uk_notification_rules_event_type UNIQUE (event_type),
    CONSTRAINT ck_notification_rules_severity CHECK (severity IN ('INFO', 'WARNING', 'CRITICAL'))
);

CREATE TABLE notification_events (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    event_key VARCHAR(160) NOT NULL,
    event_type VARCHAR(40) NOT NULL,
    rma_id BIGINT,
    status VARCHAR(20) NOT NULL,
    recipient_count INTEGER NOT NULL,
    error_message VARCHAR(500),
    occurred_at DATETIME(6) NOT NULL,
    processed_at DATETIME(6),
    CONSTRAINT uk_notification_events_event_key UNIQUE (event_key),
    CONSTRAINT fk_notification_events_rma FOREIGN KEY (rma_id) REFERENCES rmas (id) ON DELETE CASCADE,
    CONSTRAINT ck_notification_events_status CHECK (status IN ('RECEIVED', 'PROCESSED', 'SKIPPED', 'FAILED'))
);

CREATE INDEX idx_notification_events_status ON notification_events (status);

CREATE TABLE notifications (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    event_id BIGINT NOT NULL,
    recipient_id BIGINT NOT NULL,
    rma_id BIGINT,
    event_type VARCHAR(40) NOT NULL,
    severity VARCHAR(20) NOT NULL,
    title VARCHAR(160) NOT NULL,
    message VARCHAR(500) NOT NULL,
    action_path VARCHAR(200),
    created_at DATETIME(6) NOT NULL,
    read_at DATETIME(6),
    snoozed_until DATETIME(6),
    email_status VARCHAR(20) NOT NULL,
    email_error VARCHAR(500),
    CONSTRAINT uk_notifications_event_recipient UNIQUE (event_id, recipient_id),
    CONSTRAINT fk_notifications_event FOREIGN KEY (event_id) REFERENCES notification_events (id) ON DELETE CASCADE,
    CONSTRAINT fk_notifications_recipient FOREIGN KEY (recipient_id) REFERENCES user_accounts (id) ON DELETE CASCADE,
    CONSTRAINT fk_notifications_rma FOREIGN KEY (rma_id) REFERENCES rmas (id) ON DELETE CASCADE,
    CONSTRAINT ck_notifications_severity CHECK (severity IN ('INFO', 'WARNING', 'CRITICAL')),
    CONSTRAINT ck_notifications_email_status CHECK (email_status IN ('NOT_REQUESTED', 'SENT', 'FAILED'))
);

CREATE INDEX idx_notifications_recipient_id ON notifications (recipient_id);
CREATE INDEX idx_notifications_rma_id ON notifications (rma_id);

CREATE TABLE notification_mutes (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    user_id BIGINT NOT NULL,
    event_type VARCHAR(40) NOT NULL,
    created_at DATETIME(6) NOT NULL,
    CONSTRAINT uk_notification_mutes_user_event UNIQUE (user_id, event_type),
    CONSTRAINT fk_notification_mutes_user FOREIGN KEY (user_id) REFERENCES user_accounts (id) ON DELETE CASCADE
);

INSERT INTO notification_rules (event_type, enabled, severity, recipient_roles, notify_assignee, email_enabled, user_mutable, created_at, updated_at, created_by, updated_by) VALUES
    ('RMA_CREATED', TRUE, 'INFO', 'ADMIN,SERVICE_DESK', FALSE, FALSE, TRUE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 'system', 'system'),
    ('RMA_ASSIGNED', TRUE, 'INFO', '', TRUE, FALSE, FALSE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 'system', 'system'),
    ('SLA_WARNING', TRUE, 'WARNING', 'ADMIN', TRUE, FALSE, TRUE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 'system', 'system'),
    ('SLA_OVERDUE', TRUE, 'CRITICAL', 'ADMIN,SERVICE_DESK', TRUE, FALSE, FALSE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 'system', 'system');
