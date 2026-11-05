CREATE TABLE protocol_templates (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(120) NOT NULL,
    product_id BIGINT,
    category VARCHAR(80),
    active BOOLEAN NOT NULL,
    current_version INTEGER NOT NULL,
    created_at DATETIME(6) NOT NULL,
    updated_at DATETIME(6) NOT NULL,
    created_by VARCHAR(60),
    updated_by VARCHAR(60),
    CONSTRAINT fk_protocol_templates_product FOREIGN KEY (product_id) REFERENCES products (id),
    CONSTRAINT ck_protocol_templates_scope CHECK (product_id IS NOT NULL OR category IS NOT NULL)
);

CREATE INDEX idx_protocol_templates_product_id ON protocol_templates (product_id);

CREATE TABLE protocol_template_versions (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    template_id BIGINT NOT NULL,
    version_number INTEGER NOT NULL,
    blocked_statuses VARCHAR(255),
    created_by VARCHAR(120) NOT NULL,
    created_at DATETIME(6) NOT NULL,
    CONSTRAINT fk_protocol_template_versions_template FOREIGN KEY (template_id) REFERENCES protocol_templates (id),
    CONSTRAINT uk_protocol_template_versions_number UNIQUE (template_id, version_number)
);

CREATE TABLE protocol_template_items (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    version_id BIGINT NOT NULL,
    sort_order INTEGER NOT NULL,
    step_name VARCHAR(120) NOT NULL,
    title VARCHAR(200) NOT NULL,
    instructions VARCHAR(1000),
    item_type VARCHAR(20) NOT NULL,
    required BOOLEAN NOT NULL,
    unit VARCHAR(20),
    decimal_places INTEGER,
    min_value DECIMAL(19, 6),
    max_value DECIMAL(19, 6),
    expected_result VARCHAR(500),
    evidence_required BOOLEAN NOT NULL,
    CONSTRAINT fk_protocol_template_items_version FOREIGN KEY (version_id) REFERENCES protocol_template_versions (id),
    CONSTRAINT ck_protocol_template_items_type CHECK (item_type IN ('CHECK', 'MEASUREMENT', 'TEXT')),
    CONSTRAINT ck_protocol_template_items_places CHECK (decimal_places IS NULL OR (decimal_places >= 0 AND decimal_places <= 6))
);

CREATE INDEX idx_protocol_template_items_version_id ON protocol_template_items (version_id);

CREATE TABLE rma_protocol_executions (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    rma_id BIGINT NOT NULL,
    template_version_id BIGINT NOT NULL,
    template_name VARCHAR(120) NOT NULL,
    version_number INTEGER NOT NULL,
    status VARCHAR(20) NOT NULL,
    started_by VARCHAR(120) NOT NULL,
    started_at DATETIME(6) NOT NULL,
    completed_by VARCHAR(120),
    completed_at DATETIME(6),
    CONSTRAINT fk_rma_protocol_executions_rma FOREIGN KEY (rma_id) REFERENCES rmas (id),
    CONSTRAINT fk_rma_protocol_executions_version FOREIGN KEY (template_version_id) REFERENCES protocol_template_versions (id),
    CONSTRAINT ck_rma_protocol_executions_status CHECK (status IN ('IN_PROGRESS', 'COMPLETED', 'FAILED'))
);

CREATE INDEX idx_rma_protocol_executions_rma_id ON rma_protocol_executions (rma_id);

CREATE TABLE rma_protocol_item_results (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    execution_id BIGINT NOT NULL,
    template_item_id BIGINT NOT NULL,
    attempt INTEGER NOT NULL,
    outcome VARCHAR(20) NOT NULL,
    measured_value DECIMAL(19, 6),
    unit VARCHAR(20),
    text_value VARCHAR(1000),
    evidence VARCHAR(500),
    justification VARCHAR(500),
    executed_by VARCHAR(120) NOT NULL,
    started_at DATETIME(6) NOT NULL,
    completed_at DATETIME(6) NOT NULL,
    CONSTRAINT fk_rma_protocol_item_results_execution FOREIGN KEY (execution_id) REFERENCES rma_protocol_executions (id),
    CONSTRAINT fk_rma_protocol_item_results_item FOREIGN KEY (template_item_id) REFERENCES protocol_template_items (id),
    CONSTRAINT uk_rma_protocol_item_results_attempt UNIQUE (execution_id, template_item_id, attempt),
    CONSTRAINT ck_rma_protocol_item_results_outcome CHECK (outcome IN ('PASSED', 'FAILED', 'NOT_APPLICABLE'))
);

CREATE INDEX idx_rma_protocol_item_results_execution_id ON rma_protocol_item_results (execution_id);
