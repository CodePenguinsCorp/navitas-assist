# Tempo por etapa e data limite do atendimento — design

> **Nota (13 nov 2026): migrações zeradas.** As migrações V1–V10 viraram uma única `V1__baseline.sql` (não havia dados em produção). A migração do prazo passa a ser **V2** (`V2__rma_due_date_and_remove_stage_sla.sql`), não V11, e não há V12 de colunas legadas (elas já não existem). Não há dados a preservar: os trechos de legado/descontinuado de `SLA_*` (constantes mantidas com `supported = false`, rótulo "Prazo de etapa (descontinuado)", teste de notificação SLA antiga) podem ser apagados de vez na implementação do prazo.

Data: 13 nov 2026. Substitui o SLA por etapa da NAV-10.

## 1. Objetivo e decisões

O documento do cliente cita o tema uma vez, em "Tempo médio por etapa (SLA interno)", e o dashboard pede "RMAs em aberto, atrasados, por etapa". Os prazos por etapa (24/48/72/120 h, `SLA_*_MINUTES`, situações `NORMAL/WARNING/OVERDUE/CLOSED`, filtro e selo de SLA no Kanban, alertas `SLA_WARNING`/`SLA_OVERDUE`) foram uma interpretação nossa. O dono do produto decidiu (13 nov 2026) retirar os prazos por etapa e mostrar duas coisas:

1. **Quanto tempo o RMA está em cada etapa.** Cards e detalhe mostram "há 2 d 4 h nesta etapa". O histórico mostra o tempo de cada etapa anterior. O relatório "Tempo por etapa" continua.
2. **Uma data limite do atendimento inteiro.** É opcional, só data (sem hora). Quem abre o RMA pode preencher. Depois, quem tem `rma.editar` pode alterar ou remover. Cada mudança fica no histórico com autor, instante, valor anterior e valor novo. Um RMA sem data limite não tem prazo.

Efeito da data limite: **só destaca e filtra, sem notificar.**

| Situação | Código | Regra (hoje = data civil em `America/Sao_Paulo`) |
| --- | --- | --- |
| Atrasado | `OVERDUE` | RMA não encerrado e `hoje > dataLimite` |
| Perto do limite | `DUE_SOON` | RMA não encerrado e `dataLimite - N <= hoje <= dataLimite` (N = `navitas.deadline.warning-days`, padrão 7) |
| No prazo | `ON_TRACK` | RMA não encerrado e `hoje < dataLimite - N` |
| Sem data limite | `NO_DUE_DATE` | RMA não encerrado e sem data limite |
| Encerrado | `CLOSED` | Status `COMPLETED`, `RETURNED` ou `IRREPARABLE`, com ou sem data limite. Nunca é atrasado. |

Termos de interface: "Atrasado(s)", "Perto do limite", "No prazo", "Sem data limite", "Data limite", "Prazo" (rótulo do filtro). **"Vencido(s)" é proibido** em qualquer texto novo. "SLA" some da interface.

Conferência de permissão: `PUT /api/rmas/{id}` já exige `rma.editar` (`SecurityConfig.java:112`) e `POST /api/rmas` exige `rma.abrir` (`SecurityConfig.java:101`). O rótulo de `rma.editar` no catálogo é "Alterar dados gerais e prioridade", e a data limite é dado geral. **Não há endpoint novo nem permissão nova.** A matriz `PermissionEquivalenceIntegrationTest` continua com os mesmos casos.

## 2. Modelo de dados

Migração `V11__rma_due_date_and_remove_stage_sla.sql` (as atuais são V1, V4, V6–V10):

- `rmas.due_date DATE NULL`. Sem índice: o Kanban, o dashboard e o relatório filtram na memória o que já carregam.
- Tabela `rma_due_date_history`, no molde de `rma_assignment_history`:
  `id BIGINT AUTO_INCREMENT PK`, `rma_id BIGINT NOT NULL FK rmas(id)`, `previous_due_date DATE NULL`, `new_due_date DATE NULL`, `changed_by VARCHAR(120) NOT NULL`, `changed_at DATETIME(6) NOT NULL`, e índice `idx_rma_due_date_history_rma_id`.
