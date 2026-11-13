ALTER TABLE part_reservations ADD COLUMN replacement_reason VARCHAR(1000);
ALTER TABLE part_reservations ADD COLUMN component_batch VARCHAR(120);
ALTER TABLE part_reservations ADD COLUMN applied_at DATETIME(6);
ALTER TABLE part_reservations ADD COLUMN applied_by VARCHAR(120);

CREATE TABLE rma_external_components (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    rma_id BIGINT NOT NULL,
    code VARCHAR(60),
    description VARCHAR(120) NOT NULL,
    quantity DECIMAL(12,3) NOT NULL,
    unit VARCHAR(20) NOT NULL DEFAULT 'un',
    component_batch VARCHAR(120),
    replacement_reason VARCHAR(1000) NOT NULL,
    applied_at DATETIME(6) NOT NULL,
    applied_by VARCHAR(120) NOT NULL,
    created_at DATETIME(6) NOT NULL,
    updated_at DATETIME(6) NOT NULL,
    created_by VARCHAR(60),
    updated_by VARCHAR(60),
    CONSTRAINT fk_external_components_rma FOREIGN KEY (rma_id) REFERENCES rmas(id),
    CONSTRAINT ck_external_components_quantity CHECK (quantity > 0)
);
CREATE INDEX idx_external_components_rma ON rma_external_components(rma_id);

CREATE TABLE rma_interventions (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    rma_id BIGINT NOT NULL,
    type VARCHAR(30) NOT NULL,
    description VARCHAR(1000) NOT NULL,
    performed_on DATE NOT NULL,
    hours DECIMAL(9,3) NOT NULL,
    technician_name VARCHAR(120) NOT NULL,
    created_at DATETIME(6) NOT NULL,
    updated_at DATETIME(6) NOT NULL,
    created_by VARCHAR(60),
    updated_by VARCHAR(60),
    CONSTRAINT fk_interventions_rma FOREIGN KEY (rma_id) REFERENCES rmas(id),
    CONSTRAINT ck_interventions_hours CHECK (hours > 0),
    CONSTRAINT ck_interventions_type CHECK (type IN ('RESOLDERING', 'CLEANING', 'REPROGRAMMING', 'FIRMWARE_UPDATE', 'HARNESS_REPLACEMENT', 'OTHER'))
);
CREATE INDEX idx_interventions_rma ON rma_interventions(rma_id);
