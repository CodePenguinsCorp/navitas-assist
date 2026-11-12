# Tempo por etapa e data limite — plano de implementação

> **Nota (13 nov 2026): migrações zeradas.** As migrações V1–V10 viraram uma única `V1__baseline.sql` (não havia dados em produção). A migração do prazo passa a ser **V2** (`V2__rma_due_date_and_remove_stage_sla.sql`), não V11, e não há V12 de colunas legadas (elas já não existem). Não há dados a preservar: os trechos de legado/descontinuado de `SLA_*` (constantes mantidas com `supported = false`, rótulo "Prazo de etapa (descontinuado)", teste de notificação SLA antiga) podem ser apagados de vez na implementação do prazo.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** trocar o SLA por etapa por duas coisas: o tempo corrido em cada etapa e uma data limite opcional do atendimento, que só destaca e filtra.

**Architecture:** o backend calcula os períodos por etapa a partir de `rma_status_history` e a situação da data limite a partir de `rmas.due_date` e do "hoje" de São Paulo, e manda os dois no `RmaResponse` no lugar de `sla`. O frontend recalcula a situação a cada tique do relógio, filtra e destaca. Os alertas de SLA e a configuração por etapa saem, numa migração Flyway V11 portável.

**Tech Stack:** Spring Boot 3, JPA/Hibernate, Flyway, H2 (testes) e MySQL 8, Angular (signals, componentes standalone), Vitest + happy-dom.

**Spec:** `docs/superpowers/specs/2026-11-13-tempo-por-etapa-e-data-limite-design.md`

## Global Constraints

- Fuso do negócio: `America/Sao_Paulo`. A data limite é `LocalDate`/`YYYY-MM-DD`, e "hoje" é sempre a data civil de São Paulo.
- Situações: `OVERDUE` "Atrasado", `DUE_SOON` "Perto do limite", `ON_TRACK` "No prazo", `NO_DUE_DATE` "Sem data limite", `CLOSED` "Encerrado". A palavra "Vencido(s)" é proibida na interface.
- Janela "Perto do limite": `navitas.deadline.warning-days`, padrão 7, de 0 a 90, variável `DEADLINE_WARNING_DAYS`.
- Encerrados (`COMPLETED`, `RETURNED`, `IRREPARABLE`) nunca são atrasados.
- Sem endpoint novo e sem permissão nova. `POST /api/rmas` (`rma.abrir`) e `PUT /api/rmas/{id}` (`rma.editar`). `PermissionEquivalenceIntegrationTest` continua com 423 casos.
- A migração nova é `V11__rma_due_date_and_remove_stage_sla.sql`, em SQL portável (MySQL 8 e PostgreSQL), sem tocar em sessões, perfis nem permissões.
- Frontend no padrão atual: `app-page-header`, `app-custom-select`, `app-date-picker`, `appModalFocus`, pop-up global de carregamento, botões coloridos (`button-primary`/`button-secondary`), Cancelar à esquerda, sem textos explicativos soltos, sem rolagem horizontal a 320 px.
- Commits: um por tarefa, em português, `git add` por caminho, **sem** trailer `Co-Authored-By` e sem mencionar IA. Sem push.
- Comandos:
  - Backend, completo: `mvn -B -ntp -f backend/pom.xml verify`. Um teste: `mvn -B -ntp -f backend/pom.xml -Dtest=<Classe> test`.
  - Frontend, completo: `npm --prefix frontend test -- --watch=false --runner-config "C:\Users\joseh\AppData\Local\Temp\vitest-runner.config.mjs"`. Um arquivo: o mesmo comando com `--include <caminho relativo a frontend>`.
  - Build: `npm --prefix frontend run build`.

## Review Focus

1. **Virada do dia.** Um RMA com data limite de hoje, visto às 23:59 e às 00:00 de São Paulo (02:59Z e 03:00Z), tem de passar de "Vence hoje" para "Atrasado há 1 dia" sem recarregar. Testes: `RmaDeadlineServiceTest.businessDateUsesSaoPauloMidnight` (Task 2) e `rma-deadline.spec.ts` "turns overdue at São Paulo midnight" (Task 8).
2. **Mudar a entrada para depois da data limite.** Editar só `entryDate` deixando a data limite anterior a ela tem de ser recusado com 400. Teste: `shouldRejectEntryDateAfterExistingDueDate` (Task 5).
3. **Visualização salva antiga** (sem `deadline` no JSON) tem de abrir com "Prazo: Todos", sem erro. Testes: `shouldReadViewsSavedWithoutDeadline` (Task 7) e "opens a view saved without deadline as Todos" (Task 10).
4. **Caixa de entrada com alerta SLA antigo** tem de continuar abrindo (sem 500), com rótulo "Prazo de etapa (descontinuado)". Testes: `legacySlaNotificationsStayReadable` (Task 3) e o caso de rótulo em `notification-ui.spec.ts` (Task 14).
5. **Remover a data limite** pelo diálogo (limpar o campo e salvar) tem de mandar `clearDueDate: true`, não `dueDate: null`, que o backend trata como "não muda". Teste: "sends clearDueDate when the field is cleared" (Task 11).

---

## Mapa de arquivos

Backend (`backend/src/main/java/br/com/navitasassist`):

- Criar: `rma/RmaStagePeriodResponse.java`, `rma/RmaDeadlineStatus.java`, `rma/RmaDeadlineResponse.java`, `rma/RmaDueDateHistory.java`, `rma/RmaDueDateHistoryResponse.java`, `config/RmaDeadlineProperties.java`, `service/RmaStageTimeService.java`, `service/RmaDeadlineService.java` e `resources/db/migration/V11__rma_due_date_and_remove_stage_sla.sql`.
- Alterar: `rma/RmaRecord.java`, `rma/CreateRmaRequest.java`, `rma/UpdateRmaRequest.java`, `rma/RmaResponse.java`, `service/RmaService.java`, `service/RmaReportService.java`, `repository/RmaRecordRepository.java`, `kanban/KanbanView.java`, `kanban/KanbanViewFilters.java`, `service/KanbanViewService.java`, `notification/NotificationEventType.java`, `service/NotificationContentFactory.java`, `config/NotificationProperties.java`, `resources/application.yml` e `test/resources/application-test.yml`.
- Apagar: `config/RmaSlaProperties.java`, `rma/RmaSlaStatus.java`, `rma/RmaSlaResponse.java`, `service/RmaSlaService.java`, `service/SlaNotificationScanner.java`, `service/SlaNotificationScheduler.java` e `config/NotificationSchedulingConfig.java`.

Frontend (`frontend/src/app`):

- Criar: `core/utils/duration.ts`, `core/utils/rma-stage.ts`, `core/utils/rma-deadline.ts` (cada um com `.spec.ts`), `core/services/clock.service.ts`, `shared/rma-deadline-chip/*`, `shared/rma-stage-times/*` e `shared/rma-due-date-dialog/*`.
- Alterar: `core/models.ts`, `testing/rma-fixtures.ts`, `core/services/rma.service.ts`, `core/utils/rma-block.ts`, `core/utils/rma-detail.ts`, `core/utils/notification-ui.ts`, `pages/kanban/*`, `shared/rma-kanban-board/*`, `shared/rma-detail-modal/*`, `pages/rmas/*`, `pages/reports/*`, `pages/dashboard/*`, `pages/notifications/*`, `shared/rma-block-history/*` e `styles.css`.
- Apagar: `core/utils/rma-sla.ts`, `core/utils/rma-sla.spec.mjs`, `core/services/sla-clock.service.ts` e `shared/rma-sla-badge/*`.

Raiz: `README.md`, `frontend/README.md`, `frontend/package.json`, `.github/workflows/frontend-ci.yml`, `.env.example`, `.env.prod.example`, `compose.yaml`, `compose.prod.yaml` e `docs/superpowers/plans/2026-11-11-permissoes.md` (nota da V12).