- `kanban_views.deadline_status VARCHAR(20) NULL`, com `ck_kanban_views_deadline CHECK (deadline_status IS NULL OR deadline_status IN ('OVERDUE','DUE_SOON','ON_TRACK','NO_DUE_DATE'))`.
- Limpeza das regras de SLA (seção 6).

Uma tabela própria guarda o histórico da data limite, em vez de uma nota em `rma_status_history` como a prioridade faz hoje. Motivos: o valor anterior fica estruturado, a tela mostra "Data limite 20/11/2026 → 25/11/2026" em vez de "Status registrado: …", e o cálculo de tempo por etapa não precisa ignorar notas desse tipo.

Entidades: `RmaRecord.dueDate` (`@Column(name = "due_date")`) e `RmaRecord.dueDateHistory` (`@OneToMany(mappedBy = "rma", cascade = ALL, orphanRemoval = true) @OrderBy("changedAt DESC")`, com `addDueDateHistory`). Também a nova `RmaDueDateHistory` e `KanbanView.deadline` (`@Enumerated(STRING) @Column(name = "deadline_status", length = 20)`, tipo `RmaDeadlineStatus`).

## 3. Cálculo

### 3.1 Tempo por etapa (`RmaStageTimeService.periods(RmaRecord, Instant now)`)

- Ordena `statusHistory` por `changedAt` crescente e, no empate, por `id` crescente (nulos por último). Registros sem `changedAt` são ignorados. A ordem é a mesma de `RmaSlaService.stageEntry`, só que invertida.
- Junta registros **consecutivos** com o mesmo status num período. Notas e trocas de prioridade não reiniciam a etapa. Sair e voltar abre um período novo.
- Cada período tem `status`, `enteredAt` (primeiro registro do bloco), `leftAt` (início do bloco seguinte, ou `null` no atual) e `durationSeconds = max(0, (leftAt ?? now) - enteredAt)`.
- Sem histórico, há um período único com o status atual, iniciado em `createdAt`. Se `createdAt` faltar, usa `entryDate` à meia-noite de `America/Sao_Paulo`, e se também faltar, `now`. É o mesmo fallback do SLA de hoje.
- Se o último bloco não for do status atual (legado inconsistente), acrescenta um período atual iniciado no `changedAt` do último registro.
- O período atual de um RMA encerrado continua contando: é o tempo desde o encerramento. As telas não o exibem como "nesta etapa" (seção 5).

### 3.2 Situação da data limite (`RmaDeadlineService`)

- `static LocalDate businessDate(Instant now)` é `LocalDate.ofInstant(now, America/Sao_Paulo)`.
- `RmaDeadlineResponse evaluate(RmaRecord rma, LocalDate today)` devolve `status` (tabela da seção 1), `dueSoonFrom = dueDate - warningDays` (nulo sem data) e `daysUntilDue = dueDate - today` em dias civis (negativo quando atrasado, nulo sem data ou encerrado).
- O frontend recalcula a situação a cada tique do relógio de 30 s. Usa `dueDate`, `dueSoonFrom`, o status do RMA e o "hoje" de São Paulo, sem saber `warningDays`. Assim a virada da meia-noite não exige recarga.

### 3.3 Configuração

`RmaDeadlineProperties` (`@ConfigurationProperties("navitas.deadline")`, `@Validated`) tem `@Min(0) @Max(90) int warningDays = 7`. Com 0, só o próprio dia vira "Perto do limite". No `application.yml` fica `navitas.deadline.warning-days: ${DEADLINE_WARNING_DAYS:7}`. Valor inválido impede a inicialização.

## 4. Backend

### 4.1 API de RMA

