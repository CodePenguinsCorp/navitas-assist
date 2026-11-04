CREATE TABLE storage_locations (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    code VARCHAR(40) NOT NULL,
    name VARCHAR(120) NOT NULL,
    type VARCHAR(20) NOT NULL,
    parent_id BIGINT,
    description VARCHAR(500),
    active BOOLEAN NOT NULL,
    created_at DATETIME(6) NOT NULL,
    updated_at DATETIME(6) NOT NULL,
    created_by VARCHAR(60),
    updated_by VARCHAR(60),
    CONSTRAINT uk_storage_locations_code UNIQUE (code),
    CONSTRAINT fk_storage_locations_parent FOREIGN KEY (parent_id) REFERENCES storage_locations (id),
    CONSTRAINT ck_storage_locations_type CHECK (type IN ('AREA', 'BENCH', 'SHELF', 'QUARANTINE', 'SHIPPING'))
);

CREATE INDEX idx_storage_locations_parent_id ON storage_locations (parent_id);

CREATE TABLE rma_custody_movements (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    rma_id BIGINT NOT NULL,
    movement_type VARCHAR(20) NOT NULL,
    from_location_id BIGINT,
    to_location_id BIGINT,
    custodian_id BIGINT,
    custodian_name VARCHAR(120),
    reason VARCHAR(255),
    performed_by VARCHAR(120) NOT NULL,
    performed_at DATETIME(6) NOT NULL,
    CONSTRAINT fk_rma_custody_movements_rma FOREIGN KEY (rma_id) REFERENCES rmas (id),
    CONSTRAINT fk_rma_custody_movements_from FOREIGN KEY (from_location_id) REFERENCES storage_locations (id),
    CONSTRAINT fk_rma_custody_movements_to FOREIGN KEY (to_location_id) REFERENCES storage_locations (id),
    CONSTRAINT ck_rma_custody_movements_type CHECK (movement_type IN ('ENTRY', 'TRANSFER', 'EXIT'))
);

CREATE INDEX idx_rma_custody_movements_rma_id ON rma_custody_movements (rma_id);
CREATE INDEX idx_rma_custody_movements_to_location_id ON rma_custody_movements (to_location_id);
CREATE INDEX idx_rma_custody_movements_from_location_id ON rma_custody_movements (from_location_id);