---

### Task 1: Cálculo do tempo por etapa (backend)

**Files:**
- Create: `backend/src/main/java/br/com/navitasassist/rma/RmaStagePeriodResponse.java`
- Create: `backend/src/main/java/br/com/navitasassist/service/RmaStageTimeService.java`
- Test: `backend/src/test/java/br/com/navitasassist/rma/RmaStageTimeServiceTest.java`

**Interfaces:**
- Produces: `record RmaStagePeriodResponse(RmaStatus status, Instant enteredAt, Instant leftAt, long durationSeconds)`, e `@Service RmaStageTimeService` com `List<RmaStagePeriodResponse> periods(RmaRecord rma, Instant now)`, que devolve a lista cronológica, nunca vazia, com o último item sendo a etapa atual (`leftAt == null`).

- [ ] **Step 1: Write the failing tests** (unidade pura, `new RmaStageTimeService()`, `RmaRecord` montado à mão como em `RmaSlaTest`):
  - `collapsesConsecutiveRecordsOfTheSameStage`: os registros RECEIVED 10:00, RECEIVED 10:30 (nota) e TRIAGE 12:00, com now 13:00, dão `[RECEIVED 10:00→12:00 7200, TRIAGE 12:00→null 3600]`.
  - `reentryOpensANewPeriod`: TRIAGE, IN_DIAGNOSIS, TRIAGE dão 3 períodos, com o último TRIAGE iniciado na reentrada.
  - `ordersEqualTimestampsById`: dois registros no mesmo instante com ids 2 (TRIAGE) e 1 (RECEIVED) dão RECEIVED com duração 0 e depois TRIAGE.
  - `legacyWithoutHistoryStartsAtCreation`: sem histórico, `createdAt` 2026-11-10T12:00Z dá um período no status atual a partir de `createdAt`. Sem `createdAt`, começa em `entryDate` 2026-11-10 à meia-noite de São Paulo (`2026-11-10T03:00:00Z`).
  - `appendsCurrentStageWhenHistoryIsBehind`: o último registro é TRIAGE às 12:00 e o status atual é IN_REPAIR, então o último período é IN_REPAIR a partir das 12:00.
  - `neverReturnsNegativeDurations`: `now` antes do último registro dá `durationSeconds == 0`.
  - `closedRmaKeepsCountingSinceClosing`: COMPLETED às 10:00 e now 12:00 dão um último período COMPLETED de 7200.
- [ ] **Step 2: Run** `mvn -B -ntp -f backend/pom.xml -Dtest=RmaStageTimeServiceTest test`. Expected: FAIL (a classe não existe).
- [ ] **Step 3: Implement** `RmaStageTimeService.periods` como na spec §3.1. Ordena por `changedAt` crescente e depois `id` crescente, com nulos por último. Agrupa em blocos consecutivos. O fallback é `createdAt`, depois `entryDate.atStartOfDay(America/Sao_Paulo)`, depois `now`. `durationSeconds = Math.max(0, Duration.between(enteredAt, leftAt ?? now).getSeconds())`.
- [ ] **Step 4: Run** o mesmo comando. Expected: PASS.
- [ ] **Step 5: Commit**

```bash
git add backend/src/main/java/br/com/navitasassist/rma/RmaStagePeriodResponse.java backend/src/main/java/br/com/navitasassist/service/RmaStageTimeService.java backend/src/test/java/br/com/navitasassist/rma/RmaStageTimeServiceTest.java
git commit -m "feat(prazo): calcula o tempo de cada etapa a partir do histórico de status"
```

### Task 2: Situação da data limite (backend)

**Files:**
- Create: `rma/RmaDeadlineStatus.java`, `rma/RmaDeadlineResponse.java`, `config/RmaDeadlineProperties.java` e `service/RmaDeadlineService.java` (em `backend/src/main/java/br/com/navitasassist/`)
- Modify: `backend/src/main/resources/application.yml`, no bloco `navitas:`, com `deadline: warning-days: ${DEADLINE_WARNING_DAYS:7}`
- Test: `backend/src/test/java/br/com/navitasassist/rma/RmaDeadlineServiceTest.java` e `backend/src/test/java/br/com/navitasassist/config/RmaDeadlinePropertiesTest.java`

**Interfaces:**
- Produces: `enum RmaDeadlineStatus { OVERDUE, DUE_SOON, ON_TRACK, NO_DUE_DATE, CLOSED }` e `record RmaDeadlineResponse(RmaDeadlineStatus status, LocalDate dueSoonFrom, Long daysUntilDue)`. Também `RmaDeadlineProperties` (`navitas.deadline`, com `int warningDays = 7`, `@Min(0) @Max(90)`) e `@Service RmaDeadlineService(RmaDeadlineProperties)`, com `RmaDeadlineResponse evaluate(RmaRecord rma, LocalDate today)` e `static LocalDate businessDate(Instant now)`.

- [ ] **Step 1: Write the failing tests.**
  - `RmaDeadlineServiceTest.classifiesBoundaries` (parametrizado, `warningDays = 7`, `today = 2026-11-13`, status IN_REPAIR): a data limite 2026-11-21 (8 dias) dá `ON_TRACK`/8. 2026-11-20 dá `DUE_SOON`/7, 2026-11-13 dá `DUE_SOON`/0, e 2026-11-12 dá `OVERDUE`/−1. `dueSoonFrom == dueDate.minusDays(7)`.
  - `zeroWindowOnlyFlagsTheDueDay`: com `warningDays = 0`, amanhã é `ON_TRACK` e hoje é `DUE_SOON`.
  - `closedIsNeverOverdue` (parametrizado em COMPLETED, RETURNED e IRREPARABLE, com data limite no passado): dá `CLOSED`, com `daysUntilDue` nulo e `dueSoonFrom` preenchido.
  - `withoutDueDate`: dá `NO_DUE_DATE` com `dueSoonFrom` e `daysUntilDue` nulos. Encerrado sem data dá `CLOSED`.
  - `businessDateUsesSaoPauloMidnight`: `2026-11-14T02:59:59Z` dá 2026-11-13, e `2026-11-14T03:00:00Z` dá 2026-11-14.
  - `RmaDeadlinePropertiesTest`: no estilo de `RmaSlaPropertiesTest`, com `ApplicationContextRunner` e `@EnableConfigurationProperties`. O padrão é 7, `navitas.deadline.warning-days=-1` e `=91` falham na inicialização, e `=0` passa.
- [ ] **Step 2: Run** `mvn -B -ntp -f backend/pom.xml -Dtest=RmaDeadlineServiceTest,RmaDeadlinePropertiesTest test`. Expected: FAIL.
- [ ] **Step 3: Implement** as quatro classes e a linha no `application.yml`. Para os dias, use `ChronoUnit.DAYS.between(today, dueDate)`.
- [ ] **Step 4: Run** o mesmo comando. Expected: PASS.
- [ ] **Step 5: Commit**

```bash
git add backend/src/main/java/br/com/navitasassist/rma/RmaDeadlineStatus.java backend/src/main/java/br/com/navitasassist/rma/RmaDeadlineResponse.java backend/src/main/java/br/com/navitasassist/config/RmaDeadlineProperties.java backend/src/main/java/br/com/navitasassist/service/RmaDeadlineService.java backend/src/main/resources/application.yml backend/src/test/java/br/com/navitasassist/rma/RmaDeadlineServiceTest.java backend/src/test/java/br/com/navitasassist/config/RmaDeadlinePropertiesTest.java
git commit -m "feat(prazo): situação da data limite no fuso de São Paulo com janela configurável"
```

### Task 3: Remover os alertas internos de SLA (backend)

