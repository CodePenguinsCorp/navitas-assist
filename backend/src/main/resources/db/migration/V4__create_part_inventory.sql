CREATE TABLE parts (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    code VARCHAR(60) NOT NULL,
    name VARCHAR(120) NOT NULL,
    unit VARCHAR(20) NOT NULL,
    location VARCHAR(120),
    minimum_stock DECIMAL(12, 3) NOT NULL,
    unit_cost DECIMAL(12, 2) NOT NULL,
    on_hand_quantity DECIMAL(12, 3) NOT NULL,
    reserved_quantity DECIMAL(12, 3) NOT NULL,
    active BOOLEAN NOT NULL,
    created_at DATETIME(6) NOT NULL,
    updated_at DATETIME(6) NOT NULL,
    created_by VARCHAR(60),
    updated_by VARCHAR(60),
    CONSTRAINT uk_parts_code UNIQUE (code),
    CONSTRAINT ck_parts_minimum_stock CHECK (minimum_stock >= 0),
    CONSTRAINT ck_parts_unit_cost CHECK (unit_cost >= 0),
    CONSTRAINT ck_parts_reserved_quantity CHECK (reserved_quantity >= 0),
    CONSTRAINT ck_parts_available_quantity CHECK (on_hand_quantity >= reserved_quantity)
);

CREATE TABLE part_reservations (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    part_id BIGINT NOT NULL,
    rma_id BIGINT NOT NULL,
    quantity DECIMAL(12, 3) NOT NULL,
    status VARCHAR(20) NOT NULL,
    note VARCHAR(255),
    created_at DATETIME(6) NOT NULL,
    updated_at DATETIME(6) NOT NULL,
    created_by VARCHAR(60),
    updated_by VARCHAR(60),
    CONSTRAINT fk_part_reservations_part FOREIGN KEY (part_id) REFERENCES parts (id),
    CONSTRAINT fk_part_reservations_rma FOREIGN KEY (rma_id) REFERENCES rmas (id),
    CONSTRAINT ck_part_reservations_quantity CHECK (quantity > 0),
    CONSTRAINT ck_part_reservations_status CHECK (status IN ('PENDING', 'ACTIVE', 'CONSUMED', 'CANCELLED', 'REVERSED'))
);

CREATE INDEX idx_part_reservations_part_id ON part_reservations (part_id);
CREATE INDEX idx_part_reservations_rma_id ON part_reservations (rma_id);
CREATE INDEX idx_part_reservations_status ON part_reservations (status);

CREATE TABLE part_movements (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    part_id BIGINT NOT NULL,
    type VARCHAR(30) NOT NULL,
    quantity DECIMAL(12, 3) NOT NULL,
    on_hand_change DECIMAL(12, 3) NOT NULL,
    reserved_change DECIMAL(12, 3) NOT NULL,
    on_hand_after DECIMAL(12, 3) NOT NULL,
    reserved_after DECIMAL(12, 3) NOT NULL,
    unit_cost DECIMAL(12, 2) NOT NULL,
    total_cost DECIMAL(14, 2) NOT NULL,
    rma_id BIGINT,
    reservation_id BIGINT,
    reversed_movement_id BIGINT,
    reason VARCHAR(255),
    created_by VARCHAR(120) NOT NULL,
    created_at DATETIME(6) NOT NULL,
    CONSTRAINT uk_part_movements_reversed UNIQUE (reversed_movement_id),
    CONSTRAINT fk_part_movements_part FOREIGN KEY (part_id) REFERENCES parts (id),
    CONSTRAINT fk_part_movements_rma FOREIGN KEY (rma_id) REFERENCES rmas (id),
    CONSTRAINT fk_part_movements_reservation FOREIGN KEY (reservation_id) REFERENCES part_reservations (id),
    CONSTRAINT fk_part_movements_reversed FOREIGN KEY (reversed_movement_id) REFERENCES part_movements (id),
    CONSTRAINT ck_part_movements_quantity CHECK (quantity > 0),
    CONSTRAINT ck_part_movements_type CHECK (type IN ('ENTRY', 'EXIT', 'ADJUSTMENT', 'RESERVATION', 'RESERVATION_CANCEL', 'CONSUMPTION', 'REVERSAL'))
);

CREATE INDEX idx_part_movements_part_id ON part_movements (part_id);
CREATE INDEX idx_part_movements_rma_id ON part_movements (rma_id);
