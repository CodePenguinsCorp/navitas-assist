-- Migração-base do Navitas Assist (MySQL 8 e H2 em modo MySQL nos testes).
--
-- As migrações foram zeradas em 13 nov 2026: não havia dados em produção, só dados de teste. Este arquivo
-- reproduz o schema final das antigas V1, V4, V6, V7, V8, V9 e V10, sem as colunas legadas dos roles fixos
-- (user_accounts.role e notification_rules.recipient_roles). Um banco criado pelas migrações antigas não é
-- compatível com esta baseline: apague o volume do MySQL e recrie o banco.
--
-- O PostgreSQL/Supabase terá baseline própria no projeto do ambiente de testes; este arquivo não é aplicado lá.
--
-- Convenções: todo índice e constraint tem nome explícito (uk_, fk_, ck_, idx_, pk_). Onde o MySQL criava um
-- índice implícito para a FK, o índice é criado aqui com o mesmo nome da FK, antes dela. Os seeds usam
-- INSERT ... SELECT por código legado (legacy_code), sem depender dos ids gerados.

-- Cadastros

CREATE TABLE clients (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    legal_name TEXT NOT NULL,
    trade_name VARCHAR(120),
    document_number VARCHAR(18),
    email VARCHAR(120),
    phone VARCHAR(30),
    address VARCHAR(255),
    notes VARCHAR(1000),
    created_at DATETIME(6) NOT NULL,
    updated_at DATETIME(6) NOT NULL,
    created_by VARCHAR(60),
    updated_by VARCHAR(60)
);

CREATE TABLE products (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    sku VARCHAR(60) NOT NULL,
    name VARCHAR(120) NOT NULL,
    category VARCHAR(80),
    hardware_version VARCHAR(40),
    firmware_version VARCHAR(40),
    default_warranty_months INTEGER NOT NULL,
    technical_notes VARCHAR(1000),
    created_at DATETIME(6) NOT NULL,
    updated_at DATETIME(6) NOT NULL,
    created_by VARCHAR(60),
    updated_by VARCHAR(60),
    CONSTRAINT uk_products_sku UNIQUE (sku)
);

-- Perfis de acesso e usuários

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

CREATE TABLE user_accounts (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    username VARCHAR(60) NOT NULL,
    full_name VARCHAR(120) NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    active BOOLEAN NOT NULL,
    created_at DATETIME(6) NOT NULL,
    updated_at DATETIME(6) NOT NULL,
    created_by VARCHAR(60),
    updated_by VARCHAR(60),
    profile_id BIGINT NOT NULL,
    CONSTRAINT uk_user_accounts_username UNIQUE (username),
    CONSTRAINT fk_user_accounts_profile FOREIGN KEY (profile_id) REFERENCES access_profiles (id)
);

CREATE INDEX idx_user_accounts_profile ON user_accounts (profile_id);

CREATE TABLE user_account_extra_permissions (
    user_id BIGINT NOT NULL,
    permission VARCHAR(60) NOT NULL,
    CONSTRAINT pk_user_account_extra_permissions PRIMARY KEY (user_id, permission),
    CONSTRAINT fk_user_extra_permissions_user FOREIGN KEY (user_id) REFERENCES user_accounts (id) ON DELETE CASCADE
);

