ALTER TABLE rma_external_components ADD COLUMN edited_by VARCHAR(120) NULL;
ALTER TABLE rma_external_components ADD COLUMN edited_at DATETIME(6) NULL;
ALTER TABLE rma_external_components ADD COLUMN voided_by VARCHAR(120) NULL;
ALTER TABLE rma_external_components ADD COLUMN voided_at DATETIME(6) NULL;
ALTER TABLE rma_external_components ADD COLUMN void_reason VARCHAR(1000) NULL;
ALTER TABLE rma_interventions ADD COLUMN edited_by VARCHAR(120) NULL;
ALTER TABLE rma_interventions ADD COLUMN edited_at DATETIME(6) NULL;
ALTER TABLE rma_interventions ADD COLUMN voided_by VARCHAR(120) NULL;
ALTER TABLE rma_interventions ADD COLUMN voided_at DATETIME(6) NULL;
ALTER TABLE rma_interventions ADD COLUMN void_reason VARCHAR(1000) NULL;

CREATE TABLE rma_repair_history (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    rma_id BIGINT NOT NULL,
    entity_type VARCHAR(30) NOT NULL,
    entity_id BIGINT NOT NULL,
    action VARCHAR(20) NOT NULL,
    changed_by VARCHAR(120) NOT NULL,
    changed_at DATETIME(6) NOT NULL,
    summary VARCHAR(1500) NOT NULL,
    CONSTRAINT fk_repair_history_rma FOREIGN KEY (rma_id) REFERENCES rmas(id)
);
CREATE INDEX idx_repair_history_rma ON rma_repair_history(rma_id, changed_at, id);

INSERT INTO rma_repair_history (rma_id, entity_type, entity_id, action, changed_by, changed_at, summary)
SELECT rma_id, 'EXTERNAL_COMPONENT', id, 'CREATE', applied_by, applied_at,
    LEFT(CONCAT('Componente fora do estoque: ', description, ' · ', quantity, ' ', unit, ' · ', replacement_reason, COALESCE(CONCAT(' · Lote: ', component_batch), '')), 1500)
FROM rma_external_components;
INSERT INTO rma_repair_history (rma_id, entity_type, entity_id, action, changed_by, changed_at, summary)
SELECT rma_id, 'INTERVENTION', id, 'CREATE', technician_name, created_at,
    LEFT(CONCAT('Intervenção registrada: ', description, ' · ', hours, ' h'), 1500)
FROM rma_interventions;
INSERT INTO rma_repair_history (rma_id, entity_type, entity_id, action, changed_by, changed_at, summary)
SELECT r.rma_id, 'STOCK_COMPONENT', r.id, 'APPLY', COALESCE(r.applied_by, r.updated_by, r.created_by, 'Registro anterior'), COALESCE(r.applied_at, r.updated_at),
    LEFT(CONCAT('Peça aplicada: ', p.code, ' · ', p.name, ' · ', r.quantity, ' ', p.unit, ' · ', COALESCE(r.replacement_reason, 'Motivo não registrado'), COALESCE(CONCAT(' · Lote: ', r.component_batch), '')), 1500)
FROM part_reservations r JOIN parts p ON p.id = r.part_id WHERE r.status = 'CONSUMED';
