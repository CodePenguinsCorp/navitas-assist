# Componentes trocados e intervenções — desenho

**Objetivo:** atender ao §3.4 informado do PDF do cliente com componentes trocados, retrabalho e tempo efetivo de serviço estruturados, reutilizáveis pelo futuro laudo (projeto C). O PDF não foi disponibilizado nesta tarefa; o requisito considerado é o trecho fornecido pelo solicitante.

**Status:** proposta para validação do produto. As decisões abaixo são recomendações, não aprovações já obtidas.

## 1. Base real e limites de integração

- `backend/src/main/resources/db/migration/V1__baseline.sql`: `parts`, `part_reservations` e `part_movements` já controlam quantidade decimal, reserva, consumo e estorno. Não há controle de saldo por lote.
- `controller/RmaPartController.java`, `service/PartStockService.java`, `part/PartReservation*.java` e `part/RmaPartsResponse.java`: consumo integral de reserva `ACTIVE`; falta de saldo gera `PENDING`; cancelamento aceita `ACTIVE`/`PENDING`; estorno de consumo produz `REVERSED`. Movimentos são imutáveis; custos já vêm do estoque. Ordem de locks de alocação/consumo: RMA → peça → reserva.
- `frontend/src/app/shared/rma-parts-panel/*` usa signals, Reactive Forms, `app-custom-select`, mensagens e recarga por contexto. `core/services/part.service.ts` espelha as rotas existentes.
- `core/utils/rma-detail.ts` reúne status e atribuições em `rmaHistory`; há dois detalhes a manter equivalentes: `pages/rmas/*` e `shared/rma-detail-modal/*` (Kanban). `repairSummary`, `replacedPartsSummary` e `testSummary` são textos existentes, não listas estruturadas.
- `access/Permission.java` e `core/permissions.ts` têm 20 permissões. `SecurityConfig` é a autoridade dos endpoints; ocultar botões não protege a API. `PermissionEquivalenceIntegrationTest` exige matriz explícita e cobertura das rotas.

**Isolamento:** implementação futura em `V3__rma_replaced_components_and_interventions.sql`. Não editar V1 nem V2, `rmas` ou `rma_due_date_history`. O agente de prazos é dono da V2. Integrações inevitáveis em `models.ts`, detalhes e timeline devem ser feitas sobre a versão integrada dele, preservando os eventos de prazo. Tempo de serviço não é tempo corrido na etapa nem altera data limite. Esta entrega contém somente este documento.

## 2. Abordagem escolhida para a proposta

1. **Recomendada:** detalhes da troca na própria reserva; tabela separada somente para componentes externos; projeção comum na leitura. Evita duplicar peça, quantidade, status e consumo e mantém o fluxo atual.
2. Tabela única de trocas com reserva opcional: facilita a listagem, mas cria dois ciclos de vida e exige sincronização permanente entre troca e consumo.
3. Somente textos de reparo: barato, porém não fornece rastreabilidade nem contrato confiável para o laudo.

Uma reserva representa um componente e um lote. Dois lotes da mesma peça exigem duas reservas; não haverá consumo parcial nesta entrega.

## 3. Dados e invariantes

### 3.1 Componentes do estoque

Adicionar a `part_reservations`: `replacement_reason VARCHAR(1000)`, `component_batch VARCHAR(120)`, `applied_at DATETIME(6)`, `applied_by VARCHAR(120)`, `applied_part_code VARCHAR(60)` e `applied_part_name VARCHAR(120)`, todos inicialmente nulos.