CREATE TABLE kanban_views (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    owner_id BIGINT NOT NULL,
    name VARCHAR(80) NOT NULL,
    is_default BOOLEAN NOT NULL,
    search_query VARCHAR(200),
    priority VARCHAR(20),
    status VARCHAR(30),
    warranty_status VARCHAR(30),
    assignee_id BIGINT,
    unassigned_only BOOLEAN NOT NULL,
    entry_from DATE,
    entry_to DATE,
    updated_from DATE,
    updated_to DATE,
    blocked BOOLEAN,
    created_at DATETIME(6) NOT NULL,
    updated_at DATETIME(6) NOT NULL,
    created_by VARCHAR(60),
    updated_by VARCHAR(60),
    CONSTRAINT uk_kanban_views_owner_name UNIQUE (owner_id, name),
    CONSTRAINT fk_kanban_views_owner FOREIGN KEY (owner_id) REFERENCES user_accounts (id) ON DELETE CASCADE,
    CONSTRAINT ck_kanban_views_priority CHECK (priority IS NULL OR priority IN ('LOW', 'MEDIUM', 'HIGH')),
    CONSTRAINT ck_kanban_views_status CHECK (status IS NULL OR status IN ('RECEIVED', 'TRIAGE', 'IN_DIAGNOSIS', 'WAITING_PART', 'IN_REPAIR', 'IN_TESTS', 'COMPLETED', 'RETURNED', 'IRREPARABLE')),
    CONSTRAINT ck_kanban_views_warranty CHECK (warranty_status IS NULL OR warranty_status IN ('PENDING', 'IN_WARRANTY', 'OUT_OF_WARRANTY'))
);

CREATE INDEX idx_kanban_views_owner_id ON kanban_views (owner_id);

-- RMAs

CREATE TABLE rma_code_generation_lock (
    id BIGINT PRIMARY KEY,
    CONSTRAINT ck_rma_code_generation_lock_id CHECK (id = 1)
);

CREATE TABLE rmas (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    code VARCHAR(20) NOT NULL,
    client_id BIGINT NOT NULL,
    product_id BIGINT NOT NULL,
    batch_number VARCHAR(60),
    serial_number VARCHAR(60),
    manufactured_at DATE,
    purchase_date DATE,
    purchase_date_unknown BOOLEAN NOT NULL,
    entry_date DATE NOT NULL,
    invoice_number VARCHAR(80),
    received_by VARCHAR(120) NOT NULL,
    reported_failure VARCHAR(1000) NOT NULL,
    received_accessories VARCHAR(500),
    physical_condition VARCHAR(500),
    priority VARCHAR(20) NOT NULL,
    status VARCHAR(30) NOT NULL,
    assignee_id BIGINT,
    repair_summary VARCHAR(600),
    replaced_parts_summary VARCHAR(600),
    test_summary VARCHAR(800),
    shipped_at DATE,
    carrier VARCHAR(120),
    tracking_code VARCHAR(120),
    created_at DATETIME(6) NOT NULL,
    updated_at DATETIME(6) NOT NULL,
    created_by VARCHAR(60),
    updated_by VARCHAR(60),
    CONSTRAINT uk_rmas_code UNIQUE (code),
    CONSTRAINT fk_rmas_client FOREIGN KEY (client_id) REFERENCES clients (id),
    CONSTRAINT fk_rmas_product FOREIGN KEY (product_id) REFERENCES products (id),
    CONSTRAINT fk_rmas_assignee FOREIGN KEY (assignee_id) REFERENCES user_accounts (id),
    CONSTRAINT ck_rmas_priority CHECK (priority IN ('LOW', 'MEDIUM', 'HIGH')),
    CONSTRAINT ck_rmas_status CHECK (status IN ('RECEIVED', 'TRIAGE', 'IN_DIAGNOSIS', 'WAITING_PART', 'IN_REPAIR', 'IN_TESTS', 'COMPLETED', 'RETURNED', 'IRREPARABLE'))
);

CREATE INDEX idx_rmas_client_id ON rmas (client_id);
CREATE INDEX idx_rmas_product_id ON rmas (product_id);
CREATE INDEX idx_rmas_assignee_id ON rmas (assignee_id);

CREATE TABLE rma_items (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    rma_id BIGINT NOT NULL,
    product_id BIGINT NOT NULL,
    batch_number VARCHAR(60),
    serial_number VARCHAR(60),
    manufactured_at DATE,
    warranty_months INTEGER,
    CONSTRAINT fk_rma_items_rma FOREIGN KEY (rma_id) REFERENCES rmas (id),
    CONSTRAINT fk_rma_items_product FOREIGN KEY (product_id) REFERENCES products (id)
);

