CREATE TABLE rma_shipments (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    rma_id BIGINT NOT NULL,
    shipment_type VARCHAR(20) NOT NULL,
    status VARCHAR(30) NOT NULL,
    status_changed_at DATETIME(6),
    origin_name VARCHAR(120) NOT NULL,
    origin_address VARCHAR(500),
    destination_name VARCHAR(120) NOT NULL,
    destination_address VARCHAR(500),
    addresses_purged_at DATETIME(6),
    volumes INTEGER NOT NULL,
    carrier VARCHAR(120) NOT NULL,
    carrier_key VARCHAR(120) NOT NULL,
    service_name VARCHAR(120),
    tracking_code VARCHAR(120),
    label_reference VARCHAR(255),
    cost DECIMAL(12, 2),
    closed_at DATETIME(6),
    created_at DATETIME(6) NOT NULL,
    updated_at DATETIME(6) NOT NULL,
    created_by VARCHAR(60),
    updated_by VARCHAR(60),
    CONSTRAINT fk_rma_shipments_rma FOREIGN KEY (rma_id) REFERENCES rmas (id),
    CONSTRAINT uk_rma_shipments_carrier_tracking UNIQUE (carrier_key, tracking_code),
    CONSTRAINT ck_rma_shipments_type CHECK (shipment_type IN ('PICKUP', 'POSTING', 'TRANSFER', 'RETURN')),
    CONSTRAINT ck_rma_shipments_status CHECK (status IN ('CREATED', 'LABEL_ISSUED', 'IN_TRANSIT', 'DELIVERY_ATTEMPT', 'EXCEPTION', 'DELIVERED', 'CANCELLED')),
    CONSTRAINT ck_rma_shipments_volumes CHECK (volumes >= 1),
    CONSTRAINT ck_rma_shipments_cost CHECK (cost IS NULL OR cost >= 0)
);

CREATE INDEX idx_rma_shipments_rma_id ON rma_shipments (rma_id);
CREATE INDEX idx_rma_shipments_status ON rma_shipments (status);

CREATE TABLE rma_shipment_events (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    shipment_id BIGINT NOT NULL,
    source VARCHAR(20) NOT NULL,
    external_event_id VARCHAR(120),
    status VARCHAR(30) NOT NULL,
    description VARCHAR(500),
    proof_reference VARCHAR(255),
    justification VARCHAR(500),
    occurred_at DATETIME(6) NOT NULL,
    recorded_by VARCHAR(120) NOT NULL,
    recorded_at DATETIME(6) NOT NULL,
    CONSTRAINT fk_rma_shipment_events_shipment FOREIGN KEY (shipment_id) REFERENCES rma_shipments (id),
    CONSTRAINT uk_rma_shipment_events_external UNIQUE (shipment_id, external_event_id),
    CONSTRAINT ck_rma_shipment_events_source CHECK (source IN ('SYSTEM', 'INTEGRATION', 'MANUAL')),
    CONSTRAINT ck_rma_shipment_events_status CHECK (status IN ('CREATED', 'LABEL_ISSUED', 'IN_TRANSIT', 'DELIVERY_ATTEMPT', 'EXCEPTION', 'DELIVERED', 'CANCELLED'))
);

CREATE INDEX idx_rma_shipment_events_shipment_id ON rma_shipment_events (shipment_id);