- Motivo e lote descrevem o componente instalado, não o lote do equipamento recebido. Motivo obrigatório no novo consumo; lote opcional até decisão do produto, com indicação explícita de “Não informado”. `note` continua sendo observação da reserva, não substitui o motivo.
- No consumo, gravar motivo, lote, instante/autor e snapshots de código/nome na mesma transação do movimento. Os snapshots preservam a identificação para o laudo se o catálogo mudar; quantidade, unidade de custo e saldo continuam nas fontes existentes. Não criar uma segunda linha de consumo/troca.
- Componente aplicado = reserva `CONSUMED`. Reservas pendentes/ativas são intenções; canceladas/estornadas aparecem no histórico, não como peças efetivamente trocadas no laudo.
- Não inventar dados antigos: consumos anteriores à V3 continuam legíveis com `metadataComplete=false` e motivo/lote ausentes. Snapshots novos não são preenchidos retroativamente como se fossem históricos; na falta deles, retornar identificação atual com `identitySnapshot=false`.
- Correção de motivo/lote é permitida enquanto o RMA estiver aberto, com auditoria. Código, peça e quantidade consumidos são imutáveis: erro exige estorno existente e nova reserva/consumo. Correção cadastral não movimenta saldo.
- Estorno conserva todos os dados da aplicação original. A projeção deriva `REVERSED` da reserva; nunca apaga a troca nem restitui estoque uma segunda vez.

### 3.2 Componentes externos

Criar `rma_external_components`: `id BIGINT`, `rma_id` FK, `code VARCHAR(60)` opcional, `description VARCHAR(120)` obrigatório, `quantity DECIMAL(12,3)` positiva, `unit VARCHAR(20)` obrigatória (padrão de UI `un`), `component_batch VARCHAR(120)` opcional, `replacement_reason VARCHAR(1000)` obrigatório, `applied_at DATETIME(6)` e `applied_by VARCHAR(120)` definidos pelo servidor, `voided_at`, `voided_by`, `void_reason VARCHAR(1000)` e auditoria de `AuditableEntity`.

Sem `part_id`, reserva, movimento, custo estimado ou efeito nos totais existentes. UI oferece “Fora do estoque”; se o código informado corresponder ao catálogo, orientar o fluxo de reserva e recusar o cadastro externo, inclusive para peça inativa. Texto livre atende peça sem cadastro; não é atalho para saldo insuficiente. Correção auditada e anulação lógica; não excluir fisicamente.

### 3.3 Intervenções e tempo

Criar `rma_interventions`: `id`, `rma_id` FK, `type VARCHAR(40)`, `description VARCHAR(1000)`, `performed_on DATE`, `technician_id` FK para `user_accounts`, `technician_name VARCHAR(120)` snapshot, `time_mode VARCHAR(10)`, `hours DECIMAL(9,3)` ou `started_at`/`finished_at DATETIME(6)`, anulação lógica com motivo e campos de auditoria.

Lista fixa, espelhada em enum Java e union/map de rótulos TypeScript: `RESOLDERING` (Ressolda), `CLEANING` (Limpeza), `REPROGRAMMING` (Regravação), `FIRMWARE_UPDATE` (Atualização de firmware), `HARNESS_REPLACEMENT` (Troca de chicote), `OTHER` (Outra). Descrição obrigatória para todos; registrar versões anterior/nova de firmware na descrição nesta etapa.

- `HOURS`: horas > 0, até três casas, sem início/fim. `INTERVAL`: ambos os instantes obrigatórios, fim > início, sem horas informadas. Não aceitar ambos os modos ou ausência de duração.
- Persistir `Instant` para intervalos e exibir em `America/Sao_Paulo`. `performedOn` é a data civil do início nesse fuso no modo intervalo; no modo horas é obrigatória. Não permitir data/instantes futuros. Intervalos podem cruzar meia-noite.
- `durationSeconds`: intervalo exato em segundos; horas × 3600, arredondado uma vez com `HALF_UP`. Total = soma das intervenções não anuladas, nunca soma de horas com intervalo do mesmo registro. Proposta: não há cronômetro em andamento nem dedução automática de pausas; lançar sessões separadas.
- Técnico padrão é o usuário autenticado. Seleção de outro exige usuário ativo elegível a atribuição (`rma.atribuivel`), usando a consulta existente de atribuíveis. Autor da alteração vem sempre da autenticação, separado do técnico executante. Técnico histórico desativado permanece legível pelo snapshot.
- Não inferir intervenção a partir do consumo: trocar uma peça e lançar o trabalho são registros distintos. A descrição pode mencionar o componente sem repetir sua quantidade no total de peças.