CREATE INDEX idx_rma_items_rma_id ON rma_items (rma_id);
CREATE INDEX idx_rma_items_product_id ON rma_items (product_id);
CREATE INDEX idx_rma_items_batch_number ON rma_items (batch_number);
CREATE INDEX idx_rma_items_serial_number ON rma_items (serial_number);

CREATE TABLE diagnoses (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    rma_id BIGINT NOT NULL,
    found_failure VARCHAR(2000) NOT NULL,
    failure_type VARCHAR(30),
    probable_cause VARCHAR(30),
    notes VARCHAR(2000),
    diagnosed_at DATE NOT NULL,
    technician_name VARCHAR(120) NOT NULL,
    created_at DATETIME(6) NOT NULL,
    updated_at DATETIME(6) NOT NULL,
    created_by VARCHAR(60),
    updated_by VARCHAR(60),
    CONSTRAINT uk_diagnoses_rma_id UNIQUE (rma_id),
    CONSTRAINT fk_diagnoses_rma FOREIGN KEY (rma_id) REFERENCES rmas (id),
    CONSTRAINT ck_diagnoses_failure_type CHECK (failure_type IS NULL OR failure_type IN ('POWER_SUPPLY', 'PWM', 'SENSOR', 'COMMUNICATION', 'DISPLAY', 'FIRMWARE', 'MECHANICAL', 'OTHER')),
    CONSTRAINT ck_diagnoses_probable_cause CHECK (probable_cause IS NULL OR probable_cause IN ('COMPONENT', 'SOLDER', 'HUMIDITY', 'OVERLOAD', 'ESD', 'INCORRECT_USAGE', 'OTHER'))
);

CREATE TABLE rma_status_history (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    rma_id BIGINT NOT NULL,
    status VARCHAR(30) NOT NULL,
    changed_by VARCHAR(120) NOT NULL,
    changed_at DATETIME(6) NOT NULL,
    note VARCHAR(255),
    CONSTRAINT fk_rma_status_history_rma FOREIGN KEY (rma_id) REFERENCES rmas (id),
    CONSTRAINT ck_rma_status_history_status CHECK (status IN ('RECEIVED', 'TRIAGE', 'IN_DIAGNOSIS', 'WAITING_PART', 'IN_REPAIR', 'IN_TESTS', 'COMPLETED', 'RETURNED', 'IRREPARABLE'))
);

CREATE INDEX idx_rma_status_history_rma_id ON rma_status_history (rma_id);

CREATE TABLE rma_assignment_history (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    rma_id BIGINT NOT NULL,
    previous_assignee_id BIGINT,
    previous_assignee_name VARCHAR(120),
    new_assignee_id BIGINT,
    new_assignee_name VARCHAR(120),
    changed_by VARCHAR(120) NOT NULL,
    changed_at DATETIME(6) NOT NULL,
    CONSTRAINT fk_rma_assignment_history_rma FOREIGN KEY (rma_id) REFERENCES rmas (id)
);

CREATE INDEX idx_rma_assignment_history_rma_id ON rma_assignment_history (rma_id);

CREATE TABLE rma_blocks (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    rma_id BIGINT NOT NULL,
    reason VARCHAR(1000) NOT NULL,
    category VARCHAR(80),
    blocked_by VARCHAR(120) NOT NULL,
    blocked_at DATETIME(6) NOT NULL,
    resolved_by VARCHAR(120),
    resolved_at DATETIME(6),
    resolution_note VARCHAR(1000),
    CONSTRAINT fk_rma_blocks_rma FOREIGN KEY (rma_id) REFERENCES rmas (id),
    CONSTRAINT ck_rma_blocks_resolution CHECK (
        (resolved_at IS NULL AND resolved_by IS NULL AND resolution_note IS NULL)
        OR (resolved_at IS NOT NULL AND resolved_by IS NOT NULL AND resolution_note IS NOT NULL AND resolved_at >= blocked_at)
    )
);

CREATE INDEX idx_rma_blocks_rma_id ON rma_blocks (rma_id);

-- Peças e estoque

