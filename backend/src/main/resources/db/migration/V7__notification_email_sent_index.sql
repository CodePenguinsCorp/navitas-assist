-- Teto de envios: o worker conta, a cada varredura, as entregas SENT do dia e do mês por email_sent_at.
CREATE INDEX idx_notifications_email_sent ON notifications (email_status, email_sent_at);