- `CreateRmaRequest` ganha `LocalDate dueDate` (opcional).
- `UpdateRmaRequest` ganha `LocalDate dueDate` e `Boolean clearDueDate`. Segue a semântica parcial atual (nulo = não muda). `clearDueDate = true` remove a data. Mandar os dois juntos dá 400: "Provide a due date or clear it, not both."
- Validação em `RmaService.validateDates`: se houver data limite, ela não pode ser anterior à data de entrada ("Due date cannot be before entry date."). A regra vale também quando a edição muda só a entrada. Datas no passado são aceitas desde que não sejam anteriores à entrada, porque um RMA antigo pode já estar atrasado.
- Histórico: criar com data grava `(null → data)`. Alterar grava `(anterior → nova)` só quando o valor muda. Remover grava `(anterior → null)`. O autor é `currentUsername()` e o instante é `Instant.now()`.
- `RmaResponse` **perde `sla`** e ganha:
  - `LocalDate dueDate`;
  - `RmaDeadlineResponse deadline(RmaDeadlineStatus status, LocalDate dueSoonFrom, Long daysUntilDue)`;
  - `List<RmaStagePeriodResponse> stagePeriods(RmaStatus status, Instant enteredAt, Instant leftAt, long durationSeconds)`, em ordem cronológica, nunca vazia. O último item é a etapa atual;
  - `List<RmaDueDateHistoryResponse> dueDateHistory(LocalDate previousDueDate, LocalDate newDueDate, String changedBy, Instant changedAt)`, mais recente primeiro.
- A assinatura passa a ser `RmaResponse.from(RmaRecord, List<RmaStagePeriodResponse>, RmaDeadlineResponse)`. `RmaService.toResponse` e `RmaReportService.search` montam os dois com o mesmo `now`. O relatório usa `generatedAt`.
- `RmaRecordRepository.fetchDueDateHistory(List<RmaRecord>)` (left join fetch) entra no relatório ao lado dos outros `fetch*`, para manter o número fixo de consultas.

### 4.2 Visualizações salvas

`KanbanViewFilters` ganha `RmaDeadlineStatus deadline` (nulo = todos). `KanbanViewService.apply` grava o valor, e `validate` recusa `CLOSED` com 400 ("Deadline filter must be OVERDUE, DUE_SOON, ON_TRACK or NO_DUE_DATE."). Clientes antigos que não mandam o campo continuam funcionando, porque ele chega nulo.

**Migração das visualizações:** nenhuma visualização salva guarda SLA hoje. `toPersistedFilters` não envia o campo, `fromPersistedFilters` sempre devolve `sla: 'all'`, e `kanban_views` não tem coluna de SLA. Não há o que converter, e as visualizações existentes abrem com "Prazo: Todos". O filtro novo passa a ser salvo como os demais filtros avançados.

### 4.3 Remoções no backend

- `RmaSlaService`, `RmaSlaProperties`, `RmaSlaStatus`, `RmaSlaResponse`.
- `SlaNotificationScanner`, `SlaNotificationScheduler` e `NotificationSchedulingConfig`. Esta última só existia para ligar `@EnableScheduling` a pedido do scan, e não há outro `@Scheduled` no código.
- `NotificationProperties.SlaScan`.
- Os `case SLA_*` e a dependência de `RmaSlaService` em `NotificationContentFactory`.
- `navitas.sla.*` e `navitas.notifications.sla-scan.*` em `application.yml` e `application-test.yml`. Variáveis antigas que sobrarem no ambiente (`SLA_*`, `NOTIFICATIONS_SLA_SCAN_*`) ficam sem efeito e não quebram a inicialização.
- Testes: `RmaSlaTest`, `RmaSlaPropertiesTest`, `SlaNotificationSchedulerTest` e `NotificationIntegrationTest.slaScanAlertsOverdueRmasOncePerStage`.