CREATE TABLE parts (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    code VARCHAR(60) NOT NULL,
    name VARCHAR(120) NOT NULL,
    unit VARCHAR(20) NOT NULL,
    location VARCHAR(120),
    minimum_stock DECIMAL(12, 3) NOT NULL,
    unit_cost DECIMAL(12, 2) NOT NULL,
    on_hand_quantity DECIMAL(12, 3) NOT NULL,
    reserved_quantity DECIMAL(12, 3) NOT NULL,
    active BOOLEAN NOT NULL,
    created_at DATETIME(6) NOT NULL,
    updated_at DATETIME(6) NOT NULL,
    created_by VARCHAR(60),
    updated_by VARCHAR(60),
    CONSTRAINT uk_parts_code UNIQUE (code),
    CONSTRAINT ck_parts_minimum_stock CHECK (minimum_stock >= 0),
    CONSTRAINT ck_parts_unit_cost CHECK (unit_cost >= 0),
    CONSTRAINT ck_parts_reserved_quantity CHECK (reserved_quantity >= 0),
    CONSTRAINT ck_parts_available_quantity CHECK (on_hand_quantity >= reserved_quantity)
);

CREATE TABLE part_reservations (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    part_id BIGINT NOT NULL,
    rma_id BIGINT NOT NULL,
    quantity DECIMAL(12, 3) NOT NULL,
    status VARCHAR(20) NOT NULL,
    note VARCHAR(255),
    created_at DATETIME(6) NOT NULL,
    updated_at DATETIME(6) NOT NULL,
    created_by VARCHAR(60),
    updated_by VARCHAR(60),
    CONSTRAINT fk_part_reservations_part FOREIGN KEY (part_id) REFERENCES parts (id),
    CONSTRAINT fk_part_reservations_rma FOREIGN KEY (rma_id) REFERENCES rmas (id),
    CONSTRAINT ck_part_reservations_quantity CHECK (quantity > 0),
    CONSTRAINT ck_part_reservations_status CHECK (status IN ('PENDING', 'ACTIVE', 'CONSUMED', 'CANCELLED', 'REVERSED'))
);

CREATE INDEX idx_part_reservations_part_id ON part_reservations (part_id);
CREATE INDEX idx_part_reservations_rma_id ON part_reservations (rma_id);
CREATE INDEX idx_part_reservations_status ON part_reservations (status);

CREATE TABLE part_movements (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    part_id BIGINT NOT NULL,
    type VARCHAR(30) NOT NULL,
    quantity DECIMAL(12, 3) NOT NULL,
    on_hand_change DECIMAL(12, 3) NOT NULL,
    reserved_change DECIMAL(12, 3) NOT NULL,
    on_hand_after DECIMAL(12, 3) NOT NULL,
    reserved_after DECIMAL(12, 3) NOT NULL,
    unit_cost DECIMAL(12, 2) NOT NULL,
    total_cost DECIMAL(14, 2) NOT NULL,
    rma_id BIGINT,
    reservation_id BIGINT,
    reversed_movement_id BIGINT,
    reason VARCHAR(255),
    created_by VARCHAR(120) NOT NULL,
    created_at DATETIME(6) NOT NULL,
    CONSTRAINT uk_part_movements_reversed UNIQUE (reversed_movement_id),
    CONSTRAINT fk_part_movements_part FOREIGN KEY (part_id) REFERENCES parts (id),
    CONSTRAINT fk_part_movements_rma FOREIGN KEY (rma_id) REFERENCES rmas (id),
    CONSTRAINT fk_part_movements_reversed FOREIGN KEY (reversed_movement_id) REFERENCES part_movements (id),
    CONSTRAINT ck_part_movements_quantity CHECK (quantity > 0),
    CONSTRAINT ck_part_movements_type CHECK (type IN ('ENTRY', 'EXIT', 'ADJUSTMENT', 'RESERVATION', 'RESERVATION_CANCEL', 'CONSUMPTION', 'REVERSAL'))
);

