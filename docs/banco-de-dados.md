# Banco de dados

MySQL 8, com schema gerido pelo Flyway (`backend/src/main/resources/db/migration`). O Hibernate só valida o resultado (`ddl-auto=validate`; o profile `local` usa `update`, mas o Flyway continua rodando antes). Os testes usam H2 em modo MySQL, aplicando as mesmas migrações.

## Migrações

| Versão | Arquivo | O que faz |
| --- | --- | --- |
| V1 | `V1__baseline.sql` | Baseline única: todas as tabelas, índices e constraints e os seeds (linha de bloqueio da numeração dos RMAs, 4 perfis prontos com permissões, regras de notificação com destinatários por perfil). |
| V2 | `V2__rma_due_date_and_remove_stage_sla.sql` | Data limite (`rmas.due_date`, `rma_due_date_history`, `kanban_views.deadline_status`) e remoção dos alertas `SLA_WARNING`/`SLA_OVERDUE` (regras, silenciamentos, eventos e notificações desses tipos). |
| V3 | `V3__rma_item_warranty_override.sql` | Ajuste manual de garantia por item e tabela de auditoria `rma_item_warranty_history`. |
| V4 | `V4__notification_email_delivery.sql` | E-mail opcional e único do usuário; canal App/E-mail por regra; colunas e índice da fila de e-mail; regras dos tipos reservados. |
| V5 | `V5__rma_repair.sql` | Motivo, lote e aplicação nas reservas consumidas; `rma_external_components` e `rma_interventions`. |
| V6 | `V6__notification_email_generation.sql` | `email_generation`: chave de idempotência por reenvio manual. |
| V7 | `V7__notification_email_sent_index.sql` | Índice usado pela contagem dos tetos diário e mensal. |
| V8 | `V8__rma_item_position.sql` | `item_position`: ordem dos itens (o primeiro é o principal). |
| V9 | `V9__catalog_import_permission.sql` | Concede `cadastros.importar` ao Administrador. |
| V10 | `V10__status_note_audit.sql` | Auditoria da edição de observação do histórico de status (`note_edited_by`, `note_edited_at`). |
| V11 | `V11__repair_history_and_void.sql` | Auditoria de edição e anulação lógica de componentes externos e intervenções; `rma_repair_history`, com inclusão dos registros anteriores. |
| V12 | `V12__notification_event_producers.sql` | Ativa impedimentos, reservas pendentes e testes reprovados (e-mail desligado); remove regras, destinatários, silenciamentos, eventos e notificações dos tipos sem produtor. |
| V13 | `V13__audit_events.sql` | Trilha imutável `audit_events` com instante DATETIME(6) em UTC; índices por instante, registro e ator/instante; concede `auditoria.ver` somente ao Administrador. |

Tabelas principais: `audit_events`, `clients`, `products`, `rmas`, `rma_items`, `diagnoses`, `rma_status_history`, `rma_assignment_history`, `rma_repair_history`, `rma_blocks`, `parts`, `part_reservations`, `part_movements`, `access_profiles`, `access_profile_permissions`, `user_accounts`, `user_account_extra_permissions`, `kanban_views`, `notification_*`, `notifications`, `protocol_*` e `rma_protocol_*`.

## Política da baseline única

As migrações foram zeradas em 13 de novembro de 2026, porque não havia dados em produção (só dados de teste): as antigas V1 a V10 deram lugar à `V1__baseline.sql`. As colunas legadas `user_accounts.role` e `notification_rules.recipient_roles` deixaram de existir. Depois da baseline, as migrações são **sempre novas e aditivas** (V2 em diante); nunca edite uma migração já aplicada. O Flyway Community não tem *undo*: para voltar, restaure o backup anterior à implantação.

Alterações incompatíveis na V1 só valem para bancos recriáveis (desenvolvimento). Um banco criado por migrações antigas não é compatível: o Flyway recusa o histórico divergente.

## Recriar o banco local

Remove todos os dados locais (apaga o volume do MySQL do projeto):

```powershell
docker compose down -v
docker compose up --build -d
```

Depois, insira o primeiro administrador.

## Primeiro administrador

A aplicação não cria, recria ou altera usuários na inicialização; contas e hashes ficam só no banco, e recriar o banco não recria uma conta padrão. Em banco novo, insira o administrador com um hash BCrypt, ligado ao perfil pronto `ADMIN`:

```sql
INSERT INTO user_accounts (username, full_name, password_hash, active, created_at, updated_at, profile_id)
VALUES ('admin', 'Administrador', '<hash BCrypt>', TRUE, CURRENT_TIMESTAMP(6), CURRENT_TIMESTAMP(6),
        (SELECT id FROM access_profiles WHERE legacy_code = 'ADMIN'));
```

Depois, usuários e perfis são mantidos pelas telas Usuários e Perfis. Não há coluna de role: o acesso vem do perfil e das permissões extras ([acesso-e-permissoes.md](acesso-e-permissoes.md)). Senha: 6 a 72 bytes (UTF-8).

## Validar migrações em um MySQL isolado

`compose.migration-check.yaml` sobe um MySQL 8 na porta local **3317** e roda o Flyway 9.22.3 contra a pasta de migrações. Use um projeto à parte para não tocar nas pilhas de desenvolvimento:

```powershell
docker compose -p navitas-mig -f compose.migration-check.yaml up -d mysql
docker compose -p navitas-mig -f compose.migration-check.yaml run --rm flyway
docker compose -p navitas-mig -f compose.migration-check.yaml down -v
```

## MySQL, H2 e PostgreSQL

- A produção e o desenvolvimento usam MySQL 8; o `pom.xml` traz o driver e o módulo do Flyway só para MySQL.
- Os testes rodam em H2 com `MODE=MySQL`. A V4 usa comentários condicionais do MySQL 8 (`/*!80000 ... */`) para a collation do e-mail; o H2 os ignora.
- Hoje não há suporte a PostgreSQL no código. Por decisão do dono do produto (13 de novembro de 2026), o PostgreSQL passará a ser o único banco, em todos os ambientes, com uma nova baseline em dialeto PostgreSQL; o plano está em [superpowers/plans/2026-11-13-migracao-para-postgres.md](superpowers/plans/2026-11-13-migracao-para-postgres.md) e ainda não foi executado. Quando for, este documento, `configuracao.md` e `desenvolvimento.md` precisam ser atualizados.
- As URLs JDBC de desenvolvimento usam `serverTimezone=UTC`; as regras de negócio por dia usam `America/Sao_Paulo` no código, não no banco.
