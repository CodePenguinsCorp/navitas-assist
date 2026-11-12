-- Etapa 8A (expand): perfis personalizados com permissões de um catálogo fixo.
-- As colunas user_accounts.role e notification_rules.recipient_roles continuam (legadas até a V10/V11).

CREATE TABLE access_profiles (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(60) NOT NULL,
    legacy_code VARCHAR(30),
    created_at DATETIME(6) NOT NULL,
    updated_at DATETIME(6) NOT NULL,
    created_by VARCHAR(60),
    updated_by VARCHAR(60),
    CONSTRAINT uk_access_profiles_name UNIQUE (name),
    CONSTRAINT uk_access_profiles_legacy_code UNIQUE (legacy_code)
);

CREATE TABLE access_profile_permissions (
    profile_id BIGINT NOT NULL,
    permission VARCHAR(60) NOT NULL,
    CONSTRAINT pk_access_profile_permissions PRIMARY KEY (profile_id, permission),
    CONSTRAINT fk_access_profile_permissions_profile FOREIGN KEY (profile_id) REFERENCES access_profiles (id) ON DELETE CASCADE
);

CREATE TABLE user_account_extra_permissions (
    user_id BIGINT NOT NULL,
    permission VARCHAR(60) NOT NULL,
    CONSTRAINT pk_user_account_extra_permissions PRIMARY KEY (user_id, permission),
    CONSTRAINT fk_user_extra_permissions_user FOREIGN KEY (user_id) REFERENCES user_accounts (id) ON DELETE CASCADE
);

INSERT INTO access_profiles (name, legacy_code, created_at, updated_at, created_by, updated_by) VALUES
    ('Administrador', 'ADMIN', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 'system', 'system'),
    ('Atendimento', 'SERVICE_DESK', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 'system', 'system'),
    ('Técnico', 'TECHNICIAN', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 'system', 'system'),
    ('Consulta', 'VIEWER', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 'system', 'system');

-- Permissões dos perfis migrados (spec §3): A = 19, S = 11, T = 11, V = 5.
INSERT INTO access_profile_permissions (profile_id, permission)
    SELECT id, 'rma.ver' FROM access_profiles WHERE legacy_code IN ('ADMIN', 'SERVICE_DESK', 'TECHNICIAN', 'VIEWER');
INSERT INTO access_profile_permissions (profile_id, permission)
    SELECT id, 'rma.abrir' FROM access_profiles WHERE legacy_code IN ('ADMIN', 'SERVICE_DESK');
INSERT INTO access_profile_permissions (profile_id, permission)
    SELECT id, 'rma.editar' FROM access_profiles WHERE legacy_code IN ('ADMIN', 'SERVICE_DESK');
INSERT INTO access_profile_permissions (profile_id, permission)
    SELECT id, 'rma.status' FROM access_profiles WHERE legacy_code IN ('ADMIN', 'SERVICE_DESK', 'TECHNICIAN');
INSERT INTO access_profile_permissions (profile_id, permission)
    SELECT id, 'rma.responsavel' FROM access_profiles WHERE legacy_code IN ('ADMIN', 'SERVICE_DESK');
INSERT INTO access_profile_permissions (profile_id, permission)
    SELECT id, 'rma.atribuivel' FROM access_profiles WHERE legacy_code IN ('TECHNICIAN');
INSERT INTO access_profile_permissions (profile_id, permission)
    SELECT id, 'rma.diagnosticar' FROM access_profiles WHERE legacy_code IN ('ADMIN', 'TECHNICIAN');
INSERT INTO access_profile_permissions (profile_id, permission)
    SELECT id, 'rma.impedimentos' FROM access_profiles WHERE legacy_code IN ('ADMIN', 'SERVICE_DESK', 'TECHNICIAN');
INSERT INTO access_profile_permissions (profile_id, permission)
    SELECT id, 'cadastros.ver' FROM access_profiles WHERE legacy_code IN ('ADMIN', 'SERVICE_DESK', 'TECHNICIAN', 'VIEWER');
INSERT INTO access_profile_permissions (profile_id, permission)
    SELECT id, 'cadastros.editar' FROM access_profiles WHERE legacy_code IN ('ADMIN', 'SERVICE_DESK');
INSERT INTO access_profile_permissions (profile_id, permission)
    SELECT id, 'pecas.ver' FROM access_profiles WHERE legacy_code IN ('ADMIN', 'SERVICE_DESK', 'TECHNICIAN', 'VIEWER');
INSERT INTO access_profile_permissions (profile_id, permission)
    SELECT id, 'pecas.movimentar' FROM access_profiles WHERE legacy_code IN ('ADMIN', 'SERVICE_DESK');
INSERT INTO access_profile_permissions (profile_id, permission)
    SELECT id, 'pecas.reservar' FROM access_profiles WHERE legacy_code IN ('ADMIN', 'TECHNICIAN');
INSERT INTO access_profile_permissions (profile_id, permission)
    SELECT id, 'protocolos.ver' FROM access_profiles WHERE legacy_code IN ('ADMIN', 'SERVICE_DESK', 'TECHNICIAN', 'VIEWER');
INSERT INTO access_profile_permissions (profile_id, permission)
    SELECT id, 'protocolos.executar' FROM access_profiles WHERE legacy_code IN ('ADMIN', 'TECHNICIAN');
INSERT INTO access_profile_permissions (profile_id, permission)
    SELECT id, 'protocolos.catalogo' FROM access_profiles WHERE legacy_code IN ('ADMIN');
INSERT INTO access_profile_permissions (profile_id, permission)
    SELECT id, 'relatorios.ver' FROM access_profiles WHERE legacy_code IN ('ADMIN', 'TECHNICIAN', 'VIEWER');
INSERT INTO access_profile_permissions (profile_id, permission)
    SELECT id, 'usuarios.gerir' FROM access_profiles WHERE legacy_code IN ('ADMIN');
INSERT INTO access_profile_permissions (profile_id, permission)
    SELECT id, 'perfis.gerir' FROM access_profiles WHERE legacy_code IN ('ADMIN');
INSERT INTO access_profile_permissions (profile_id, permission)
    SELECT id, 'notificacoes.regras' FROM access_profiles WHERE legacy_code IN ('ADMIN');

-- Vínculo do usuário ao perfil equivalente ao role atual.
ALTER TABLE user_accounts ADD COLUMN profile_id BIGINT;

UPDATE user_accounts SET profile_id = (SELECT p.id FROM access_profiles p WHERE p.legacy_code = user_accounts.role);

ALTER TABLE user_accounts MODIFY COLUMN profile_id BIGINT NOT NULL; -- PostgreSQL: ALTER COLUMN profile_id SET NOT NULL

CREATE INDEX idx_user_accounts_profile ON user_accounts (profile_id);

ALTER TABLE user_accounts ADD CONSTRAINT fk_user_accounts_profile FOREIGN KEY (profile_id) REFERENCES access_profiles (id);