CREATE INDEX fk_part_movements_reservation ON part_movements (reservation_id);
CREATE INDEX idx_part_movements_part_id ON part_movements (part_id);
CREATE INDEX idx_part_movements_rma_id ON part_movements (rma_id);

ALTER TABLE part_movements ADD CONSTRAINT fk_part_movements_reservation
    FOREIGN KEY (reservation_id) REFERENCES part_reservations (id);

-- Notificações internas

CREATE TABLE notification_rules (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    event_type VARCHAR(40) NOT NULL,
    enabled BOOLEAN NOT NULL,
    severity VARCHAR(20) NOT NULL,
    notify_assignee BOOLEAN NOT NULL,
    email_enabled BOOLEAN NOT NULL,
    user_mutable BOOLEAN NOT NULL,
    created_at DATETIME(6) NOT NULL,
    updated_at DATETIME(6) NOT NULL,
    created_by VARCHAR(60),
    updated_by VARCHAR(60),
    CONSTRAINT uk_notification_rules_event_type UNIQUE (event_type),
    CONSTRAINT ck_notification_rules_severity CHECK (severity IN ('INFO', 'WARNING', 'CRITICAL'))
);

CREATE TABLE notification_rule_recipient_profiles (
    rule_id BIGINT NOT NULL,
    profile_id BIGINT NOT NULL,
    CONSTRAINT pk_notification_rule_recipient_profiles PRIMARY KEY (rule_id, profile_id),
    CONSTRAINT fk_rule_recipient_profiles_rule FOREIGN KEY (rule_id) REFERENCES notification_rules (id) ON DELETE CASCADE,
    CONSTRAINT fk_rule_recipient_profiles_profile FOREIGN KEY (profile_id) REFERENCES access_profiles (id) ON DELETE CASCADE
);

CREATE INDEX idx_rule_recipient_profiles_profile ON notification_rule_recipient_profiles (profile_id);

CREATE TABLE notification_events (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    event_key VARCHAR(160) NOT NULL,
    event_type VARCHAR(40) NOT NULL,
    rma_id BIGINT,
    status VARCHAR(20) NOT NULL,
    recipient_count INTEGER NOT NULL,
    error_message VARCHAR(500),
    occurred_at DATETIME(6) NOT NULL,
    processed_at DATETIME(6),
    CONSTRAINT uk_notification_events_event_key UNIQUE (event_key),
    CONSTRAINT ck_notification_events_status CHECK (status IN ('RECEIVED', 'PROCESSED', 'SKIPPED', 'FAILED'))
);

CREATE INDEX fk_notification_events_rma ON notification_events (rma_id);
CREATE INDEX idx_notification_events_status ON notification_events (status);

ALTER TABLE notification_events ADD CONSTRAINT fk_notification_events_rma
    FOREIGN KEY (rma_id) REFERENCES rmas (id) ON DELETE CASCADE;

CREATE TABLE notifications (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    event_id BIGINT NOT NULL,
    recipient_id BIGINT NOT NULL,
    rma_id BIGINT,
    event_type VARCHAR(40) NOT NULL,
    severity VARCHAR(20) NOT NULL,
    title VARCHAR(160) NOT NULL,
    message VARCHAR(500) NOT NULL,
    action_path VARCHAR(200),
    created_at DATETIME(6) NOT NULL,
    read_at DATETIME(6),
    snoozed_until DATETIME(6),
    email_status VARCHAR(20) NOT NULL,
    email_error VARCHAR(500),
    CONSTRAINT uk_notifications_event_recipient UNIQUE (event_id, recipient_id),
    CONSTRAINT fk_notifications_event FOREIGN KEY (event_id) REFERENCES notification_events (id) ON DELETE CASCADE,
    CONSTRAINT fk_notifications_recipient FOREIGN KEY (recipient_id) REFERENCES user_accounts (id) ON DELETE CASCADE,
    CONSTRAINT fk_notifications_rma FOREIGN KEY (rma_id) REFERENCES rmas (id) ON DELETE CASCADE,
    CONSTRAINT ck_notifications_severity CHECK (severity IN ('INFO', 'WARNING', 'CRITICAL')),
    CONSTRAINT ck_notifications_email_status CHECK (email_status IN ('NOT_REQUESTED', 'SENT', 'FAILED'))
);