V3 cria FKs sem cascata destrutiva, índices por `rma_id` e checks de quantidade, enum, modo de tempo e consistência da anulação. Aplicar validações equivalentes no serviço. SQL compatível com MySQL 8 e H2 dos testes. Campos novos nas reservas são anuláveis para compatibilidade; não impor `NOT NULL` global a consumos antigos.

## 4. Contrato da API

Manter controllers finos, records de request/response e regras transacionais nos serviços. Estender `RmaPartController`/`PartStockService`; criar `RmaRepairController` e `RmaRepairService` para externos/intervenções. Prefixo abaixo: `/api/rmas/{rmaId}`.

| Método e sufixo | Contrato e resultado |
|---|---|
| `GET /parts` existente | Preserva campos e totais de `RmaPartsResponse`; acrescenta `replacedComponents`, projeção unificada de consumidos e externos não anulados. |
| `POST /parts/{reservationId}/consume` existente | Passa a exigir `PartConsumptionRequest(replacementReason, componentBatch)`; retorna `PartReservationResponse` enriquecido. Corpo `{}` passa a falhar com 400; atualizar cliente e testes juntos. |
| `PUT /parts/{reservationId}/replacement` | `ReplacementDetailsRequest(replacementReason, componentBatch)`; apenas reserva consumida do RMA; retorna reserva enriquecida. |
| `POST /repair/external-components` | `ExternalComponentRequest(code?, description, quantity, unit, componentBatch?, replacementReason)`; 201 com componente. |
| `PUT /repair/external-components/{id}` | Mesmo request; 200, somente registro não anulado. |
| `POST /repair/external-components/{id}/void` | `RepairVoidRequest(reason)`; 200 com registro anulado. |
| `GET /repair` | `RmaRepairResponse(interventions, totalServiceSeconds)`; inclui intervenções anuladas identificadas, sem somá-las. |
| `POST /repair/interventions` | `InterventionRequest(type, description, performedOn, technicianId?, timeMode, hours?, startedAt?, finishedAt?)`; 201. |
| `PUT /repair/interventions/{id}` | Mesmo request; 200 com intervenção atualizada. |
| `POST /repair/interventions/{id}/void` | `RepairVoidRequest(reason)`; 200. |
| `GET /repair/history` | Lista de eventos imutáveis de reparo, para timeline e auditoria. |

`ReplacedComponentResponse`: `source` (`STOCK`/`EXTERNAL`), `sourceId`, `reservationId?`, `partId?`, `code?`, `description`, `quantity`, `unit`, `componentBatch?`, `replacementReason?`, `appliedAt?`, `appliedBy?`, `metadataComplete`, `identitySnapshot`. Identidade da UI = par source/id. O projeto C usa essa projeção e intervenções não anuladas; não interpreta resumos livres nem trata movimento de reserva como aplicação.

`InterventionResponse` acrescenta `id`, técnico id/nome, `durationSeconds`, auditoria e anulação ao request normalizado. Não aceitar auditoria, custo, status da reserva ou `rmaId` do corpo. Strings recebem trim e branco opcional vira nulo; validar limites da seção 3 com Bean Validation e regras cruzadas no serviço.

**Erros:** reutilizar envelope `ApiError(timestamp,status,error,message,details)` e classes existentes: 404 para RMA/filho ausente ou pertencente a outro RMA; 400 (`BusinessException`) para regra de negócio, inclusive estado inválido ou consumo repetido; 401 sem sessão e 403 sem permissão. Exemplos: “Informe o motivo da troca.”, “Somente reservas ativas podem ser consumidas.”, “Informe horas ou início e fim, conforme o modo escolhido.”, “O fim deve ser posterior ao início.”, “Não é permitido alterar reparos de um RMA encerrado.” e “Componente não encontrado neste RMA.”

