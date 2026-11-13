-- Data limite do atendimento e fim do SLA por etapa. SQL portável (MySQL 8 e PostgreSQL).

-- Data limite opcional do RMA (só data) e o histórico de cada alteração.
ALTER TABLE rmas ADD COLUMN due_date DATE NULL;

CREATE TABLE rma_due_date_history (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    rma_id BIGINT NOT NULL,
    previous_due_date DATE NULL,
    new_due_date DATE NULL,
    changed_by VARCHAR(120) NOT NULL,
    changed_at DATETIME(6) NOT NULL,
    CONSTRAINT fk_rma_due_date_history_rma FOREIGN KEY (rma_id) REFERENCES rmas (id)
);

CREATE INDEX idx_rma_due_date_history_rma_id ON rma_due_date_history (rma_id);

-- Filtro "Prazo" das visualizações salvas do Kanban (nulo = todos; CLOSED não é filtro).
ALTER TABLE kanban_views ADD COLUMN deadline_status VARCHAR(20) NULL;
ALTER TABLE kanban_views ADD CONSTRAINT ck_kanban_views_deadline
    CHECK (deadline_status IS NULL OR deadline_status IN ('OVERDUE', 'DUE_SOON', 'ON_TRACK', 'NO_DUE_DATE'));

-- Os alertas SLA_WARNING/SLA_OVERDUE deixam de existir (o tipo sai do código). Apaga as regras semeadas na V1
-- (destinatários saem junto), os silenciamentos e qualquer evento ou notificação desses tipos, para que nenhuma
-- linha guarde um tipo que o código já não conhece.
DELETE FROM notification_rule_recipient_profiles
    WHERE rule_id IN (SELECT id FROM notification_rules WHERE event_type IN ('SLA_WARNING', 'SLA_OVERDUE'));
DELETE FROM notification_rules WHERE event_type IN ('SLA_WARNING', 'SLA_OVERDUE');
DELETE FROM notification_mutes WHERE event_type IN ('SLA_WARNING', 'SLA_OVERDUE');
DELETE FROM notifications WHERE event_type IN ('SLA_WARNING', 'SLA_OVERDUE');
DELETE FROM notification_events WHERE event_type IN ('SLA_WARNING', 'SLA_OVERDUE');
