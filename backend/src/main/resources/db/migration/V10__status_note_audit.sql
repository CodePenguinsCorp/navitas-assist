ALTER TABLE rma_status_history ADD COLUMN note_edited_by VARCHAR(120) NULL;
ALTER TABLE rma_status_history ADD COLUMN note_edited_at TIMESTAMP(6) NULL;
