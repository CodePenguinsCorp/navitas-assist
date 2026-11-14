CREATE INDEX idx_rmas_entry_date_id ON rmas (entry_date, id);
CREATE INDEX idx_rmas_status_entry_date ON rmas (status, entry_date);
CREATE INDEX idx_notifications_recipient_created ON notifications (recipient_id, created_at);
-- H2 associa a FK ao índice simples; recriar a FK permite usar o unique composto.
ALTER TABLE kanban_views DROP FOREIGN KEY fk_kanban_views_owner;
DROP INDEX idx_kanban_views_owner_id ON kanban_views;
ALTER TABLE kanban_views ADD CONSTRAINT fk_kanban_views_owner
    FOREIGN KEY (owner_id) REFERENCES user_accounts (id) ON DELETE CASCADE;
