# Etapa 2 — Piloto do Kanban Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dar mais espaço útil e leitura rápida ao Kanban: cabeçalho curto, filtros recorrentes em uma linha com os avançados recolhidos, e card enxuto, sem perder nenhuma função.

**Architecture:** Mudanças em `kanban.component.html/css/ts` (cabeçalho, indicadores, visualizações, filtros) e em `rma-kanban-board.component.html/css/ts` (card). O `filtersForm`, o filtro `filterKanbanRmas` e todos os sinais existentes permanecem; só muda a apresentação e entram uma lista de filtros ativos removíveis e o recolhimento do painel avançado.

**Tech Stack:** Angular 21 (signals, reactive forms), Vitest (`npm --prefix frontend test -- --watch=false`), CSS global com os tokens da etapa 1 (`--control-height`, `--space-*`).

**Spec:** `docs/ux/2026-11-06-estudo-ui-ux.md` (resumo para decisão: decisões 1, 3 e 4; seções "Aplicação no Kanban" e "Card: contrato de conteúdo") e `docs/ux/2026-11-07-etapa-1-fundacao-visual.md`.

## Global Constraints

- Preservar: nove etapas, busca, os 11 controles de filtro (busca mais dez), visualizações salvas (criar, aplicar, renomear, tornar padrão, excluir), arraste entre colunas, seleção em lote com resultados parciais, permissões (`canUpdateStatus`, `canUpdateAssignee`), abertura do detalhe por clique e Enter, impedimentos.
- **Decisão 1 (card enxuto):** saem do card a **falha resumida** e o **SLA saudável**. Ficam: chave, cliente, produto como título, prioridade, avatar do responsável, data de entrada, **SLA em atenção/atrasado** e **impedimento ativo**. A falha completa continua no detalhe (`rma-detail-modal.component.html:34`).
- **Decisão 3 (indicadores por tela):** no Kanban, os quatro indicadores passam de quatro cartões para uma faixa compacta de uma linha; não são removidos.
- **Decisão 4 (prioridade):** o card já mostra ícone com rótulo (`priority-tag` com `priorityLabel`); manter o rótulo e garantir nome acessível.
- Filtro aplicado nunca fica escondido: o painel avançado recolhido mostra os filtros ativos como chips removíveis.
- Remover a instrução permanente sobre arrastar do cabeçalho.
- Usar os tokens da etapa 1; sem cores novas, sem gradientes decorativos nos módulos de operação.
- Fora do escopo: detalhe do RMA, modais de status/responsável, abas, lista alternativa em tela estreita, paleta, outras páginas.
- Comandos: `npm --prefix frontend test -- --watch=false`; se a suíte travar com "Timeout starting forks runner", usar `--runner-config` com `maxWorkers: 2` em arquivo fora do repositório.

## Review Focus

- Filtro avançado ativo com o painel recolhido: o chip aparece e o RMA continua filtrado (Tarefa 2).
- Remover um chip limpa só aquele filtro e mantém os demais e a visualização ativa coerente (Tarefa 2).
- Card de RMA com SLA `NORMAL` não mostra SLA; `WARNING` e `OVERDUE` mostram; RMA encerrado (`CLOSED`) não mostra (Tarefa 3).
- RMA sem falha, sem responsável ou com cliente longo não quebra o card (Tarefa 3).
- Seleção em lote: o checkbox continua só em modo de seleção e clicar nele não abre o detalhe (Tarefa 3).
- Colunas vazias, carregando e "Nenhum RMA encontrado" continuam aparecendo (Tarefa 2).

---

### Task 1: Cabeçalho curto e faixa de indicadores

**Files:**
- Modify: `frontend/src/app/pages/kanban/kanban.component.html:1-18` e `:30-46`
- Modify: `frontend/src/app/pages/kanban/kanban.component.css`
- Test: `frontend/src/app/pages/kanban/kanban.component.spec.ts`

**Interfaces:**
- Consumes: `heroStats()` (`kanban.component.ts:207`), `filteredRmas()`, `totalRmas()`. Não alterar os sinais.
- Produces: classe `kanban-summary` com os quatro indicadores em linha; contagem no título.

- [ ] **Step 1: Escrever os testes que falham.** Em `kanban.component.spec.ts`: `does not show the permanent drag instruction in the header` (o texto da página não contém "Arraste os cards entre as colunas") e `shows the four indicators in a single compact summary` (existe `.kanban-summary`, não existe `.stats-grid` nem `.stat-card`, e o texto traz "Em andamento", "Alta prioridade", "Aguardando peça", "Encerrados").
- [ ] **Step 2: Rodar e ver falhar.** `npm --prefix frontend test -- --watch=false`. Esperado: os dois testes novos FAIL; os demais passam.
- [ ] **Step 3: Implementar.** Título "Kanban de RMAs" com a contagem `filteredRmas().length de totalRmas()` junto ao título; remover o `<p>` da instrução; trocar `.stats-grid` por `.kanban-summary`, uma linha de itens "rótulo + valor" (ícone `app-icon` opcional, sem `.panel`), usando `heroStats()`. Remover do cabeçalho de `.kanban-stage` o título "Fluxo operacional" duplicado e deixar só a contagem e "Limpar filtros".
- [ ] **Step 4: Rodar e ver passar.** Mesmo comando. Esperado: PASS em toda a suíte.
- [ ] **Step 5: Commit.** `git add` dos arquivos listados em **Files**; mensagem: `feat(kanban): cabeçalho curto e faixa de indicadores (NAV-98)`.

