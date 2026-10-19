CREATE TABLE clients (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    legal_name TEXT NOT NULL,
    trade_name VARCHAR(120),
    document_number VARCHAR(18),
    contact_name VARCHAR(120),
    email VARCHAR(120),
    phone VARCHAR(30),
    address VARCHAR(255),
    notes VARCHAR(1000),
    created_at DATETIME(6) NOT NULL,
    updated_at DATETIME(6) NOT NULL,
    created_by VARCHAR(60),
    updated_by VARCHAR(60)
);

CREATE TABLE products (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    sku VARCHAR(60) NOT NULL,
    name VARCHAR(120) NOT NULL,
    category VARCHAR(80),
    hardware_version VARCHAR(40),
    firmware_version VARCHAR(40),
    default_warranty_months INTEGER NOT NULL,
    technical_notes VARCHAR(1000),
    created_at DATETIME(6) NOT NULL,
    updated_at DATETIME(6) NOT NULL,
    created_by VARCHAR(60),
    updated_by VARCHAR(60),
    CONSTRAINT uk_products_sku UNIQUE (sku)
);

CREATE TABLE user_accounts (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    username VARCHAR(60) NOT NULL,
    full_name VARCHAR(120) NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    role VARCHAR(30) NOT NULL,
    active BOOLEAN NOT NULL,
    created_at DATETIME(6) NOT NULL,
    updated_at DATETIME(6) NOT NULL,
    created_by VARCHAR(60),
    updated_by VARCHAR(60),
    CONSTRAINT uk_user_accounts_username UNIQUE (username),
    CONSTRAINT ck_user_accounts_role CHECK (role IN ('ADMIN', 'TECHNICIAN', 'SERVICE_DESK', 'VIEWER'))
);

CREATE TABLE rmas (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    code VARCHAR(20) NOT NULL,
    client_id BIGINT NOT NULL,
    product_id BIGINT NOT NULL,
    batch_number VARCHAR(60),
    serial_number VARCHAR(60),
    manufactured_at DATE,
    purchase_date DATE,
    purchase_date_unknown BOOLEAN NOT NULL,
    entry_date DATE NOT NULL,
    invoice_number VARCHAR(80),
    invoice_file_name VARCHAR(180),
    received_by VARCHAR(120) NOT NULL,
    reported_failure VARCHAR(1000) NOT NULL,
    received_accessories VARCHAR(500),
    physical_condition VARCHAR(500),
    priority VARCHAR(20) NOT NULL,
    status VARCHAR(30) NOT NULL,
    repair_summary VARCHAR(600),
    replaced_parts_summary VARCHAR(600),
    test_summary VARCHAR(800),
    shipped_at DATE,
    carrier VARCHAR(120),
    tracking_code VARCHAR(120),
    created_at DATETIME(6) NOT NULL,
    updated_at DATETIME(6) NOT NULL,
    created_by VARCHAR(60),
    updated_by VARCHAR(60),
    CONSTRAINT uk_rmas_code UNIQUE (code),
    CONSTRAINT fk_rmas_client FOREIGN KEY (client_id) REFERENCES clients (id),
    CONSTRAINT fk_rmas_product FOREIGN KEY (product_id) REFERENCES products (id),
    CONSTRAINT ck_rmas_priority CHECK (priority IN ('LOW', 'MEDIUM', 'HIGH')),
    CONSTRAINT ck_rmas_status CHECK (status IN ('RECEIVED', 'TRIAGE', 'IN_DIAGNOSIS', 'WAITING_PART', 'IN_REPAIR', 'IN_TESTS', 'COMPLETED', 'RETURNED', 'IRREPARABLE'))
);

CREATE INDEX idx_rmas_client_id ON rmas (client_id);
CREATE INDEX idx_rmas_product_id ON rmas (product_id);

CREATE TABLE rma_items (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    rma_id BIGINT NOT NULL,
    product_id BIGINT NOT NULL,
    batch_number VARCHAR(60),
    serial_number VARCHAR(60),
    manufactured_at DATE,
    warranty_months INTEGER,
    CONSTRAINT fk_rma_items_rma FOREIGN KEY (rma_id) REFERENCES rmas (id),
    CONSTRAINT fk_rma_items_product FOREIGN KEY (product_id) REFERENCES products (id)
);

CREATE INDEX idx_rma_items_rma_id ON rma_items (rma_id);
CREATE INDEX idx_rma_items_product_id ON rma_items (product_id);
CREATE INDEX idx_rma_items_batch_number ON rma_items (batch_number);
CREATE INDEX idx_rma_items_serial_number ON rma_items (serial_number);

CREATE TABLE diagnoses (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    rma_id BIGINT NOT NULL,
    found_failure VARCHAR(2000) NOT NULL,
    failure_type VARCHAR(30),
    probable_cause VARCHAR(30),
    notes VARCHAR(2000),
    diagnosed_at DATE NOT NULL,
    technician_name VARCHAR(120) NOT NULL,
    created_at DATETIME(6) NOT NULL,
    updated_at DATETIME(6) NOT NULL,
    created_by VARCHAR(60),
    updated_by VARCHAR(60),
    CONSTRAINT uk_diagnoses_rma_id UNIQUE (rma_id),
    CONSTRAINT fk_diagnoses_rma FOREIGN KEY (rma_id) REFERENCES rmas (id),
    CONSTRAINT ck_diagnoses_failure_type CHECK (failure_type IS NULL OR failure_type IN ('POWER_SUPPLY', 'PWM', 'SENSOR', 'COMMUNICATION', 'DISPLAY', 'FIRMWARE', 'MECHANICAL', 'OTHER')),
    CONSTRAINT ck_diagnoses_probable_cause CHECK (probable_cause IS NULL OR probable_cause IN ('COMPONENT', 'SOLDER', 'HUMIDITY', 'OVERLOAD', 'ESD', 'INCORRECT_USAGE', 'OTHER'))
);

CREATE TABLE rma_status_history (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    rma_id BIGINT NOT NULL,
    status VARCHAR(30) NOT NULL,
    changed_by VARCHAR(120) NOT NULL,
    changed_at DATETIME(6) NOT NULL,
    note VARCHAR(255),
    CONSTRAINT fk_rma_status_history_rma FOREIGN KEY (rma_id) REFERENCES rmas (id),
    CONSTRAINT ck_rma_status_history_status CHECK (status IN ('RECEIVED', 'TRIAGE', 'IN_DIAGNOSIS', 'WAITING_PART', 'IN_REPAIR', 'IN_TESTS', 'COMPLETED', 'RETURNED', 'IRREPARABLE'))
);

CREATE INDEX idx_rma_status_history_rma_id ON rma_status_history (rma_id);