`NotificationEventType` **mantém** `SLA_WARNING` e `SLA_OVERDUE`, agora `supported = false` e com Javadoc de legado. Motivo: `notifications` e `notification_events` guardam o tipo como texto (`@Enumerated(STRING)`). Apagar as constantes faria o Hibernate falhar ao ler a caixa de entrada de quem já recebeu alertas, e apagar essas linhas seria perda de dados do usuário. Nenhum código produz esses tipos, nenhuma regra os referencia (seção 6), e `NotificationDispatcher` já descarta tipos não suportados (`NotificationDispatcher.java:55`).

## 5. Frontend

### 5.1 Utilitários (sem Angular)

- `core/utils/duration.ts`: `formatDuration(seconds)`. Abaixo de 60 s, "menos de 1 min". Abaixo de 1 h, "N min". Abaixo de 1 d, "N h" ou "N h M min". A partir de 1 d, "N d" ou "N d H h". Substitui `slaDuration` (também nos impedimentos: "Bloqueado há 1 h 1 min") e o `duration()` local de `reports.component.ts`.
- `core/utils/rma-stage.ts`: `currentStagePeriod(rma)`, `stageElapsedSeconds(period, now)` e `stageTimeLabel(rma, now)`. O rótulo é "há 2 d 4 h nesta etapa", ou `null` quando o RMA está encerrado.
- `core/utils/rma-deadline.ts`: `DeadlineStatus`, `DeadlineFilterValue = 'all' | 'OVERDUE' | 'DUE_SOON' | 'ON_TRACK' | 'NO_DUE_DATE'`, `DEADLINE_LABELS`, `DEADLINE_FILTER_OPTIONS`, `deadlineStatus(rma, today)`, `deadlineDetailLabel(rma, today)` e `deadlineCardLabel(rma, today)`. Os textos são "Atrasado há 1 dia", "Atrasado há N dias", "Vence hoje", "Vence em 1 dia", "Vence em N dias". No card, só para `OVERDUE` e `DUE_SOON`. `today` vem de `businessDateInputValue(new Date(clock.now()))`.
- `SlaClockService` passa a se chamar `ClockService` (`core/services/clock.service.ts`), com o mesmo comportamento de 30 s.

### 5.2 Componentes

- `shared/rma-deadline-chip`: um chip de texto e cor (`data-deadline`), com tokens `--deadline-overdue` e `--deadline-soon` (renomeiam `--sla-overdue` e `--sla-warning` em `styles.css`; `--sla-ok` sai). Substitui `rma-sla-badge`, que é removido.
- `shared/rma-due-date-dialog`: modal estreito (`modal-overlay`, `modal-panel--narrow`, `appModalFocus`), título "Data limite", `app-date-picker` com `allowClear` e `minDate = entryDate`. Os botões são **Cancelar** (à esquerda) e **Salvar**. Erro aparece em `alert-banner--error` dentro do modal, com fallback "Não foi possível salvar a data limite.". Envia `{ dueDate }` ou `{ clearDueDate: true }` por `RmaService.updateDueDate(id, dueDate | null)` (PUT `/api/rmas/{id}`) e emite `saved(RmaResponse)`. O pop-up global de carregamento vem do interceptor existente.
- `shared/rma-stage-times`: lista compacta "Tempo por etapa", do período mais antigo para o atual. Cada linha mostra o rótulo do status e a duração, e a atual traz "(atual)". Encerrado mostra "Encerrado em dd/mm/aaaa hh:mm" na última linha. Os dois detalhes usam a lista no topo da seção Histórico.

### 5.3 Telas