Hoje o handler tem textos genéricos em inglês. Na implementação, fornecer mensagens portuguesas nas constraints e tratamento localizado nesses controllers para validação/corpo inválido (“Dados inválidos.” / “Corpo da requisição inválido.”), mantendo o envelope e sem traduzir toda a aplicação. Testar resposta real, inclusive enum desconhecido.

**Atomicidade:** falha em motivo/lote ou auditoria deve desfazer também o consumo. Manter locks de consumo RMA → peça → reserva; novas alterações bloqueiam RMA antes do registro. Encerrados (`COMPLETED`, `RETURNED`, `IRREPARABLE`) só permitem leitura dos novos registros. Cancelamento e estorno existentes mantêm suas regras; estorno deve continuar refletido na projeção e gerar evento transacional. Respeitar a ordem atual de locks do estorno (peça → reserva), sem introduzir lock posterior de RMA nesse caminho. Repetição de consumo/anulação não duplica saldo ou eventos: retorna 400. Edições serializadas seguem o padrão atual de última gravação; conflito editorial é risco conhecido.

## 5. Permissões

Não criar a 21ª permissão: `pecas.reservar` já significa “Reservar e aplicar peças nos RMAs”; cobre consumo com metadados, correção da troca e componentes externos. `pecas.movimentar` continua sendo necessário para estorno de estoque, sem conceder edição técnica. `rma.diagnosticar` cobre criar/editar/anular intervenções por serem execução técnica; propor ampliar apenas seu rótulo para “Registrar diagnóstico e intervenções”.

Leituras sob `/api/rmas/**` seguem `rma.ver`, como o painel atual. Não adicionar exigência de `pecas.ver` ao detalhe: seria regressão para perfis personalizados e divergiria das leituras auxiliares existentes. `pecas.ver` permanece a visibilidade do catálogo de peças. Não exigir permissão de diagnóstico para consumir, nem de peças para lançar ressolda. Perfis prontos: ADMIN/TECHNICIAN escrevem; SERVICE_DESK/VIEWER leem; permissões personalizadas devem funcionar independentemente desses nomes.

Adicionar matchers explícitos em `SecurityConfig` para cada nova escrita, antes do fallback, e linhas correspondentes em `PermissionEquivalenceIntegrationTest`; a contagem de casos crescerá, não preservar um número fixo. Acrescentar testes com autoridades isoladas e negação para permissão errada. Manter as 20 chaves/ordem em `Permission.java` e `core/permissions.ts`, defaults e seeds; testar equivalência. `permission-picker` continua consumindo o catálogo de `GET /api/permissions` nas telas de perfis/usuários; não é seletor de técnico nem deve ser duplicado dentro do RMA.

## 6. UI e histórico

- **Peças:** ampliar `app-rma-parts-panel` nas duas superfícies de detalhe. “Consumir” abre formulário de motivo e lote; código/descrição/quantidade são somente leitura da reserva. Exibir lista “Componentes trocados” e ação “Adicionar fora do estoque”; manter reservas e movimentações existentes. Consumos antigos sinalizam “Motivo não registrado”; estornados permanecem no histórico.
- **Reparo e testes:** painel compartilhado de intervenções, lista de tipo, descrição, data, técnico e duração, total de serviço e ações de edição/anulação. Manter resumos existentes como “Resumo informado”, sem convertê-los ou concatená-los aos dados estruturados.
- Reusar `app-page-header` na página hospedeira, sem cabeçalho de página dentro de cada card; `app-custom-select` para tipo/modo/técnico e controles de data existentes. Reusar `appModalFocus`, botões e estados de carregamento globais, erros junto aos campos, Cancelar à esquerda, proteção contra envio duplo, tentativa de recarga e cancelamento de requests ao trocar RMA. Em 320 px, cards empilhados sem rolagem horizontal. Permissões e estado fechado controlam ações, sem impedir leitura.
- Criar `rma_repair_history`: `id`, `rma_id` FK, `entity_type`, `entity_id`, `action`, `changed_at`, `changed_by`, snapshots JSON anterior/posterior como texto. Eventos: consumo, correção, estorno, criação/edição/anulação de externo e intervenção. Persistir no mesmo commit transacional do dado. Estorno registra evento mesmo em RMA encerrado quando autorizado pelas regras existentes.
- Integrar eventos por `GET /repair/history` a `rmaHistory` nas duas telas; ordenar por instante decrescente e desempate estável por origem/id. Mostrar ação, autor e data da alteração; data executada aparece no conteúdo. Não inserir “status fictício” em `rma_status_history`, que alimenta tempos por etapa. Mesclar os eventos de prazo da V2. Emitir sinal de atualização após salvar, consumir ou estornar para recarregar projeção/timeline; erro na leitura do reparo deve permitir retry sem apagar histórico de status/atribuições/prazos.