**Files:**
- Delete: `service/SlaNotificationScanner.java`, `service/SlaNotificationScheduler.java`, `config/NotificationSchedulingConfig.java` e `backend/src/test/java/br/com/navitasassist/notification/SlaNotificationSchedulerTest.java`
- Modify: `notification/NotificationEventType.java` (`SLA_WARNING(false)` e `SLA_OVERDUE(false)`, com Javadoc de legado: só servem para ler notificações antigas e não podem ganhar produtor nem regra), `service/NotificationContentFactory.java` (tira os `case SLA_*`, `dueAt`, `DATE_TIME` e a dependência de `RmaSlaService`), `config/NotificationProperties.java` (tira `SlaScan`), `resources/application.yml` (tira `navitas.notifications.sla-scan`) e `test/resources/application-test.yml` (tira `sla-scan`)
- Test: `backend/src/test/java/br/com/navitasassist/notification/NotificationIntegrationTest.java`

**Interfaces:**
- Consumes: nada das tarefas anteriores.
- Produces: `NotificationEventType.SLA_WARNING.isSupported() == false`.

- [ ] **Step 1: Write the failing test** `legacySlaNotificationsStayReadable` em `NotificationIntegrationTest`. Insira por JDBC (`JdbcTemplate`) um `notification_events` `SLA_OVERDUE` `PROCESSED` e uma `notifications` `SLA_OVERDUE` para o técnico. `GET /api/notifications` como esse técnico devolve 200 com `$[0].eventType == "SLA_OVERDUE"` e o título gravado. Acrescente `slaTypesAreNoLongerSupported`: `assertFalse(NotificationEventType.SLA_WARNING.isSupported())` e o mesmo para `SLA_OVERDUE`.
- [ ] **Step 2: Remove** `slaScanAlertsOverdueRmasOncePerStage` e o campo `slaNotificationScanner`. Troque `SLA_WARNING` por `RMA_CREATED` no teste da linha 381 (`PUT /api/notification-rules/...`) e ajuste as linhas 446–447 de `reset(...)` para os tipos que restam.
- [ ] **Step 3: Run** `mvn -B -ntp -f backend/pom.xml -Dtest=NotificationIntegrationTest test`. Expected: FAIL em `slaTypesAreNoLongerSupported`.
- [ ] **Step 4: Implement** as remoções e alterações listadas em Files.
- [ ] **Step 5: Run** `mvn -B -ntp -f backend/pom.xml verify`. Expected: PASS. Os outros testes de SLA (`RmaSlaTest` etc.) continuam válidos até a Task 6.
- [ ] **Step 6: Commit**

```bash
git add -A backend/src/main/java/br/com/navitasassist/service/SlaNotificationScanner.java backend/src/main/java/br/com/navitasassist/service/SlaNotificationScheduler.java backend/src/main/java/br/com/navitasassist/config/NotificationSchedulingConfig.java backend/src/test/java/br/com/navitasassist/notification/SlaNotificationSchedulerTest.java
git add backend/src/main/java/br/com/navitasassist/notification/NotificationEventType.java backend/src/main/java/br/com/navitasassist/service/NotificationContentFactory.java backend/src/main/java/br/com/navitasassist/config/NotificationProperties.java backend/src/main/resources/application.yml backend/src/test/resources/application-test.yml backend/src/test/java/br/com/navitasassist/notification/NotificationIntegrationTest.java
git commit -m "refactor(prazo): remove os alertas internos de SLA e mantém legíveis os já entregues"
```

### Task 4: Migração V11

**Files:**
- Create: `backend/src/main/resources/db/migration/V11__rma_due_date_and_remove_stage_sla.sql`
- Test: `backend/src/test/java/br/com/navitasassist/migration/DeadlineMigrationTest.java` (cria) e `backend/src/test/java/br/com/navitasassist/migration/DatabaseMigrationTest.java` (altera)
- Modify: `docs/superpowers/plans/2026-11-11-permissoes.md`, na Task 20, com uma linha: "A V11 foi usada pela data limite; a remoção das colunas legadas passa a ser `V12__drop_legacy_role_columns.sql`."

**Interfaces:**
- Produces: colunas `rmas.due_date` e `kanban_views.deadline_status`, a tabela `rma_due_date_history` (colunas da spec §2) e a restrição `ck_kanban_views_deadline`.

- [ ] **Step 1: Write the failing tests.**
  - `DeadlineMigrationTest.addsDeadlineSchema`: H2 `MODE=MySQL;DATABASE_TO_LOWER=TRUE`, com `migrateTo(url, "11")` (mesmo helper de `AccessProfileMigrationTest`). Confere que `rmas.due_date` existe e é DATE, que `rma_due_date_history` existe com os seis campos, e que o índice `idx_rma_due_date_history_rma_id` existe. `INSERT` de `kanban_views` com `deadline_status = 'CLOSED'` lança `SQLException`, e com `'DUE_SOON'` passa.
  - `DeadlineMigrationTest.removesSlaRulesAndMutesButKeepsDeliveredNotifications`: migra até 10 e insere um usuário, uma linha em `notification_mutes` (`SLA_WARNING`) e outra (`RMA_CREATED`), um `notification_events` e uma `notifications` `SLA_OVERDUE`. Migra até 11. Restam 2 regras (`RMA_CREATED` e `RMA_ASSIGNED`), nenhuma linha de `notification_rule_recipient_profiles` aponta para regra inexistente, o silenciamento `RMA_CREATED` fica, o `SLA_WARNING` some, e a notificação e o evento `SLA_OVERDUE` continuam.
  - `DatabaseMigrationTest`: `assertEquals(8, executedMigrations)` e `assertEquals(2, count(connection, "notification_rules"))`.
- [ ] **Step 2: Run** `mvn -B -ntp -f backend/pom.xml -Dtest=DeadlineMigrationTest,DatabaseMigrationTest test`. Expected: FAIL.
- [ ] **Step 3: Implement** a V11 com o SQL da spec §6. Um comentário no topo: "Data limite do atendimento e fim do SLA por etapa. Notificações SLA_* entregues ficam (caixa de entrada)." O `CREATE TABLE` tem FK `fk_rma_due_date_history_rma` para `rmas (id)`.
- [ ] **Step 4: Run** `mvn -B -ntp -f backend/pom.xml verify`. Expected: PASS. `AccessProfileMigrationTest` migra até 9 ou 10, então os casos de `SLA_*` dele continuam válidos.
- [ ] **Step 5: Commit**

```bash
git add backend/src/main/resources/db/migration/V11__rma_due_date_and_remove_stage_sla.sql backend/src/test/java/br/com/navitasassist/migration/DeadlineMigrationTest.java backend/src/test/java/br/com/navitasassist/migration/DatabaseMigrationTest.java docs/superpowers/plans/2026-11-11-permissoes.md
git commit -m "feat(prazo): migração V11 com data limite, histórico e fim das regras de SLA"
```

### Task 5: Data limite no RMA (persistência, API e histórico)

**Files:**
- Create: `rma/RmaDueDateHistory.java` (entidade, no molde de `RmaAssignmentHistory`) e `rma/RmaDueDateHistoryResponse.java`
- Modify: `rma/RmaRecord.java` (campo `dueDate` e coleção `dueDateHistory` com `addDueDateHistory`), `rma/CreateRmaRequest.java` (`LocalDate dueDate`), `rma/UpdateRmaRequest.java` (`LocalDate dueDate`, `Boolean clearDueDate`), `rma/RmaResponse.java` (acrescenta `LocalDate dueDate` e `List<RmaDueDateHistoryResponse> dueDateHistory` depois de `assignmentHistory`, mantendo `sla` por enquanto), `service/RmaService.java`, `repository/RmaRecordRepository.java` (`fetchDueDateHistory`) e `service/RmaReportService.java` (chama `fetchDueDateHistory`)
- Test: `backend/src/test/java/br/com/navitasassist/rma/RmaControllerIntegrationTest.java`

