CREATE TABLE rma_items (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    rma_id BIGINT NOT NULL,
    product_id BIGINT NOT NULL,
    batch_number VARCHAR(60),
    serial_number VARCHAR(60),
    manufactured_at DATE,
    CONSTRAINT fk_rma_items_rma FOREIGN KEY (rma_id) REFERENCES rmas (id),
    CONSTRAINT fk_rma_items_product FOREIGN KEY (product_id) REFERENCES products (id)
);

CREATE INDEX idx_rma_items_rma_id ON rma_items (rma_id);
CREATE INDEX idx_rma_items_product_id ON rma_items (product_id);
CREATE INDEX idx_rma_items_batch_number ON rma_items (batch_number);
CREATE INDEX idx_rma_items_serial_number ON rma_items (serial_number);

INSERT INTO rma_items (rma_id, product_id, batch_number, serial_number, manufactured_at)
SELECT r.id, r.product_id, r.batch_number, r.serial_number, r.manufactured_at
FROM rmas r
WHERE NOT EXISTS (
    SELECT 1
    FROM rma_items item
    WHERE item.rma_id = r.id
);
