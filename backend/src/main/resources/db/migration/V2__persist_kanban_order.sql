ALTER TABLE rmas ADD COLUMN board_position BIGINT NOT NULL DEFAULT 0;
UPDATE rmas SET board_position = id;
CREATE INDEX idx_rmas_board_order ON rmas (status, board_position, id);

CREATE TABLE rma_board_order_lock (id INTEGER PRIMARY KEY);
INSERT INTO rma_board_order_lock (id) VALUES (1);