**Interfaces:**
- Consumes: o schema da Task 4.
- Produces: o JSON do RMA com `dueDate` (`"2026-11-30"` ou `null`) e `dueDateHistory[] {previousDueDate, newDueDate, changedBy, changedAt}`. O PUT aceita `{"dueDate": "..."}` ou `{"clearDueDate": true}`. Também `record RmaDueDateHistoryResponse(LocalDate previousDueDate, LocalDate newDueDate, String changedBy, Instant changedAt)` com `static from(RmaDueDateHistory)`.

- [ ] **Step 1: Write the failing tests** em `RmaControllerIntegrationTest`, usando os helpers de criação que já existem:
  - `shouldCreateWithOptionalDueDateAndRecordIt`: POST com `dueDate` igual à entrada + 10 dá 201, `$.dueDate` com a data, `$.dueDateHistory[0].previousDueDate` nulo, `newDueDate` com a data e `changedBy` com o usuário. POST sem `dueDate` dá `$.dueDate` nulo e `dueDateHistory` vazio.
  - `shouldChangeAndClearDueDateWithHistory`: um PUT `{dueDate: D2}` e depois um PUT `{clearDueDate: true}` dão `dueDate` nulo e `dueDateHistory` com 2 itens, o mais recente primeiro: `(D2 → null)` e `(D1 → D2)`. Um PUT com a mesma data não acrescenta histórico.
  - `shouldRejectDueDateAndClearTogether`: dá 400.
  - `shouldRejectDueDateBeforeEntryDate`: POST e PUT dão 400.
  - `shouldRejectEntryDateAfterExistingDueDate`: um PUT que só muda `entryDate` para depois da data limite dá 400.
  - `shouldRequireEditPermissionToChangeDueDate`: PUT `{dueDate}` com um usuário que só tem `rma.ver` dá 403.
- [ ] **Step 2: Run** `mvn -B -ntp -f backend/pom.xml -Dtest=RmaControllerIntegrationTest test`. Expected: FAIL.
- [ ] **Step 3: Implement.** Em `RmaService.create`, se `request.dueDate() != null`, defina o campo e chame `addDueDateHistory(rma, null, dueDate)` depois de `validateDates`. Em `update`, se `Boolean.TRUE.equals(clearDueDate) && dueDate != null`, lance `BusinessException("Provide a due date or clear it, not both.")`. Calcule o novo valor e, se ele for diferente do atual, grave o histórico `(anterior → novo)`. Em `validateDates`, acrescente `if (rma.getDueDate() != null && rma.getDueDate().isBefore(rma.getEntryDate())) throw new BusinessException("Due date cannot be before entry date.")`. O helper é `private void addDueDateHistory(RmaRecord, LocalDate previous, LocalDate next)`, que usa `currentUsername()` e `Instant.now()`.
- [ ] **Step 4: Run** `mvn -B -ntp -f backend/pom.xml verify`. Expected: PASS, com `PermissionEquivalenceIntegrationTest` inalterado.
- [ ] **Step 5: Commit**

```bash
git add backend/src/main/java/br/com/navitasassist/rma/RmaDueDateHistory.java backend/src/main/java/br/com/navitasassist/rma/RmaDueDateHistoryResponse.java backend/src/main/java/br/com/navitasassist/rma/RmaRecord.java backend/src/main/java/br/com/navitasassist/rma/CreateRmaRequest.java backend/src/main/java/br/com/navitasassist/rma/UpdateRmaRequest.java backend/src/main/java/br/com/navitasassist/rma/RmaResponse.java backend/src/main/java/br/com/navitasassist/service/RmaService.java backend/src/main/java/br/com/navitasassist/repository/RmaRecordRepository.java backend/src/main/java/br/com/navitasassist/service/RmaReportService.java backend/src/test/java/br/com/navitasassist/rma/RmaControllerIntegrationTest.java
git commit -m "feat(prazo): data limite opcional no RMA com histórico de alterações"
```

### Task 6: Resposta com tempo por etapa e prazo, sem SLA

**Files:**
- Modify: `rma/RmaResponse.java` (troca `RmaSlaResponse sla` por `RmaDeadlineResponse deadline` no mesmo lugar e acrescenta `List<RmaStagePeriodResponse> stagePeriods` depois de `statusHistory`; a assinatura vira `from(RmaRecord rma, List<RmaStagePeriodResponse> stagePeriods, RmaDeadlineResponse deadline)`), `service/RmaService.java` (`toResponse`), `service/RmaReportService.java` (usa `generatedAt` e `RmaDeadlineService.businessDate(generatedAt)`) e `resources/application.yml` (tira o bloco `navitas.sla`)
- Delete: `service/RmaSlaService.java`, `config/RmaSlaProperties.java`, `rma/RmaSlaStatus.java`, `rma/RmaSlaResponse.java`, `backend/src/test/java/br/com/navitasassist/rma/RmaSlaTest.java` e `backend/src/test/java/br/com/navitasassist/config/RmaSlaPropertiesTest.java`
- Test: `RmaControllerIntegrationTest` (substitui `shouldExposeSlaAndRestartItAfterPersistedStageChange`, linhas 535–572), `RmaReportIntegrationTest` (linhas 127 e 142–143) e `RmaBlockIntegrationTest` (linhas 79–80)

**Interfaces:**
- Consumes: `RmaStageTimeService.periods` (Task 1), `RmaDeadlineService.evaluate/businessDate` (Task 2) e `dueDate` (Task 5).
- Produces: o JSON do RMA sem `sla`, com `deadline {status, dueSoonFrom, daysUntilDue}` e `stagePeriods[] {status, enteredAt, leftAt, durationSeconds}`.

- [ ] **Step 1: Rewrite the tests.**
  - `shouldExposeStagePeriodsAndRestartAfterStageChange`: mesmo cenário do teste antigo (histórico em 2020-01-01T10:00Z). `$.stagePeriods[-1:].status` é `RECEIVED`, `$.stagePeriods[0].enteredAt` é `2020-01-01T10:00:00Z`, e `leftAt` do último não existe. Depois de `PATCH status IN_DIAGNOSIS`, o último período é `IN_DIAGNOSIS` e o anterior tem `leftAt`. Depois de `COMPLETED`, `$.deadline.status` é `CLOSED`. `$.sla` não existe em nenhuma resposta.
  - `shouldExposeDeadlineStatus`: um RMA com `dueDate` = hoje (SP) − 1 dá `$.deadline.status == "OVERDUE"` e `daysUntilDue == -1`. Com hoje + 3 dá `DUE_SOON`, e sem data dá `NO_DUE_DATE`.
  - `RmaReportIntegrationTest`: troque `/rmas/0/sla/elapsedSeconds` por `/rmas/0/stagePeriods/<último>/durationSeconds` e `sla/startedAt` por `enteredAt`, com os mesmos valores esperados. Troque `sla.status CLOSED` por `deadline.status CLOSED`.
  - `RmaBlockIntegrationTest`: o tamanho e o `enteredAt` do último período não mudam ao bloquear.
- [ ] **Step 2: Run** `mvn -B -ntp -f backend/pom.xml -Dtest=RmaControllerIntegrationTest,RmaReportIntegrationTest,RmaBlockIntegrationTest test`. Expected: FAIL.
- [ ] **Step 3: Implement.** `RmaService` passa a injetar `RmaStageTimeService` e `RmaDeadlineService`. `toResponse` usa um único `Instant now` para `periods(rma, now)` e `evaluate(rma, RmaDeadlineService.businessDate(now))`. Apague as classes SLA e o bloco `navitas.sla` do `application.yml`.
- [ ] **Step 4: Run** `mvn -B -ntp -f backend/pom.xml verify`. Expected: PASS. `git grep -n "RmaSla\|navitas.sla" backend` não devolve nada.
- [ ] **Step 5: Commit** (`git add` dos arquivos alterados e `git add -A` dos caminhos apagados)