- **Kanban** (`pages/kanban`): o filtro "SLA" dá lugar a "Prazo" (`formControlName="deadline"`, `ariaLabel="Filtrar Kanban por prazo"`) na linha rápida, com as opções "Todos", "Atrasados", "Perto do limite", "No prazo" e "Sem data limite". Encerrados só aparecem em "Todos". O valor é salvo nas visualizações (`toPersistedFilters`/`fromPersistedFilters`) e conta em `countActiveFilters`.
- **Card** (`rma-kanban-board`): sai o selo de SLA. Entra o chip de prazo só quando a situação é `OVERDUE` ou `DUE_SOON`, e uma linha discreta "há 2 d 4 h nesta etapa" para RMAs não encerrados. O card continua enxuto, sem falha nem situação saudável.
- **Detalhes** (lista de RMAs, `rmas.component.html:212`, e modal do Kanban, `rma-detail-modal.component.html:198`): o fato "SLA" vira dois fatos. "Data limite" mostra a data e o chip de situação, ou "Sem data limite" com `is-empty`. Para quem tem `rma.editar`, há o botão "Alterar" (`button-secondary`), que abre o diálogo. "Nesta etapa" mostra "há 2 d 4 h", ou "Encerrado em …". O Histórico passa a incluir entradas `kind: 'dueDate'` ("Data limite 20/11/2026 → 25/11/2026", "Data limite definida: …", "Data limite removida") e a lista de tempo por etapa.
- **Abertura de RMA** (`rmas.component`): campo opcional "Data limite" (`app-date-picker`, `allowClear`, `minDate` = entrada) ao lado de "Entrada". O erro local "A data limite não pode ser anterior à entrada." aparece em `dateErrors().dueDate`. O valor vai em `CreateRmaRequest.dueDate`.
- **Relatório "Tempo por etapa"**: o comportamento não muda (etapa atual dos RMAs não encerrados, média e máximo por etapa). A fonte troca `rma.sla.startedAt/elapsedSeconds` pelo período atual (`enteredAt`, `durationSeconds`, que é uma fotografia em `generatedAt`), e o filtro de ativos passa a usar `CLOSED_RMA_STATUSES`. A legenda continua: "Tempo corrido na etapa…".
- **Dashboard**: o indicador novo "Atrasados" fica em segundo lugar, com valor N e detalhe "· M perto do limite", contando RMAs não encerrados de `listBoard()`. As cores e o estilo do card de cadastros deixam de depender de `nth-child` e passam a usar `data-tone` e um modificador `dashboard-summary__item--catalog`, para que o card novo não desloque os tons.
- **Notificações**: o texto vazio vira "Alertas sobre RMAs atribuídos e novos itens aparecem aqui.". O rótulo de `SLA_WARNING`/`SLA_OVERDUE` em `notification-ui.ts` vira "Prazo de etapa (descontinuado)", só para itens antigos da caixa. Regras e preferências deixam de listá-los porque as linhas somem do banco.
- Removidos: `rma-sla-badge/*`, `core/utils/rma-sla.ts`, `rma-sla.spec.mjs`, o script `test:sla` e o passo "Run SLA tests" de `.github/workflows/frontend-ci.yml`. Os testes dos utilitários novos rodam no Vitest com a suíte normal.
- A dica do impedimento "O período bloqueado continua contando no SLA." vira "O período bloqueado continua contando no tempo da etapa.".
- Tudo funciona a 320 px: os fatos novos quebram linha, e o chip usa `overflow-wrap`.

## 6. Migração e rollback

`V11`, em SQL portável (sem `MODIFY`, sem funções do MySQL):

```sql
ALTER TABLE rmas ADD COLUMN due_date DATE NULL;
CREATE TABLE rma_due_date_history (...);              -- seção 2
CREATE INDEX idx_rma_due_date_history_rma_id ON rma_due_date_history (rma_id);
ALTER TABLE kanban_views ADD COLUMN deadline_status VARCHAR(20) NULL;
ALTER TABLE kanban_views ADD CONSTRAINT ck_kanban_views_deadline CHECK (...);
DELETE FROM notification_rule_recipient_profiles
    WHERE rule_id IN (SELECT id FROM notification_rules WHERE event_type IN ('SLA_WARNING', 'SLA_OVERDUE'));
DELETE FROM notification_mutes WHERE event_type IN ('SLA_WARNING', 'SLA_OVERDUE');
DELETE FROM notification_rules WHERE event_type IN ('SLA_WARNING', 'SLA_OVERDUE');
```

Decisão sobre os dados das regras de SLA:

