-- Geração do e-mail: cada reenvio manual de FAILED inicia uma nova chave de idempotência; as tentativas automáticas
-- da mesma geração mantêm a chave. Linhas existentes ficam na geração 0, cuja chave continua sendo o id.
ALTER TABLE notifications ADD COLUMN email_generation INT NOT NULL DEFAULT 0;