## 7. Testes, riscos e limites

TDD na implementação: escrever falha observável, executar, implementar o mínimo e executar novamente por tarefa. Backend: schema V1+V2+V3 em banco limpo; checks/FKs; rollback completo; consumo concorrente único; validação de pertencimento; quantidade com três casas; dois lotes em reservas distintas; saldo/custo sem duplicação; estorno retira da projeção mantendo auditoria; consumo anterior à V3; catálogo renomeado; externo sem efeito no saldo; código já cadastrado; ambos os modos de tempo, arredondamento, meia-noite/fuso e futuro; técnico inválido/inativo; anulação excluída do total; bloqueio por encerramento e matriz de permissões. Cobrir os caminhos existentes de consumo/estorno com regressão.

Frontend: requests e DTOs espelhados, consumo exige motivo, lote opcional, validações cruzadas de tempo, técnico padrão, ocultação por autoridade, leitura de legado, soma recebida do servidor, refresh de timeline, falha/retry, troca rápida de RMA sem resposta atrasada, equivalência lista/Kanban e uso por teclado. Executar `mvn -B -ntp -f backend/pom.xml verify`, testes Angular configurados no repo e `npm --prefix frontend run build`; validar V3 também em MySQL 8. Não rodar testes de produto para esta entrega documental.

Riscos: quebra intencional do consumo com `{}` exige deploy coordenado; lote informado não assegura rastreabilidade de entrada; textos antigos não fornecem motivo confiável; sobreposição de lançamentos pode inflar horas; alterações concorrentes podem sobrescrever correções; detalhes e modelos compartilhados podem conflitar com o trabalho de prazos. Integrar após V2 e revisar apenas os pontos comuns, sem reescrever seu desenho.

Fora de escopo: gerar PDF, precificar mão de obra, criar estoque por lote, consumo parcial, cronômetro, aprovação de apontamentos, folha de ponto, catálogo editável de tipos, conversão automática de texto antigo, mudar fluxo de status/prazo e vínculo de intervenção a um item específico do RMA. O registro é por RMA, como as reservas atuais.

## 8. Perguntas abertas ao produto

- Lote deve ser obrigatório? Há casos sem identificação física ou com mais de um lote por aplicação?
- O técnico pode lançar trabalho de outro ou somente o próprio? A proposta permite selecionar outro atribuível e audita o autor.
- Horas são esforço acumulado ou duração cronológica? A proposta soma sessões e permite simultaneidade; deve haver alerta de sobreposição?
- Precisamos relacionar cada troca/intervenção a equipamento/serial em RMAs com vários itens?
- É necessário corrigir reparo após encerramento com permissão especial? A proposta bloqueia novas escritas técnicas e preserva o estorno existente.
- Confirmar os seis tipos e se “regravação” precisa ser distinguida de firmware no laudo; confirmar lote opcional e motivo obrigatório apenas para novos consumos.

## 9. Tarefas de implementação propostas

Formato dos planos existentes: tarefas numeradas, arquivos, interfaces e passos verificáveis. Não executar nesta entrega.

### Task 1: Persistência V3 e contratos (backend)

**Files:** criar `backend/src/main/resources/db/migration/V3__rma_replaced_components_and_interventions.sql`; entidades/records/enums em `part/` e `rma/`, repositórios em `repository/`; ampliar `part/PartReservation.java`.