### Task 2: Visualizações em uma linha e filtros recorrentes com painel avançado

**Files:**
- Modify: `frontend/src/app/pages/kanban/kanban.component.html:48-207`
- Modify: `frontend/src/app/pages/kanban/kanban.component.ts` (adicionar sinais; `countActiveFilters` fica em `:787`)
- Modify: `frontend/src/app/pages/kanban/kanban.component.css`
- Test: `frontend/src/app/pages/kanban/kanban.component.spec.ts`

**Interfaces:**
- Consumes: `filtersForm` (11 controles), `activeFilterCount()`, `clearFilters()`, e o tipo `KanbanFilterValues`.
- Produces em `kanban.component.ts`:
  - `advancedFiltersOpen = signal(false)` e `toggleAdvancedFilters(): void`.
  - `activeFilterChips: Signal<ReadonlyArray<{ key: keyof KanbanFilterValues; label: string }>>`, com um chip por filtro diferente do padrão, rótulo no formato "Prioridade: Alta" (usando as opções de `*FilterOptions` já existentes).
  - `removeFilter(key: keyof KanbanFilterValues): void`, que volta só aquele controle ao valor padrão (`'all'` ou `''`).

- [ ] **Step 1: Escrever os testes que falham.** `shows search, SLA and assignee as quick filters and hides the other eight controls until Filtros is opened` (cinco controles de formulário visíveis fora do painel; os outros oito dentro de um contêiner `hidden` ou ausente até clicar em "Filtros"); `shows an active advanced filter as a removable chip while the panel is closed` (definir `priority` pelo `filtersForm`, painel fechado: existe chip "Prioridade: Alta" e os cards filtrados diminuem); `removes only the clicked chip` (dois filtros ativos, remover um, o outro permanece e `activeFilterCount()` cai de 2 para 1); `keeps saved views usable in a single row` (o seletor de visualização e "Salvar atual" existem; "Renomear", "Tornar padrão" e "Excluir" só com visualização ativa).
- [ ] **Step 2: Rodar e ver falhar.** Esperado: os quatro testes FAIL; os testes de filtro e de visualização já existentes passam.
- [ ] **Step 3: Implementar.** Linha única com: busca (`kanbanSearch`), SLA, Responsável, botão "Filtros" com contagem dos avançados ativos (`aria-expanded`, `aria-controls`) e "Limpar filtros". Abaixo, a linha das visualizações compactada: sem o texto "Salve e reaplique...", seletor mais "Salvar atual" e os botões condicionais atuais. Painel avançado com Prioridade, Status, Impedimentos, Garantia e as quatro datas, aberto por `advancedFiltersOpen`. Chips abaixo da barra, cada um com botão de remover e `aria-label` "Remover filtro ...". **Os controles do painel continuam no mesmo `formGroup`**, apenas `[hidden]` ou dentro de `@if` — não recriar o formulário.
- [ ] **Step 4: Rodar e ver passar.** `npm --prefix frontend test -- --watch=false`. Esperado: PASS, incluindo os testes antigos de combinação, persistência e visualizações.
- [ ] **Step 5: Commit.** `git add` dos arquivos de **Files`; mensagem: `feat(kanban): filtros recorrentes, painel avançado e chips ativos (NAV-98)`.

### Task 3: Card enxuto

**Files:**
- Modify: `frontend/src/app/shared/rma-kanban-board/rma-kanban-board.component.html:46-70`
- Modify: `frontend/src/app/shared/rma-kanban-board/rma-kanban-board.component.ts`
- Modify: `frontend/src/app/shared/rma-kanban-board/rma-kanban-board.component.css`
- Create: `frontend/src/app/shared/rma-kanban-board/rma-kanban-board.component.spec.ts`

**Interfaces:**
- Consumes: `slaStatus(sla: RmaSlaResponse, now: number): RmaSlaStatus` (`core/utils/rma-sla.ts:10`; estados `NORMAL | WARNING | OVERDUE | CLOSED`), o `clock` já injetado no componente e `<app-rma-sla-badge [sla]>`.
- Produces: `showSla(item: RmaResponse): boolean` no componente do quadro, verdadeiro só para `WARNING` e `OVERDUE`.

- [ ] **Step 1: Escrever os testes que falham** (novo spec, com `TestBed` e RMAs de fábrica). Nomes: `does not render the reported failure in the card`; `hides SLA when the state is NORMAL and when it is CLOSED`; `shows SLA when the state is WARNING or OVERDUE`; `keeps code, client, product, priority label, avatar and active block`; `does not open the card when the bulk checkbox is clicked`; `renders a card without assignee, failure or with a very long client name without throwing`.
- [ ] **Step 2: Rodar e ver falhar.** Esperado: os testes de falha, de SLA saudável e de SLA em atenção/atraso FAIL; os demais podem passar.
- [ ] **Step 3: Implementar.** Remover o `<p class="board-card__failure">`; envolver `<app-rma-sla-badge>` em `@if (showSla(item))`; manter o resto do card (identidade, `priority-tag`, título, bloqueio, rodapé). Dar `aria-label` ao avatar com o responsável e limitar o cliente a uma linha com reticências. Ajustar o CSS: remover `.board-card__failure` e reduzir o espaço vertical que sobra.
- [ ] **Step 4: Rodar e ver passar.** Esperado: PASS em toda a suíte, incluindo os testes de clique e de Escape do `kanban.component.spec.ts`.
- [ ] **Step 5: Commit.** `git add` dos quatro arquivos; mensagem: `feat(kanban): card enxuto sem falha e SLA saudável (NAV-98)`.

### Task 4: Superfícies neutras e limpeza do CSS do Kanban

**Files:**
- Modify: `frontend/src/app/pages/kanban/kanban.component.css:11-22` e as regras `.kanban-views*`/`.kanban-filters*`
- Modify: `frontend/src/app/shared/rma-kanban-board/rma-kanban-board.component.css`

**Interfaces:** nenhuma dependência de código; consome os tokens da etapa 1.

- [ ] **Step 1: Verificar o estado atual.** `grep -n "var(--border)\|button-secondary--danger" frontend/src/app/pages/kanban/kanban.component.css`. Esperado: `var(--border)` indefinido e `.button-secondary--danger` duplicado.
- [ ] **Step 2: Implementar.** Trocar o fundo com gradiente de `.kanban-stage` por `var(--surface)` ou `var(--bg)`; corrigir `var(--border)` para `var(--line)`; remover a regra duplicada de `.button-secondary--danger` (já definida em `styles.css`); mapear espaçamentos soltos para `--space-*`. **Não mudar** as cores por coluna nem os estados de arraste.
- [ ] **Step 3: Rodar a suíte e o build.** `npm --prefix frontend test -- --watch=false` e `npm --prefix frontend run build`. Esperado: tudo PASS; o aviso de bundle não piora além do que as Tarefas 1 a 3 acrescentarem.
- [ ] **Step 4: Commit.** `git add` dos dois CSS; mensagem: `style(kanban): superfícies neutras e limpeza de CSS (NAV-98)`.

### Task 5: Conferência no navegador

**Files:** nenhum.

- [ ] **Step 1: Subir o backend e o app.** O backend (`localhost:8080`) precisa estar de pé e o **usuário faz o login** no navegador do app; as credenciais não são digitadas por agente. `npm --prefix frontend start -- --port 4300`.
- [ ] **Step 2: Percorrer em 1440 px e 320 px:** abrir o Kanban; usar busca, SLA e Responsável; abrir "Filtros", aplicar prioridade e fechar o painel (o chip deve aparecer); remover o chip; salvar e reaplicar uma visualização; arrastar um card; selecionar vários e aplicar uma ação em lote; abrir o detalhe por clique e por Enter. Esperado: sem rolagem horizontal da página (o quadro rola sozinho), sem regressão.
- [ ] **Step 3: Registrar capturas antes e depois** e a diferença de altura do cabeçalho, que deve ficar claramente menor que a atual.
- [ ] **Step 4: Encerrar** o dev server e atualizar o estudo (decisões 1, 3 e 4 como entregues, com os commits).

## Critérios de aceite

1. O cabeçalho não tem instrução permanente de arrastar nem cartões de estatística; os quatro indicadores aparecem em uma linha.
2. Busca, SLA e Responsável ficam visíveis; os outros oito filtros ficam atrás de "Filtros" e, quando ativos, aparecem como chips removíveis.
3. O card não mostra a falha nem o SLA saudável; mostra SLA em atenção ou atrasado, impedimento, cliente, prioridade com rótulo, avatar e chave.
4. Nenhuma função some: arraste, lote com resultado parcial, visualizações, permissões, nove etapas e detalhe por Enter.
5. Testes e build passam; o bundle não cresce mais que o necessário para os novos sinais.
6. Conferido no navegador, com login feito pelo usuário, em 1440 px e 320 px.

## Fora deste plano

Detalhe do RMA e suas abas (etapa 4), lista alternativa em tela estreita, colunas recolhíveis e a revisão de densidade (36 px) depois de validar com operadores.