CREATE INDEX idx_notifications_recipient_id ON notifications (recipient_id);
CREATE INDEX idx_notifications_rma_id ON notifications (rma_id);

CREATE TABLE notification_mutes (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    user_id BIGINT NOT NULL,
    event_type VARCHAR(40) NOT NULL,
    created_at DATETIME(6) NOT NULL,
    CONSTRAINT uk_notification_mutes_user_event UNIQUE (user_id, event_type),
    CONSTRAINT fk_notification_mutes_user FOREIGN KEY (user_id) REFERENCES user_accounts (id) ON DELETE CASCADE
);

-- Protocolos técnicos

CREATE TABLE protocol_templates (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(120) NOT NULL,
    product_id BIGINT,
    category VARCHAR(80),
    active BOOLEAN NOT NULL,
    current_version INTEGER NOT NULL,
    created_at DATETIME(6) NOT NULL,
    updated_at DATETIME(6) NOT NULL,
    created_by VARCHAR(60),
    updated_by VARCHAR(60),
    CONSTRAINT fk_protocol_templates_product FOREIGN KEY (product_id) REFERENCES products (id),
    CONSTRAINT ck_protocol_templates_scope CHECK (product_id IS NOT NULL OR category IS NOT NULL)
);

CREATE INDEX idx_protocol_templates_product_id ON protocol_templates (product_id);

CREATE TABLE protocol_template_versions (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    template_id BIGINT NOT NULL,
    version_number INTEGER NOT NULL,
    blocked_statuses VARCHAR(255),
    created_by VARCHAR(120) NOT NULL,
    created_at DATETIME(6) NOT NULL,
    CONSTRAINT fk_protocol_template_versions_template FOREIGN KEY (template_id) REFERENCES protocol_templates (id),
    CONSTRAINT uk_protocol_template_versions_number UNIQUE (template_id, version_number)
);

CREATE TABLE protocol_template_items (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    version_id BIGINT NOT NULL,
    sort_order INTEGER NOT NULL,
    step_name VARCHAR(120) NOT NULL,
    title VARCHAR(200) NOT NULL,
    instructions VARCHAR(1000),
    item_type VARCHAR(20) NOT NULL,
    required BOOLEAN NOT NULL,
    unit VARCHAR(20),
    decimal_places INTEGER,
    min_value DECIMAL(19, 6),
    max_value DECIMAL(19, 6),
    expected_result VARCHAR(500),
    evidence_required BOOLEAN NOT NULL,
    CONSTRAINT fk_protocol_template_items_version FOREIGN KEY (version_id) REFERENCES protocol_template_versions (id),
    CONSTRAINT ck_protocol_template_items_type CHECK (item_type IN ('CHECK', 'MEASUREMENT', 'TEXT')),
    CONSTRAINT ck_protocol_template_items_places CHECK (decimal_places IS NULL OR (decimal_places >= 0 AND decimal_places <= 6))
);

CREATE INDEX idx_protocol_template_items_version_id ON protocol_template_items (version_id);

CREATE TABLE rma_protocol_executions (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    rma_id BIGINT NOT NULL,
    template_version_id BIGINT NOT NULL,
    template_name VARCHAR(120) NOT NULL,
    version_number INTEGER NOT NULL,
    status VARCHAR(20) NOT NULL,
    started_by VARCHAR(120) NOT NULL,
    started_at DATETIME(6) NOT NULL,
    completed_by VARCHAR(120),
    completed_at DATETIME(6),
    CONSTRAINT fk_rma_protocol_executions_rma FOREIGN KEY (rma_id) REFERENCES rmas (id),
    CONSTRAINT ck_rma_protocol_executions_status CHECK (status IN ('IN_PROGRESS', 'COMPLETED', 'FAILED'))
);