```bash
git commit -m "refactor(prazo): resposta do RMA com tempo por etapa e prazo no lugar do SLA"
```

### Task 7: Filtro de prazo nas visualizações salvas (backend)

**Files:**
- Modify: `kanban/KanbanView.java` (campo `deadline` em `deadline_status`), `kanban/KanbanViewFilters.java` (componente `RmaDeadlineStatus deadline` no fim, e `from()` preenche) e `service/KanbanViewService.java` (`apply` grava, `validate` recusa `CLOSED`)
- Test: `backend/src/test/java/br/com/navitasassist/kanban/KanbanViewControllerIntegrationTest.java` e `backend/src/test/java/br/com/navitasassist/config/EnumPersistenceIntegrationTest.java`

**Interfaces:**
- Produces: `filters.deadline` em `/api/kanban-views`, com `"OVERDUE" | "DUE_SOON" | "ON_TRACK" | "NO_DUE_DATE" | null`.

- [ ] **Step 1: Write the failing tests.**
  - `shouldPersistDeadlineFilter`: POST com `filters.deadline = "DUE_SOON"`, depois GET, devolve `$[0].filters.deadline == "DUE_SOON"`. PUT com `null` limpa o valor.
  - `shouldRejectClosedDeadlineFilter`: `CLOSED` dá 400.
  - `shouldReadViewsSavedWithoutDeadline`: POST sem a chave `deadline` dá 201 e `filters.deadline` nulo.
  - `EnumPersistenceIntegrationTest.shouldStoreEveryDeadlineFilterAsItsName`: para cada status diferente de CLOSED, a coluna `kanban_views.deadline_status` guarda `name()`. No caso de limpar, `shouldClearOptionalEnumsToNull`, a coluna fica nula.
- [ ] **Step 2: Run** `mvn -B -ntp -f backend/pom.xml -Dtest=KanbanViewControllerIntegrationTest,EnumPersistenceIntegrationTest test`. Expected: FAIL.
- [ ] **Step 3: Implement.** A mensagem é `"Deadline filter must be OVERDUE, DUE_SOON, ON_TRACK or NO_DUE_DATE."`.
- [ ] **Step 4: Run** `mvn -B -ntp -f backend/pom.xml verify`. Expected: PASS, com a matriz de permissões inalterada.
- [ ] **Step 5: Commit**

```bash
git add backend/src/main/java/br/com/navitasassist/kanban/KanbanView.java backend/src/main/java/br/com/navitasassist/kanban/KanbanViewFilters.java backend/src/main/java/br/com/navitasassist/service/KanbanViewService.java backend/src/test/java/br/com/navitasassist/kanban/KanbanViewControllerIntegrationTest.java backend/src/test/java/br/com/navitasassist/config/EnumPersistenceIntegrationTest.java
git commit -m "feat(prazo): visualizações salvas do Kanban guardam o filtro de prazo"
```

### Task 8: Modelos e utilitários do frontend

**Files:**
- Modify: `frontend/src/app/core/models.ts`. Acrescenta `RmaDeadlineStatus`, `RmaDeadlineResponse`, `RmaStagePeriodResponse` e `RmaDueDateHistoryResponse`. Em `RmaResponse`, acrescenta `dueDate: string | null`, `deadline`, `stagePeriods` e `dueDateHistory`, mantendo `sla` até a Task 14. Também `CreateRmaRequest.dueDate: string | null`, `KanbanViewFilters.deadline?: DeadlineFilterValue | null` (sem `'all'`) e `UpdateRmaDueDateRequest = { dueDate: string } | { clearDueDate: true }`.
- Modify: `frontend/src/app/testing/rma-fixtures.ts`, com os padrões `dueDate: null`, `deadline: { status: 'NO_DUE_DATE', dueSoonFrom: null, daysUntilDue: null }`, `stagePeriods: [{ status: 'RECEIVED', enteredAt: '2026-10-20T12:00:00Z', leftAt: null, durationSeconds: 0 }]` e `dueDateHistory: []`.
- Create: `frontend/src/app/core/utils/duration.ts`, `rma-stage.ts` e `rma-deadline.ts`, com `.spec.ts`.
- Modify: `frontend/src/app/core/utils/rma-block.ts` (usa `formatDuration`) e os specs que conferem o texto de bloqueio (`rma-block-history.component.spec.ts`, `rma-block-panel.component.spec.ts`, `rma-kanban-board.component.spec.ts` e `rma-detail.spec.ts`, quando trazem "1h 1min" e similares).

**Interfaces:**
- Produces:
  - `formatDuration(seconds: number): string`
  - `currentStagePeriod(rma: Pick<RmaResponse, 'stagePeriods'>): RmaStagePeriodResponse`
  - `stageElapsedSeconds(period: RmaStagePeriodResponse, now: number): number`. Para o atual, `max(0, floor((now - enteredAt)/1000))`; para os outros, `durationSeconds`.
  - `stageTimeLabel(rma: Pick<RmaResponse, 'status' | 'stagePeriods'>, now: number): string | null`
  - `type DeadlineStatus = RmaDeadlineStatus`, `type DeadlineFilterValue = 'all' | 'OVERDUE' | 'DUE_SOON' | 'ON_TRACK' | 'NO_DUE_DATE'`, `DEADLINE_LABELS: Record<DeadlineStatus, string>` e `DEADLINE_FILTER_OPTIONS: ReadonlyArray<CustomSelectOption<DeadlineFilterValue>>`
  - `deadlineStatus(rma: Pick<RmaResponse, 'status' | 'dueDate' | 'deadline'>, today: string): DeadlineStatus`
  - `deadlineDetailLabel(rma, today): string`, que devolve o rótulo da situação, ou o texto do card quando há atraso ou proximidade.
  - `deadlineCardLabel(rma, today): string | null`
  - `businessToday(now: number): string`, que é `businessDateInputValue(new Date(now))`.

- [ ] **Step 1: Write the failing specs.**
  - `duration.spec.ts`: 0 e 59 dão `'menos de 1 min'`, 60 dá `'1 min'`, 3600 dá `'1 h'`, 3660 dá `'1 h 1 min'`, 86400 dá `'1 d'` e 187200 dá `'2 d 4 h'`.
  - `rma-stage.spec.ts`: o rótulo é `'há 2 d 4 h nesta etapa'` para IN_REPAIR iniciado 187200 s antes de `now`, `null` para COMPLETED, e "notes do not restart" com o último período vindo do backend.
  - `rma-deadline.spec.ts`: para hoje `2026-11-13`, com `dueSoonFrom` = data − 7, a data 2026-11-21 dá ON_TRACK e card `null`, 2026-11-20 dá DUE_SOON e `'Vence em 7 dias'`, 2026-11-14 dá `'Vence em 1 dia'`, 2026-11-13 dá `'Vence hoje'`, 2026-11-12 dá OVERDUE e `'Atrasado há 1 dia'`, e 2026-11-10 dá `'Atrasado há 3 dias'`. CLOSED com data passada dá `'CLOSED'` e card `null`. Sem data dá NO_DUE_DATE e card `null`. O caso "turns overdue at São Paulo midnight": `businessToday(Date.parse('2026-11-14T02:59:59Z'))` é `'2026-11-13'`, e com `03:00:00Z` é `'2026-11-14'`. Nenhum rótulo contém "Vencid". `DEADLINE_FILTER_OPTIONS` é `['Todos', 'Atrasados', 'Perto do limite', 'No prazo', 'Sem data limite']`.
