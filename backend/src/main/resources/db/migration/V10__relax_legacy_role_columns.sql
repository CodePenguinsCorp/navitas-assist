-- Etapa 8A (fim do uso pelo código): user_accounts.role e notification_rules.recipient_roles viram colunas legadas,
-- nulas e sem CHECK. Elas só são apagadas numa V11 opcional, depois da conferência da implantação.

ALTER TABLE user_accounts DROP CONSTRAINT ck_user_accounts_role;

ALTER TABLE user_accounts MODIFY COLUMN role VARCHAR(30) NULL; -- PostgreSQL: ALTER TABLE user_accounts ALTER COLUMN role DROP NOT NULL

ALTER TABLE notification_rules MODIFY COLUMN recipient_roles VARCHAR(120) NULL; -- PostgreSQL: ALTER TABLE notification_rules ALTER COLUMN recipient_roles DROP NOT NULL