CREATE INDEX fk_rma_protocol_executions_version ON rma_protocol_executions (template_version_id);
CREATE INDEX idx_rma_protocol_executions_rma_id ON rma_protocol_executions (rma_id);

ALTER TABLE rma_protocol_executions ADD CONSTRAINT fk_rma_protocol_executions_version
    FOREIGN KEY (template_version_id) REFERENCES protocol_template_versions (id);

CREATE TABLE rma_protocol_item_results (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    execution_id BIGINT NOT NULL,
    template_item_id BIGINT NOT NULL,
    attempt INTEGER NOT NULL,
    outcome VARCHAR(20) NOT NULL,
    measured_value DECIMAL(19, 6),
    unit VARCHAR(20),
    text_value VARCHAR(1000),
    evidence VARCHAR(500),
    justification VARCHAR(500),
    executed_by VARCHAR(120) NOT NULL,
    started_at DATETIME(6) NOT NULL,
    completed_at DATETIME(6) NOT NULL,
    CONSTRAINT fk_rma_protocol_item_results_execution FOREIGN KEY (execution_id) REFERENCES rma_protocol_executions (id),
    CONSTRAINT uk_rma_protocol_item_results_attempt UNIQUE (execution_id, template_item_id, attempt),
    CONSTRAINT ck_rma_protocol_item_results_outcome CHECK (outcome IN ('PASSED', 'FAILED', 'NOT_APPLICABLE'))
);

CREATE INDEX fk_rma_protocol_item_results_item ON rma_protocol_item_results (template_item_id);
CREATE INDEX idx_rma_protocol_item_results_execution_id ON rma_protocol_item_results (execution_id);

ALTER TABLE rma_protocol_item_results ADD CONSTRAINT fk_rma_protocol_item_results_item
    FOREIGN KEY (template_item_id) REFERENCES protocol_template_items (id);

-- Seeds

INSERT INTO rma_code_generation_lock (id) VALUES (1);

INSERT INTO access_profiles (name, legacy_code, created_at, updated_at, created_by, updated_by) VALUES
    ('Administrador', 'ADMIN', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 'system', 'system'),
    ('Atendimento', 'SERVICE_DESK', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 'system', 'system'),
    ('Técnico', 'TECHNICIAN', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 'system', 'system'),
    ('Consulta', 'VIEWER', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 'system', 'system');

-- Permissões dos perfis prontos (spec §3): A = 19, S = 11, T = 11, V = 5. Um INSERT por permissão, no formato
-- lido pelo teste do frontend (core/permissions.spec.ts).
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

INSERT INTO notification_rules (event_type, enabled, severity, notify_assignee, email_enabled, user_mutable, created_at, updated_at, created_by, updated_by) VALUES
    ('RMA_CREATED', TRUE, 'INFO', FALSE, FALSE, TRUE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 'system', 'system'),
    ('RMA_ASSIGNED', TRUE, 'INFO', TRUE, FALSE, FALSE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 'system', 'system'),
    ('SLA_WARNING', TRUE, 'WARNING', TRUE, FALSE, TRUE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 'system', 'system'),
    ('SLA_OVERDUE', TRUE, 'CRITICAL', TRUE, FALSE, FALSE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 'system', 'system');

-- Destinatários das regras: RMA_CREATED e SLA_OVERDUE para Administrador e Atendimento, SLA_WARNING só para
-- Administrador; RMA_ASSIGNED avisa apenas o responsável (notify_assignee).
INSERT INTO notification_rule_recipient_profiles (rule_id, profile_id)
    SELECT r.id, p.id FROM notification_rules r CROSS JOIN access_profiles p
    WHERE p.legacy_code = 'ADMIN' AND r.event_type IN ('RMA_CREATED', 'SLA_WARNING', 'SLA_OVERDUE');
INSERT INTO notification_rule_recipient_profiles (rule_id, profile_id)
    SELECT r.id, p.id FROM notification_rules r CROSS JOIN access_profiles p
    WHERE p.legacy_code = 'SERVICE_DESK' AND r.event_type IN ('RMA_CREATED', 'SLA_OVERDUE');