- [ ] **Step 2: Run** `npm --prefix frontend test -- --watch=false --runner-config "C:\Users\joseh\AppData\Local\Temp\vitest-runner.config.mjs" --include src/app/core/utils`. Expected: FAIL.
- [ ] **Step 3: Implement.** Os dias civis saem de `Date.UTC` sobre `YYYY-MM-DD`, sem `new Date(string)` local.
- [ ] **Step 4: Run** a suíte completa do frontend e o build. Expected: PASS, com os specs de bloqueio já no formato novo.
- [ ] **Step 5: Commit**

```bash
git add frontend/src/app/core/models.ts frontend/src/app/testing/rma-fixtures.ts frontend/src/app/core/utils/duration.ts frontend/src/app/core/utils/duration.spec.ts frontend/src/app/core/utils/rma-stage.ts frontend/src/app/core/utils/rma-stage.spec.ts frontend/src/app/core/utils/rma-deadline.ts frontend/src/app/core/utils/rma-deadline.spec.ts frontend/src/app/core/utils/rma-block.ts <specs de bloqueio alterados>
git commit -m "feat(prazo): utilitários de tempo por etapa, data limite e duração no frontend"
```

### Task 9: Chip de prazo e lista de tempo por etapa

**Files:**
- Create: `frontend/src/app/shared/rma-deadline-chip/rma-deadline-chip.component.{ts,html,css,spec.ts}` e `frontend/src/app/shared/rma-stage-times/rma-stage-times.component.{ts,html,css,spec.ts}`
- Modify: `frontend/src/styles.css`, onde `--sla-overdue` vira `--deadline-overdue` e `--sla-warning` vira `--deadline-soon` (as cores ficam). `--sla-ok` sai só na Task 14, junto com o selo.

**Interfaces:**
- Consumes: os utilitários da Task 8 e `SlaClockService` (até a Task 14).
- Produces: `<app-rma-deadline-chip [rma]="rma" [mode]="'card' | 'detail'" />`. Em `card`, não renderiza nada fora de OVERDUE e DUE_SOON. Em `detail`, mostra `deadlineDetailLabel`. O atributo é `data-deadline="{status}"`. Também `<app-rma-stage-times [rma]="rma" />`, um `<section aria-label="Tempo por etapa">` com `<ol>` de `<li data-stage="{status}">`, no texto "{Etapa} · {duração}". O atual leva " (atual)". O encerrado mostra "Encerrado em {dd/mm/aaaa hh:mm}" na última linha.

- [ ] **Step 1: Write the failing specs.** O chip some no card para ON_TRACK, NO_DUE_DATE e CLOSED. Mostra "Atrasado há 2 dias" com `data-deadline="OVERDUE"`. Muda de "Vence hoje" para "Atrasado há 1 dia" quando o relógio de teste passa de `2026-11-14T02:59Z` para `03:01Z`. A lista renderiza 3 períodos em ordem, com "(atual)" só no último, e o encerrado mostra "Encerrado em".
- [ ] **Step 2: Run** `... --include src/app/shared/rma-deadline-chip --include src/app/shared/rma-stage-times`. Expected: FAIL.
- [ ] **Step 3: Implement** com signals (`input.required`, `computed`). O CSS usa os tokens novos e `overflow-wrap: anywhere`, sem largura fixa.
- [ ] **Step 4: Run** o mesmo comando. Expected: PASS.
- [ ] **Step 5: Commit**

```bash
git add frontend/src/app/shared/rma-deadline-chip frontend/src/app/shared/rma-stage-times frontend/src/styles.css
git commit -m "feat(prazo): chip de prazo e lista de tempo por etapa"
```

### Task 10: Kanban com filtro "Prazo" e card sem SLA

**Files:**
- Modify: `frontend/src/app/pages/kanban/kanban.component.ts`. Em `KanbanFilterValues`, `sla` vira `deadline: DeadlineFilterValue`. O mesmo vale para `filtersForm`, `DEFAULT_KANBAN_FILTERS` e `filterKanbanRmas`, que passa a usar `deadlineStatus(rma, businessToday(now)) === filters.deadline`. `slaFilterOptions` vira `deadlineFilterOptions = DEADLINE_FILTER_OPTIONS`. `toPersistedFilters` manda `deadline` (nulo para `'all'`) e `fromPersistedFilters` faz `filters.deadline ?? 'all'`. O comentário de `ADVANCED_FILTER_KEYS` diz "search, Prazo and assignee".
- Modify: `frontend/src/app/pages/kanban/kanban.component.html:43-50`, com `<label>Prazo</label>`, `formControlName="deadline"`, `ariaLabel="Filtrar Kanban por prazo"` e `[options]="deadlineFilterOptions"`.
- Modify: `frontend/src/app/shared/rma-kanban-board/rma-kanban-board.component.{ts,html,css}`. Sai `showSla` e `RmaSlaBadgeComponent`. Depois do título entram `<app-rma-deadline-chip [rma]="item" mode="card" />` e, se `stageTimeLabel(item, clock.now())`, um `<p class="board-card__stage">`.
- Test: `kanban.component.spec.ts`, `kanban.component.states.spec.ts`, `kanban.component.profiles.spec.ts` e `rma-kanban-board.component.spec.ts`.

**Interfaces:**
- Consumes: as Tasks 8 e 9.

- [ ] **Step 1: Rewrite the SLA specs** com os nomes novos:
  - `rma-kanban-board.component.spec.ts`: "hides the deadline when on track, without due date and when closed", "shows Atrasado and Perto do limite on the card", "turns the card overdue at São Paulo midnight as the shared clock advances" e "shows the time in the current stage only for open RMAs".
  - `kanban.component.spec.ts`: "shows search, Prazo and assignee as quick filters…" (no lugar da linha 107), "filters by each deadline option and keeps closed RMAs only under Todos", "combines Prazo with advanced filters and clears the entire form" (linha 437), "updates the Prazo filter when the day turns" (linha 449), "saves and restores the deadline filter in a view" (no lugar da linha 499, que dizia que as visualizações não guardavam SLA), "opens a view saved without deadline as Todos" e "deselects the saved view on a manual edit, including Prazo" (linha 215).
  - Troque `sla` por `deadline`/`stagePeriods` nos specs `states` e `profiles`. Nenhum spec do Kanban pode conter "SLA".
- [ ] **Step 2: Run** `... --include src/app/pages/kanban --include src/app/shared/rma-kanban-board`. Expected: FAIL.
- [ ] **Step 3: Implement** o que está em Files.
- [ ] **Step 4: Run** a suíte completa e o build. Expected: PASS.
- [ ] **Step 5: Commit**

```bash
git add frontend/src/app/pages/kanban frontend/src/app/shared/rma-kanban-board
git commit -m "feat(prazo): filtro Prazo e indicador de data limite no Kanban"
```

### Task 11: Diálogo da data limite e detalhes do RMA

