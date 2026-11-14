ALTER TABLE notifications ADD COLUMN read_batch_token VARCHAR(36);
ALTER TABLE notifications ADD COLUMN read_batch_expires_at TIMESTAMP WITH TIME ZONE;

-- Preserve the original priority for new RMA notifications. Existing messages remain unchanged.
ALTER TABLE notifications ADD COLUMN rma_priority VARCHAR(20);
