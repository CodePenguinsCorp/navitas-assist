-- Ajuste manual por item; sem ajuste, preserva o cálculo automático.
ALTER TABLE rma_items ADD COLUMN warranty_override VARCHAR(30) NULL;
ALTER TABLE rma_items ADD COLUMN warranty_override_reason VARCHAR(255) NULL;
ALTER TABLE rma_items ADD COLUMN warranty_override_by VARCHAR(120) NULL;
ALTER TABLE rma_items ADD COLUMN warranty_override_at DATETIME(6) NULL;
ALTER TABLE rma_items ADD CONSTRAINT ck_rma_items_warranty_override
    CHECK (warranty_override IS NULL OR warranty_override IN ('IN_WARRANTY', 'OUT_OF_WARRANTY'));

CREATE TABLE rma_item_warranty_history (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    rma_item_id BIGINT NOT NULL,
    previous_override VARCHAR(30) NULL,
    new_override VARCHAR(30) NULL,
    reason VARCHAR(255) NULL,
    changed_by VARCHAR(120) NOT NULL,
    changed_at DATETIME(6) NOT NULL,
    CONSTRAINT fk_rma_item_warranty_history_item FOREIGN KEY (rma_item_id) REFERENCES rma_items (id),
    CONSTRAINT ck_rma_item_warranty_history_previous CHECK (previous_override IS NULL OR previous_override IN ('IN_WARRANTY', 'OUT_OF_WARRANTY')),
    CONSTRAINT ck_rma_item_warranty_history_new CHECK (new_override IS NULL OR new_override IN ('IN_WARRANTY', 'OUT_OF_WARRANTY'))
);

CREATE INDEX idx_rma_item_warranty_history_item ON rma_item_warranty_history (rma_item_id);
CREATE INDEX idx_rma_item_warranty_history_changed_at ON rma_item_warranty_history (changed_at);