**Files:**
- Create: `frontend/src/app/shared/rma-due-date-dialog/rma-due-date-dialog.component.{ts,html,css,spec.ts}`
- Modify: `frontend/src/app/core/services/rma.service.ts`, com `updateDueDate(id: number, dueDate: string | null): Observable<RmaResponse>`. O PUT vai para `/api/rmas/${id}` com `{ dueDate }` ou `{ clearDueDate: true }`. Spec em `rma.service.spec.ts`, se o arquivo existir; senão, no spec do diálogo, com `HttpTestingController`.
- Modify: `frontend/src/app/core/utils/rma-detail.ts`. `RmaHistoryEntry` ganha `{ kind: 'dueDate'; at; by; from: string | null; to: string | null }`, e `rmaHistory` aceita `Pick<..., 'statusHistory' | 'assignmentHistory' | 'dueDateHistory'>`. Também ganha `dueDateHistoryLabel(entry)`, que dá "Data limite definida: 25/11/2026", "Data limite 20/11/2026 → 25/11/2026" ou "Data limite removida (era 20/11/2026)". Spec em `rma-detail.spec.ts`.
- Modify: `frontend/src/app/pages/rmas/rmas.component.{ts,html}`. A linha 212 vira dois fatos: "Data limite" (data com `formatDateOnly` e chip `mode="detail"`, ou "Sem data limite" com `is-empty`, e o botão "Alterar" quando `hasPermission('rma.editar')`) e "Nesta etapa". A aba Histórico ganha `<app-rma-stage-times>` antes da lista e mostra as entradas `dueDate`. Salvar atualiza o RMA na lista e no detalhe.
- Modify: `frontend/src/app/shared/rma-detail-modal/rma-detail-modal.component.{ts,html,css}`. A linha 198 recebe os mesmos dois fatos. A seção Histórico ganha `<app-rma-stage-times>` e o item `dueDate` na timeline. Há uma nova `@Output() rmaUpdated = new EventEmitter<RmaResponse>()`. `kanban.component.html:299-308` liga `(rmaUpdated)`, que substitui o item em `rmasSignal`.
- Test: `rma-due-date-dialog.component.spec.ts`, `rmas.component.detail.spec.ts`, `rma-detail-modal.component.spec.ts` e `rma-detail.spec.ts`.

**Interfaces:**
- Consumes: as Tasks 8 e 9.
- Produces: `<app-rma-due-date-dialog [rma]="rma" (saved)="…" (closed)="…" />`.

- [ ] **Step 1: Write the failing specs.**
  - Diálogo: "opens with the current due date and entry date as minimum", "sends dueDate when a date is chosen", "sends clearDueDate when the field is cleared", "shows the server error inside the modal and keeps it open", "Cancelar is the first button and closes without a request" e "traps focus with appModalFocus".
  - Detalhes, nos dois: "shows Sem data limite when there is none", "shows the date and Atrasado há 2 dias", "shows Alterar only with rma.editar", "shows há 2 d 4 h in Nesta etapa and Encerrado em for closed RMAs", "lists the time of each previous stage in Histórico" e "shows due date changes with previous value and author". Nenhum texto contém "SLA".
- [ ] **Step 2: Run** `... --include src/app/shared/rma-due-date-dialog --include src/app/pages/rmas --include src/app/shared/rma-detail-modal --include src/app/core/utils/rma-detail.spec.ts`. Expected: FAIL.
- [ ] **Step 3: Implement.** O diálogo tem título "Data limite", `app-date-picker` com `[allowClear]="true"` e `[minDate]="rma.entryDate"`, Cancelar à esquerda e Salvar (`button-primary`). Mostra "Salvando..." enquanto `busy`. O fallback de erro é `extractHttpErrorMessage(error, 'Não foi possível salvar a data limite.')`.
- [ ] **Step 4: Run** a suíte completa e o build. Expected: PASS.
- [ ] **Step 5: Commit**

```bash
git add frontend/src/app/shared/rma-due-date-dialog frontend/src/app/core/services/rma.service.ts frontend/src/app/core/utils/rma-detail.ts frontend/src/app/core/utils/rma-detail.spec.ts frontend/src/app/pages/rmas frontend/src/app/shared/rma-detail-modal frontend/src/app/pages/kanban/kanban.component.html frontend/src/app/pages/kanban/kanban.component.ts
git commit -m "feat(prazo): data limite e tempo por etapa nos detalhes do RMA"
```

### Task 12: Data limite na abertura do RMA

**Files:**
- Modify: `frontend/src/app/pages/rmas/rmas.component.ts`. Em `createForm` (linha 579), `dueDate: ['']`. O payload (perto da linha 794) leva `dueDate: normalizeText(raw.dueDate)`. O reset (perto da linha 990) volta a `dueDate: ''`. `dateErrors()` ganha `dueDate: 'A data limite não pode ser anterior à entrada.'` quando `dueDate && dueDate < entryDate`.
- Modify: `frontend/src/app/pages/rmas/rmas.component.html`. Depois do bloco "Entrada" (linhas 516–522) entra um `field-group col-2` com `<label>Data limite</label>` e `<app-date-picker formControlName="dueDate" ariaLabel="Data limite" [allowClear]="true" [minDate]="createForm.controls.entryDate.value" …>`, com o erro em `#dueDate-error`.
- Test: `frontend/src/app/pages/rmas/rmas.component.create.spec.ts`

- [ ] **Step 1: Write the failing specs:** "creates without due date sending dueDate null", "sends the chosen due date", "blocks submit and shows the error when the due date is before entry" e "clears the due date after a successful create".
- [ ] **Step 2: Run** `... --include src/app/pages/rmas/rmas.component.create.spec.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** o que está em Files.
- [ ] **Step 4: Run** a suíte completa e o build. Expected: PASS.
- [ ] **Step 5: Commit**

```bash
git add frontend/src/app/pages/rmas/rmas.component.ts frontend/src/app/pages/rmas/rmas.component.html frontend/src/app/pages/rmas/rmas.component.create.spec.ts
git commit -m "feat(prazo): campo opcional de data limite na abertura do RMA"
```

### Task 13: Relatório "Tempo por etapa" e dashboard

**Files:**
- Modify: `frontend/src/app/pages/reports/reports.component.ts`. `activeRmas` filtra por `!CLOSED_RMA_STATUSES.includes(rma.status)`. `aging` usa `currentStagePeriod(rma).durationSeconds`. `duration()` passa a delegar para `formatDuration`.
- Modify: `frontend/src/app/pages/reports/reports.component.html:131-132`, que usa `currentStagePeriod(rma).enteredAt` e `durationSeconds`.
- Modify: `frontend/src/app/pages/dashboard/dashboard.component.{ts,html}`. `DashboardIndicator` ganha `tone: 'brand' | 'sky' | 'danger' | 'success' | 'violet'`, e o card de cadastros ganha a classe `dashboard-summary__item--catalog`. As regras `nth-child` saem e entram `[data-tone]`. O indicador novo, em segundo lugar, é `{ label: 'Atrasados', value: N, detail: '· M perto do limite', icon: 'clock' (ou o ícone de relógio que exista em IconName), tone: 'danger' }`, calculado com `deadlineStatus(rma, businessToday(Date.now()))` sobre os RMAs não encerrados.
- Test: `reports.component.spec.ts`, `reports.component.compositions.spec.ts`, `reports.component.frame.spec.ts`, `dashboard.component.spec.ts` e `dashboard.component.states.spec.ts`.

- [ ] **Step 1: Write and adjust the specs:** "computes average and maximum per stage from the current stage period", "excludes closed RMAs from the active metrics", "formats durations as 2 d 4 h", "counts Atrasados and Perto do limite among open RMAs only" e "keeps the catalog card style regardless of position". Troque as fixtures `sla:` desses specs por `stagePeriods`/`deadline`.
- [ ] **Step 2: Run** `... --include src/app/pages/reports --include src/app/pages/dashboard`. Expected: FAIL.
- [ ] **Step 3: Implement** o que está em Files. Confira em `shared/icon/icon.component.ts` qual `IconName` de relógio existe.
- [ ] **Step 4: Run** a suíte completa e o build. Expected: PASS.
- [ ] **Step 5: Commit**

```bash
git add frontend/src/app/pages/reports frontend/src/app/pages/dashboard
git commit -m "feat(prazo): relatório de tempo por etapa e indicador de atrasados no dashboard"
```

### Task 14: Notificações e limpeza do SLA no frontend

**Files:**
- Modify: `frontend/src/app/core/utils/notification-ui.ts:8-9`, onde os dois rótulos viram `'Prazo de etapa (descontinuado)'`. Também `notification-ui.spec.ts`.
- Modify: `frontend/src/app/pages/notifications/notifications.component.html:70`, com "Alertas sobre RMAs atribuídos e novos itens aparecem aqui."
- Modify: `notifications.component.rules.spec.ts`, `notifications.component.preferences.spec.ts`, `notifications.component.inbox.spec.ts`, `notifications.component.spec.ts` e `core/services/notification.service.spec.ts`. As fixtures de regra e preferência trocam `SLA_*` por `RMA_CREATED`/`RMA_ASSIGNED`. A caixa de entrada mantém um item `SLA_OVERDUE` legado.
- Rename: `core/services/sla-clock.service.ts` vira `core/services/clock.service.ts` (classe `ClockService`), e todos os `inject(SlaClockService)` mudam (kanban, rmas, notifications, rma-kanban-board, rma-detail-modal, rma-block-history e os componentes das Tasks 9 e 11).
- Modify: `frontend/src/app/shared/rma-block-history/rma-block-history.component.ts:19`, com "O período bloqueado continua contando no tempo da etapa." Também o spec dele.
- Modify: `frontend/src/app/core/models.ts`, que perde `RmaSlaStatus`, `RmaSlaResponse` e `RmaResponse.sla`. `rma-fixtures.ts` perde `sla`, e todos os specs que ainda montam `sla:` mudam (procure com `git grep -n "sla:" frontend/src`).
- Delete: `frontend/src/app/core/utils/rma-sla.ts`, `frontend/src/app/core/utils/rma-sla.spec.mjs` e `frontend/src/app/shared/rma-sla-badge/` (ts, html e css), além de `--sla-ok` em `styles.css`.
- Modify: `frontend/package.json` (tira `test:sla`) e `.github/workflows/frontend-ci.yml:40-41` (tira o passo "Run SLA tests").

- [ ] **Step 1: Write the failing spec** em `notification-ui.spec.ts`: "labels legacy stage alerts as descontinuado and never as vencido".
- [ ] **Step 2: Run** `... --include src/app/core/utils/notification-ui.spec.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** as remoções e trocas listadas em Files.
- [ ] **Step 4: Verify.** A suíte completa e o build passam. `git grep -n -E "\bsla\b|Sla[A-Z]|SLA" frontend/src .github` só devolve `SLA_WARNING`/`SLA_OVERDUE` em `models.ts` (union `NotificationEventType`), `notification-ui.ts` e as fixtures legadas da caixa de entrada. `git grep -n -i "vencid" frontend/src` não devolve nada.
- [ ] **Step 5: Commit** (`git add` dos alterados e `git add -A` dos caminhos apagados ou renomeados)

