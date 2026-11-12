-- Etapa 8A (expand): destinatários das regras de notificação passam a ser perfis.
-- A coluna notification_rules.recipient_roles continua (legada até a V10/V11).

CREATE TABLE notification_rule_recipient_profiles (
    rule_id BIGINT NOT NULL,
    profile_id BIGINT NOT NULL,
    CONSTRAINT pk_notification_rule_recipient_profiles PRIMARY KEY (rule_id, profile_id)
);

CREATE INDEX idx_rule_recipient_profiles_profile ON notification_rule_recipient_profiles (profile_id);

ALTER TABLE notification_rule_recipient_profiles ADD CONSTRAINT fk_rule_recipient_profiles_rule
    FOREIGN KEY (rule_id) REFERENCES notification_rules (id) ON DELETE CASCADE;

ALTER TABLE notification_rule_recipient_profiles ADD CONSTRAINT fk_rule_recipient_profiles_profile
    FOREIGN KEY (profile_id) REFERENCES access_profiles (id) ON DELETE CASCADE;

-- Um INSERT por role, com literal fixo: montar o padrão a partir da coluna faria do "_" um curinga.
INSERT INTO notification_rule_recipient_profiles (rule_id, profile_id)
    SELECT r.id, p.id FROM notification_rules r CROSS JOIN access_profiles p
    WHERE p.legacy_code = 'ADMIN' AND CONCAT(',', REPLACE(r.recipient_roles, ' ', ''), ',') LIKE '%,ADMIN,%';
INSERT INTO notification_rule_recipient_profiles (rule_id, profile_id)
    SELECT r.id, p.id FROM notification_rules r CROSS JOIN access_profiles p
    WHERE p.legacy_code = 'SERVICE_DESK' AND CONCAT(',', REPLACE(r.recipient_roles, ' ', ''), ',') LIKE '%,SERVICE_DESK,%';
INSERT INTO notification_rule_recipient_profiles (rule_id, profile_id)
    SELECT r.id, p.id FROM notification_rules r CROSS JOIN access_profiles p
    WHERE p.legacy_code = 'TECHNICIAN' AND CONCAT(',', REPLACE(r.recipient_roles, ' ', ''), ',') LIKE '%,TECHNICIAN,%';
INSERT INTO notification_rule_recipient_profiles (rule_id, profile_id)
    SELECT r.id, p.id FROM notification_rules r CROSS JOIN access_profiles p
    WHERE p.legacy_code = 'VIEWER' AND CONCAT(',', REPLACE(r.recipient_roles, ' ', ''), ',') LIKE '%,VIEWER,%';
