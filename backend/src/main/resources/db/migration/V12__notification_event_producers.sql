-- Remove tipos sem produtor antes de o Hibernate carregar os enums.
DELETE FROM notification_rule_recipient_profiles
    WHERE rule_id IN (SELECT id FROM notification_rules WHERE event_type IN ('WIP_LIMIT_EXCEEDED', 'INTERNAL_APPROVAL_REQUIRED', 'RECURRENCE_DETECTED'));
DELETE FROM notification_rules WHERE event_type IN ('WIP_LIMIT_EXCEEDED', 'INTERNAL_APPROVAL_REQUIRED', 'RECURRENCE_DETECTED');
DELETE FROM notification_mutes WHERE event_type IN ('WIP_LIMIT_EXCEEDED', 'INTERNAL_APPROVAL_REQUIRED', 'RECURRENCE_DETECTED');
DELETE FROM notifications WHERE event_type IN ('WIP_LIMIT_EXCEEDED', 'INTERNAL_APPROVAL_REQUIRED', 'RECURRENCE_DETECTED');
DELETE FROM notification_events WHERE event_type IN ('WIP_LIMIT_EXCEEDED', 'INTERNAL_APPROVAL_REQUIRED', 'RECURRENCE_DETECTED');

-- Ativa os produtores reais; e-mail depende de adesão explícita na aba Regras.
UPDATE notification_rules
    SET enabled = TRUE, app_enabled = TRUE, email_enabled = FALSE, severity = 'WARNING',
        notify_assignee = CASE WHEN event_type = 'PART_PENDING' THEN FALSE ELSE TRUE END,
        user_mutable = TRUE, updated_at = CURRENT_TIMESTAMP
    WHERE event_type IN ('RMA_BLOCKED', 'PART_PENDING', 'TEST_FAILED');

DELETE FROM notification_rule_recipient_profiles
    WHERE rule_id IN (SELECT id FROM notification_rules WHERE event_type IN ('RMA_BLOCKED', 'PART_PENDING', 'TEST_FAILED'));
INSERT INTO notification_rule_recipient_profiles (rule_id, profile_id)
    SELECT r.id, p.id FROM notification_rules r CROSS JOIN access_profiles p
    WHERE p.legacy_code = 'ADMIN' AND r.event_type IN ('RMA_BLOCKED', 'PART_PENDING', 'TEST_FAILED');
