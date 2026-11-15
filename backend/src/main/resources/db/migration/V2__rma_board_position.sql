ALTER TABLE rmas ADD COLUMN board_position BIGINT;
CREATE INDEX idx_rmas_status_board_position ON rmas (status, board_position);
