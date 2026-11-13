-- Fim do SLA por etapa: os alertas SLA_WARNING/SLA_OVERDUE deixam de existir (o tipo sai do código).
-- Apaga as regras semeadas na V1 (destinatários saem junto), os silenciamentos e qualquer evento ou
-- notificação desses tipos, para que nenhuma linha guarde um tipo que o código já não conhece.

DELETE FROM notification_rule_recipient_profiles
    WHERE rule_id IN (SELECT id FROM notification_rules WHERE event_type IN ('SLA_WARNING', 'SLA_OVERDUE'));
DELETE FROM notification_rules WHERE event_type IN ('SLA_WARNING', 'SLA_OVERDUE');
DELETE FROM notification_mutes WHERE event_type IN ('SLA_WARNING', 'SLA_OVERDUE');
DELETE FROM notifications WHERE event_type IN ('SLA_WARNING', 'SLA_OVERDUE');
DELETE FROM notification_events WHERE event_type IN ('SLA_WARNING', 'SLA_OVERDUE');