- As regras `SLA_*` (configuração do administrador, com destinatários por perfil) e os silenciamentos `SLA_*` (preferência sobre um tipo que deixa de existir) são **apagados**. Não sobra nada para o usuário configurar, e mantê-los faria a tela de regras e a de preferências mostrarem um alerta que nunca dispara.
- As notificações já entregues (`notifications`) e os eventos (`notification_events`) **ficam**. A caixa de entrada é dado do usuário. O título e a mensagem estão gravados, e o tipo continua legível (seção 4.3).
- Sessões, perfis, permissões e extras não são tocados. A migração não mexe em `user_accounts`, `access_profiles` nem nas tabelas de permissão.

Numeração: V8–V10 citam uma "V11 opcional" que apaga colunas legadas de papel. Os comentários das migrações aplicadas não são editados (mudaria o checksum). Esta entrega ocupa a V11, e a remoção opcional das colunas legadas passa a ser **V12** quando for feita. O plano de permissões (`docs/superpowers/plans/2026-11-11-permissoes.md`, Task 20) recebe uma nota de uma linha. Usar V12 aqui deixaria uma V11 futura fora de ordem, que o Flyway recusa (`outOfOrder` desligado).

Rollback (o Flyway Community não tem undo): o caminho preferido é restaurar o backup feito antes da implantação. Sem backup, e antes de qualquer gravação de data limite que importe:

```sql
ALTER TABLE kanban_views DROP CONSTRAINT ck_kanban_views_deadline;  -- MySQL 8.0.19+; PostgreSQL igual
ALTER TABLE kanban_views DROP COLUMN deadline_status;
DROP TABLE rma_due_date_history;
ALTER TABLE rmas DROP COLUMN due_date;
-- regras SLA_*: reinserir com o INSERT da V6 e os destinatários com os INSERT ... SELECT da V9 restritos a SLA_*
DELETE FROM flyway_schema_history WHERE version = '11';
```

Esse rollback perde as datas limite, o histórico delas e os silenciamentos `SLA_*`. Ele só faz sentido junto com a volta do código anterior. Fica documentado no README.

Verificação: H2 nos testes (`DeadlineMigrationTest`, `DatabaseMigrationTest`) e conferência manual em MySQL 8 num projeto Docker isolado `navitas-mig` na porta 3317 (seção 8).

## 7. Testes

- **Backend, unidade:** `RmaStageTimeServiceTest` (blocos, notas que não reiniciam, reentrada, empate por id, legado sem histórico, legado inconsistente, futuro sem duração negativa, encerrado) e `RmaDeadlineServiceTest` (fronteiras 8/7/0/−1 dias, janela 0, encerrados, sem data, `businessDate` em 02:59:59Z e 03:00:00Z). Também `RmaDeadlinePropertiesTest` (padrão 7, recusa −1 e 91).
- **Backend, integração:** em `RmaControllerIntegrationTest`, criação com e sem data, edição, remoção, conflito `dueDate` + `clearDueDate`, data anterior à entrada, histórico com autor e valor anterior, `stagePeriods` e `deadline` na resposta, e 403 com `rma.ver` sem `rma.editar`. `RmaReportIntegrationTest` ganha `stagePeriods` no lugar de `sla`. `RmaBlockIntegrationTest` confirma que bloquear não abre período. `KanbanViewControllerIntegrationTest` cobre persistir, ler e recusar `CLOSED` no filtro de prazo, e `EnumPersistenceIntegrationTest` cobre `deadline_status`. `NotificationIntegrationTest` cobre que um item legado `SLA_OVERDUE` continua listado e que regras e preferências não trazem `SLA_*`.
- **Migração:** `DeadlineMigrationTest` (H2) cobre a migração até 10 com dados (regra `SLA_WARNING` com destinatário, silenciamento `SLA_*`, notificação `SLA_OVERDUE`, visualização), depois até 11, conferindo colunas, CHECK, regras e silenciamentos apagados, notificação preservada e outras regras intactas. `DatabaseMigrationTest` passa de 7 para 8 migrações e de 4 para 2 regras.
- **Permissões:** `PermissionEquivalenceIntegrationTest` continua verde com o mesmo número de casos (423). Nenhuma linha entra ou sai.
- **Frontend:** `duration.spec.ts`, `rma-stage.spec.ts` e `rma-deadline.spec.ts` (fronteiras e "hoje" em São Paulo às 23:59 e 00:00 locais, com `Date` em UTC). Componentes: chip, diálogo, tempos por etapa, card do Kanban, filtro "Prazo" e visualizações salvas no Kanban, os dois detalhes, o formulário de abertura, o relatório, o dashboard e as notificações.

