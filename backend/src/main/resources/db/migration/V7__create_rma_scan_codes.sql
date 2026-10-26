CREATE TABLE rma_scan_codes (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    rma_id BIGINT NOT NULL,
    token VARCHAR(40) NOT NULL,
    barcode_token VARCHAR(24) NOT NULL,
    active BOOLEAN NOT NULL,
    created_at DATETIME(6) NOT NULL,
    created_by VARCHAR(120) NOT NULL,
    revoked_at DATETIME(6),
    revoked_by VARCHAR(120),
    CONSTRAINT uk_rma_scan_codes_token UNIQUE (token),
    CONSTRAINT uk_rma_scan_codes_barcode_token UNIQUE (barcode_token),
    CONSTRAINT fk_rma_scan_codes_rma FOREIGN KEY (rma_id) REFERENCES rmas (id) ON DELETE CASCADE
);

CREATE INDEX idx_rma_scan_codes_rma_id ON rma_scan_codes (rma_id);

CREATE TABLE rma_scan_actions (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    scan_code_id BIGINT NOT NULL,
    rma_id BIGINT NOT NULL,
    action VARCHAR(30) NOT NULL,
    source VARCHAR(20) NOT NULL,
    from_status VARCHAR(30),
    to_status VARCHAR(30),
    note VARCHAR(255),
    performed_by VARCHAR(120) NOT NULL,
    performed_at DATETIME(6) NOT NULL,
    CONSTRAINT fk_rma_scan_actions_code FOREIGN KEY (scan_code_id) REFERENCES rma_scan_codes (id) ON DELETE CASCADE,
    CONSTRAINT fk_rma_scan_actions_rma FOREIGN KEY (rma_id) REFERENCES rmas (id) ON DELETE CASCADE,
    CONSTRAINT ck_rma_scan_actions_action CHECK (action IN ('STATUS_CHANGE')),
    CONSTRAINT ck_rma_scan_actions_source CHECK (source IN ('CAMERA', 'SCANNER', 'MANUAL'))
);

CREATE INDEX idx_rma_scan_actions_rma_id ON rma_scan_actions (rma_id);