**Interfaces:** modelos da seção 3 e responses da seção 4.

- [ ] **Step 1:** escrever testes de schema, legado e invariantes; executar e observar FAIL.
- [ ] **Step 2:** implementar V3 aditiva e mapeamentos, sem editar V1/V2 ou `rmas`.
- [ ] **Step 3:** executar testes em H2 e aplicar V1+V2+V3 em MySQL 8; esperar PASS.

### Task 2: Aplicação de componentes e externos (backend)

**Files:** alterar `service/PartStockService.java`, `controller/RmaPartController.java` e DTOs de peças; criar `controller/RmaRepairController.java`, `service/RmaRepairService.java` e testes em `backend/src/test/java/br/com/navitasassist/part/`.

**Interfaces:** consumo com motivo/lote, correção, externos e `replacedComponents`.

- [ ] **Step 1:** testes falhando de consumo atômico, concorrência, estorno, externo, snapshots, RMA fechado e pertencimento.
- [ ] **Step 2:** implementar projeção e escritas com validação e auditoria, preservando locks/custos.
- [ ] **Step 3:** executar testes novos e regressão de estoque; esperar PASS.

### Task 3: Intervenções, duração e eventos (backend)

**Files:** ampliar `RmaRepairController`/`RmaRepairService`; criar DTOs e persistência de histórico em `rma/`/`repository/`; testes em `backend/src/test/java/br/com/navitasassist/rma/`.

**Interfaces:** `/repair`, intervenções e `/repair/history` da seção 4.

- [ ] **Step 1:** testes falhando de modos exclusivos, técnico, datas, total, edição/anulação e rollback do histórico.
- [ ] **Step 2:** implementar regras e eventos transacionais, incluindo consumo/estorno da Task 2.
- [ ] **Step 3:** executar testes dirigidos; esperar PASS.

### Task 4: Autorização e erros (backend)

**Files:** `config/SecurityConfig.java`, `access/Permission.java`, controllers locais e `access/PermissionEquivalenceIntegrationTest.java`/demais testes de permissões.

**Interfaces:** matriz e envelope descritos nas seções 4–5.

- [ ] **Step 1:** registrar todas as rotas novas na matriz e escrever testes de autoridades isoladas, corpo inválido e mensagens portuguesas; observar FAIL.
- [ ] **Step 2:** implementar matchers, rótulo e tratamento localizado de erros; manter 20 permissões e seeds.
- [ ] **Step 3:** executar matriz e `mvn -B -ntp -f backend/pom.xml verify`; esperar PASS.

### Task 5: Componentes trocados (frontend)

**Files:** `core/models.ts`, `core/services/part.service.ts`, `shared/rma-parts-panel/*` e respectivos testes.

**Interfaces:** DTOs espelhados; consumo com motivo/lote; formulário externo; atualização do reparo.

- [ ] **Step 1:** testes falhando de payload, estados, permissões, legado, contexto e recarga.
- [ ] **Step 2:** implementar formulários/listagem com componentes compartilhados.
- [ ] **Step 3:** executar testes dirigidos e conferir teclado e 320 px; esperar PASS.

### Task 6: Intervenções e timeline nas duas telas (frontend)

**Files:** criar `core/services/rma-repair.service.ts` e `shared/rma-interventions-panel/*`; alterar `core/utils/rma-detail.ts`, `pages/rmas/*`, `shared/rma-detail-modal/*` e testes; conferir `core/permissions.spec.ts`.

**Interfaces:** painel de trabalho, total e união estável de eventos de reparo/status/atribuição/prazo.

- [ ] **Step 1:** testes falhando de tempo, anulação, histórico, permissões e paridade lista/Kanban.
- [ ] **Step 2:** implementar e integrar sobre o trabalho de prazos concluído, preservando seus contratos.
- [ ] **Step 3:** executar suíte frontend configurada, build e verificação integrada backend/frontend; conferir que consumo e estorno atualizam peças, total e timeline sem duplicação.