```bash
git commit -m "refactor(prazo): remove o SLA da interface e renomeia o relógio compartilhado"
```

### Task 15: Configuração, README e conferência final

**Files:**
- Modify: `README.md`.
  - Linha 49: troque "prazos de SLA" por "entradas nas etapas".
  - Linha 86: o "Aging por etapa" vira "Tempo por etapa", com a regra de períodos e notas que não reiniciam, sem citar SLA.
  - Linha 97: "O tempo da etapa continua correndo".
  - Linhas 269–278: uma suíte só, sem `test:sla`.
  - Linhas 291–306: acrescente `DEADLINE_WARNING_DAYS`.
  - A seção "## SLA do Kanban (NAV-10)" (linhas 542–586) vira "## Tempo por etapa e data limite", com a regra de períodos, a tabela de situações da spec §1, a janela `navitas.deadline.warning-days`/`DEADLINE_WARNING_DAYS` (0–90, padrão 7), quem preenche e quem edita (`rma.abrir`/`rma.editar`), o histórico, o filtro "Prazo" e as visualizações, a nota de que não há notificação, o destino das regras `SLA_*` (V11) e o rollback da spec §6.
- Modify: `frontend/README.md:41-48`, sem a suíte de SLA.
- Modify: `.env.example` e `.env.prod.example`, com `DEADLINE_WARNING_DAYS=7` depois de `SESSION_TIMEOUT`. `compose.yaml` e `compose.prod.yaml` recebem `DEADLINE_WARNING_DAYS: ${DEADLINE_WARNING_DAYS:-7}` no `environment` do backend, depois de `SESSION_TIMEOUT`.
- Nenhum teste novo: esta tarefa é documentação e conferência.

- [ ] **Step 1: Verify there is no leftover config.** `git grep -n -E "SLA_|navitas\.sla|sla-scan|SLA_WARNING_PERCENT" -- README.md frontend/README.md .env.example .env.prod.example compose.yaml compose.prod.yaml backend/src/main/resources` só devolve a menção histórica ao destino das regras `SLA_*` no README.
- [ ] **Step 2: Run** `mvn -B -ntp -f backend/pom.xml verify`, a suíte completa do frontend e `npm --prefix frontend run build`. Expected: tudo PASS e build sem avisos novos. Anote o número de casos de `PermissionEquivalenceIntegrationTest` no relatório do surefire: 423.
- [ ] **Step 3: Manual MySQL 8 check** num projeto isolado, sem tocar nas stacks 3306/3307:

```bash
docker run -d --name navitas-mig -p 3317:3306 -e MYSQL_ROOT_PASSWORD=mig -e MYSQL_DATABASE=navitas_mig mysql:8
# 1) checkout da main atual (antes da V11) e migração até V10 com dados: suba o backend com DB_URL=jdbc:mysql://127.0.0.1:3317/navitas_mig ...,
#    crie um RMA, silencie SLA_WARNING para um usuário e insira uma notificação SLA_OVERDUE.
# 2) volte para o branch e suba o backend contra a mesma base: o Flyway aplica a V11.
docker exec navitas-mig mysql -uroot -pmig navitas_mig -e "SELECT version, success FROM flyway_schema_history; SHOW COLUMNS FROM rmas LIKE 'due_date'; SHOW CREATE TABLE kanban_views; SELECT event_type FROM notification_rules; SELECT event_type FROM notification_mutes; SELECT event_type FROM notifications;"
# esperado: V11 success=1; due_date DATE YES; CHECK ck_kanban_views_deadline; regras só RMA_CREATED e RMA_ASSIGNED; silenciamento SLA_* apagado; notificação SLA_OVERDUE presente.
# 3) aplique o rollback da spec §6 numa cópia (mysqldump) e confirme que o backend antigo sobe.
docker rm -f navitas-mig
```

- [ ] **Step 4: Commit**

```bash
git add README.md frontend/README.md .env.example .env.prod.example compose.yaml compose.prod.yaml
git commit -m "docs(prazo): README e configuração da data limite no lugar do SLA por etapa"
```

## Critério de aceite

- Nenhum "SLA" na interface, e nenhum "Vencido(s)" em texto novo.
- Cards e detalhes mostram "há X nesta etapa" para RMAs abertos. O Histórico lista o tempo de cada etapa anterior e as mudanças da data limite, com autor e valor anterior.
- A data limite é opcional na abertura (`rma.abrir`) e editável no detalhe (`rma.editar`). Sem a permissão, o botão "Alterar" não aparece e a API responde 403.
- O Kanban tem o filtro "Prazo" com as cinco opções, salvo nas visualizações. O card mostra "Atrasado há N dias" ou "Vence em N dias" só nesses casos.
- O dashboard conta "Atrasados" e "perto do limite". O relatório "Tempo por etapa" mostra média e máximo como antes.
- Nenhum alerta de SLA é gerado. Regras e preferências não listam `SLA_*`, e alertas antigos continuam na caixa de entrada.
- `mvn -B -ntp -f backend/pom.xml verify`, a suíte do frontend e o build passam. A matriz de permissões continua com 423 casos. A conferência manual da V11 em MySQL 8 (`navitas-mig`, 3317) foi feita.
