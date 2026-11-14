CREATE TABLE audit_events (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    occurred_at DATETIME(6) NOT NULL,
    actor_id BIGINT NULL,
    actor_username VARCHAR(60) NOT NULL,
    action VARCHAR(60) NOT NULL,
    entity_type VARCHAR(40) NOT NULL,
    entity_id BIGINT NULL,
    entity_label VARCHAR(120) NULL,
    summary VARCHAR(500) NOT NULL,
    ip VARCHAR(45) NULL
);
CREATE INDEX idx_audit_events_occurred_at ON audit_events (occurred_at);
CREATE INDEX idx_audit_events_entity ON audit_events (entity_type, entity_id);
CREATE INDEX idx_audit_events_actor ON audit_events (actor_username, occurred_at);
INSERT INTO access_profile_permissions (profile_id, permission)
SELECT id, 'auditoria.ver' FROM access_profiles WHERE legacy_code IN ('ADMIN');