## 8. Fora de escopo

- Notificar sobre data limite (decisão do dono).
- Calcular a data limite automaticamente (por prioridade ou cliente).
- Média histórica das etapas já concluídas no relatório. Os dados existem em `stagePeriods`, mas o relatório continua mostrando a etapa atual. Ver risco R5.
- Pausar o tempo da etapa durante impedimentos.
- Filtro de prazo no servidor (`GET /api/rmas?deadline=`). A lista paginada de RMAs não ganha filtro novo.
- Apagar as notificações legadas `SLA_*` (pode virar uma migração futura com prazo de retenção).

## 9. Riscos

- **R1. Fuso.** A data limite é uma data civil, e "hoje" é sempre o de São Paulo, no servidor (`businessDate`) e no navegador (`businessDateInputValue`). O teste cobre a virada às 03:00Z.
- **R2. Ordem de implantação.** O backend tira `sla` da resposta. Um frontend antigo com um backend novo quebraria o Kanban, então os dois precisam ser implantados juntos (como na stack Docker do repositório).
- **R3. N+1.** `dueDateHistory` é mais uma coleção carregada sob demanda no quadro, no mesmo padrão de `assignmentHistory`. O relatório usa fetch em lote. O quadro já tinha esse custo e não piora em ordem de grandeza.
- **R4. Constantes legadas no enum.** Alguém pode reativar `SLA_*` por engano. O Javadoc e `supported = false` deixam isso claro, e o teste confirma que nenhuma regra os referencia.
- **R5. Relatório.** O cliente fala em "tempo médio por etapa". Mostrar só a etapa atual pode não ser o que ele espera, e a média histórica fica para uma decisão do dono.
- **R6. MySQL e CHECK.** `ADD CONSTRAINT ... CHECK` só é aplicado a partir do MySQL 8.0.16. A stack usa MySQL 8, e a conferência manual confirma.

## 10. Autorrevisão

- Todas as decisões do pedido têm seção: (1) §2, §4.1; (2) §1, §3.2; (3) §3.1, §5.3; (4) §4.3, §6; (5) §3.3, §4.3; (6) §4.2, §5.3; (7) §5; (8) §7.
- Nenhum endpoint novo. A data limite usa `POST /api/rmas` (`rma.abrir`) e `PUT /api/rmas/{id}` (`rma.editar`).
- "Vencido" não aparece em textos de interface. As únicas menções são esta regra e o histórico.
- As âncoras foram conferidas por grep: `SecurityConfig.java:101,112`, `NotificationDispatcher.java:55`, `kanban.component.ts:930-960` (o SLA não é salvo nas visualizações), `rmas.component.html:212`, `rma-detail-modal.component.html:198`, `V6__create_internal_notifications.sql` (seed das regras), `V9` (destinatários com `ON DELETE CASCADE`) e `DatabaseMigrationTest` (7 migrações, 4 regras).
- Decisões tomadas sem o dono, que ele deve rever: constantes legadas no enum em vez de apagar notificações, V11 aqui com a remoção das colunas legadas em V12, filtro de prazo salvo nas visualizações, encerrados só em "Todos", janela 0–90, formato único de duração (também nos impedimentos), dashboard com um card "Atrasados" (detalhe "perto do limite") e relatório sem média histórica.
