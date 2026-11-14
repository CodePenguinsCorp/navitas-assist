# Etapa 4 — Ciclo da OS (lista, histórico, abertura, diagnóstico e os dois detalhes) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A lista de ordens de serviço passa à composição "Coleção" das etapas 2 e 3 (cabeçalho com contagem, barra comum de busca/status, estados distintos de falha, vazio e busca sem resultado, indicadores com escopo verdadeiro e coerentes com o resultado exibido); o histórico por lote/série fica identificado e com retorno claro; a abertura de OS é agrupada por momento do atendimento; o diagnóstico ganha seções e mensagens por campo; e os dois detalhes existentes (seis abas na lista, blocos e linha do tempo no Kanban) passam a mostrar os mesmos fatos, com os mesmos nomes, ordem e formatação, sem trocar a estrutura de nenhum deles. Nenhum campo, obrigatoriedade, validador, payload ou permissão muda. Ficam preservados os filtros disponíveis, os parâmetros enviados, o tamanho de página e o recuo de página. **Exceção comportamental explícita:** "Buscar" confirma busca e status; paginação, troca de tamanho, atualização após salvar e nova tentativa reutilizam o último filtro confirmado; digitação ou troca de status sem envio não altera a consulta.

**Architecture:** Um módulo de funções puras em `frontend/src/app/core/utils/rma-detail.ts` define o **contrato de informação** (rótulos, ordem e formatação de produto, garantia, recebimento, diagnóstico, reparo, histórico e impedimento). Cada detalhe continua com a própria marcação (`dl.meta-list` e abas na lista; blocos `.rma-detail__tile` e linha do tempo no Kanban) e só consome as funções. A página `pages/rmas` reutiliza `app-page-header`, `button[appRowAction]`, `fieldset.form-section` e os padrões `loadFailed`/`hasLoaded`/`clearFilters`/`retryLoad` de clientes, produtos e usuários, e coordena lista e resumo no próprio componente. `PagedList`, `RmaService`, o backend, `rma-parts-panel`, `rma-protocols`, `rma-block-panel`, `rma-block-history` e `rma-sla-badge` não mudam.

**Tech Stack:** Angular 21 (signals, reactive forms, `@if/@for/@defer`), RxJS (`switchMap`), Vitest via `ng test`, CSS global com os tokens da etapa 1 (`--control-height`, `--space-*`, `--font-size-md`, `--font-weight-semibold`).

**Spec:** `docs/ux/2026-11-06-estudo-ui-ux.md` (resumo para decisão: decisões 2 "Harmonizar primeiro", 3 "Avaliar por tela", 4 "Ícone + rótulo curto", 5 e 6; "Achados globais" 1, 3 e 4; "Decisões que valem para qualquer tela"; seções "Lista de ordens de serviço e histórico", "Abertura de OS", "Atendimento e diagnóstico", "Detalhe: compreender e agir", "Contrato dos componentes", "Escrita: reduzir sem tornar ambíguo"), `docs/ux/2026-11-07-etapa-1-fundacao-visual.md` (40 px, paleta atual) e `docs/ux/2026-11-07-roteiro-conferencia-manual.md` (pendência "filtros de ordens de serviço com 'Buscar' antes de 'Limpar'").

**Ordem e dependências:** 1a (estado, filtro confirmado e resumo) → 1b (composição da lista) → 1c (consulta de histórico) → 2a (mensagens e validação da abertura) → 2b (reorganização visual da abertura) → 3 (diagnóstico) → 4A (funções do contrato; **depende da Tarefa 1a**, que cria `itemCountLabel` e as fábricas de teste; independe de 2 e 3) → 4B (contrato no detalhe da lista; depende de 3 e 4A) → 4C (contrato no modal do Kanban; depende de 4A) → 5 (verificação). 1a–4B editam `rmas.component.html/ts`; executar **em sequência**, uma tarefa por commit.

## Global Constraints

- **Preservar:** paginação real (`PagedList`, `rmas.component.ts:358-373`, recuo de página em `paged-list.ts:59-63`); busca por envio (botão "Buscar", sem debounce) e filtro de status com as nove etapas (`STATUS_FILTER_OPTIONS`, `rmas.component.ts:904-910`); os parâmetros de `list` e `getSummary` (`query`, `status`, `page`, `size`; `rma.service.ts:30-38`); histórico por lote/série em endpoint próprio (`rmaService.history`, `rma.service.ts:49-61`), com abertura do detalhe pelo resultado (`selectHistoryItem`, `rmas.component.ts:618-620`); abertura do detalhe por clique, Enter e Espaço na linha (`rmas.component.html:139-147`); abertura por link `/rmas?rma=<id>` (`openRequestedRma`, `rmas.component.ts:735-745`), que abre na aba Produtos (`openDetailsModal`, `:541-547`); garantia por produto (coluna `rmas.component.html:161-169`; `ItemWarranty.calculate` no backend); registros retroativos de reparo, peças trocadas e testes (`createForm`, `rmas.component.ts:461-463`).
- **Exceção comportamental (filtro confirmado):** hoje o `fetch` da lista lê o formulário no momento da requisição (`rmas.component.ts:358-360` → `buildFilters`, `:873-881`), então editar a busca ou o status e paginar aplica o valor não enviado. Passa a valer só o filtro confirmado por "Buscar"/"Limpar" (ver "Contrato de estados da lista").
- **Não mudar:** campos, obrigatoriedade, validadores, limites e payloads de `createForm` (`rmas.component.ts:450-464`), de cada item (`createRmaItemForm` + `atLeastOneItemIdentification`, `:883-902`) e de `diagnosisForm` (`:466-473`); a construção dos payloads (`createRma`, `:643-662`; `saveDiagnosis`, `:705-712`); a validação de datas (`validateCreateDates`, `:845-863`, e os limites `purchaseMinDate`/`entryMinDate`, `:401-409`); o esvaziamento da compra quando marcada como desconhecida (`:476-482`); `RmaService`; `PagedList`; backend; `app.routes.ts`. Observação de exatidão: lote e série têm **validador Angular** `maxLength(60)` (`:886-887`) e **não** têm atributo HTML `maxlength` (`rmas.component.html:392,397`); prioridade tem só `required` (`:460`), sem validação de pertencimento ao enum. Nada disso muda.
- **Permissões por perfil (só nos componentes; `/rmas` e `/kanban` não têm `roles`, `app.routes.ts:34-44`):** abertura (`canOpenRma` e guarda de `createRma`) `ADMIN`/`SERVICE_DESK` (`rmas.component.ts:432-434,623-626`); diagnóstico `ADMIN`/`TECHNICIAN` (`canRegisterDiagnosis`, `:436-438`; guardas em `openDiagnosisModal`/`saveDiagnosis`, `:560-563,693-696`); reservas e protocolos `ADMIN`/`TECHNICIAN` (`rma-parts-panel.component.ts:135`, `rma-protocols.component.ts:119`); status no Kanban `ADMIN`/`SERVICE_DESK`/`TECHNICIAN` e responsável `ADMIN`/`SERVICE_DESK` (`kanban.component.ts:240-245`); impedimentos editáveis pelos três perfis operacionais (`rma-block-panel.component.ts:30`). `VIEWER` só consulta. Nada disso muda.
- **Decisão 2 (detalhe: harmonizar primeiro):** a lista mantém as seis abas na ordem Produtos, Diagnóstico, Peças, Protocolos, Impedimentos, Histórico (`detailTabs`, `rmas.component.ts:349-356`); o modal do Kanban mantém blocos, lateral e linha do tempo **sem abas** (nenhum `role="tablist"`). Muda o conteúdo e a nomenclatura dos fatos, não a estrutura. A implementação é por funções compartilhadas; nenhum trecho de HTML é copiado de um detalhe para o outro.
- **Decisão 3 (indicadores por tela):** resultado em "Decisão de indicadores". Nenhum indicador pode parecer total da operação quando não é, dizer "nesta página" quando não é calculado sobre a página, nem aparecer junto de uma lista de outro filtro.
- **Decisão 4:** prioridade com ícone de barras + rótulo (`.priority-tag`), inclusive no modal do Kanban.
- **Decisão 6 e etapa 1:** Cancelar à esquerda nos rodapés (já entregue; `expectCancelBeforePrimary` deve continuar passando); na barra de filtros, "Limpar" (secundário) antes de "Buscar" (primário); paleta atual; controles de 40 px; ação de linha com `--control-height-sm`. Sem cores novas e sem ícones novos (os usados existem em `shared/icon/icon.component.ts`: `plus`, `trash`, `alert`, `inbox`, `chevron`, `shield`).
- **Não inventar:** debounce na busca de ordens de serviço, filtro de prioridade, edição de OS, exclusão, abas no Kanban, novos endpoints, novos validadores, troca de responsável ou status na lista, abertura direta de uma aba específica pelo link. Os detalhes não disparam requisição nova; o link do Kanban leva à rota `/rmas`, que faz a carga normal dela.
- **Ações de negócio mantêm texto:** "Nova OS", "Abrir OS", "Adicionar produto", "Consultar", "Registrar diagnóstico", "Salvar diagnóstico", "Alterar status", "Ver impedimentos", "Abrir OS na lista". Só a remoção de produto da abertura vira ícone (pedido explícito do estudo para itens repetidos).
- **Comandos (Git Bash, caminho entre aspas simples):** testes `npm --prefix frontend test -- --watch=false --runner-config 'C:\Users\joseh\AppData\Local\Temp\vitest-runner.config.mjs'` (arquivo fora do repositório com `maxWorkers: 2`; existe nesta máquina); build `npm --prefix frontend run build`.
- **Regras de teste:**
  - Cada tarefa separa **testes de comportamento novo** (devem falhar antes da implementação) de **testes de preservação** (passam antes e depois; são a rede de proteção e não precisam falhar).
  - Cada teste de comportamento novo traz, no plano e num comentário de uma linha no spec, a **asserção observável que reprova o comportamento atual** (ex.: "hoje o texto 'nesta página' existe"). Ausência de um seletor novo, isoladamente, não demonstra ocultação correta: todo teste de ocultação também afirma a ausência do conteúdo atual (texto ou valor) e a presença do que deve aparecer no lugar.
  - Se o vermelho for **erro de compilação ou de import** (função, arquivo ou membro ainda inexistente), relatar isso à parte e **não** afirmar nada sobre os demais testes, que não chegaram a rodar.
  - Cenários de falha **inicial** configuram o mock com erro **antes** de `TestBed.createComponent`; por isso os specs novos usam uma função `setup({ role, list, summary, history })` chamada dentro de cada teste, e não o `beforeEach` atual de `rmas.component.spec.ts:20-49`, que já cria o componente com sucesso. Cenários de concorrência usam `Subject` por requisição, emitidos na ordem do teste.
- **Commits:** um por tarefa, só com os arquivos listados em **Files**; mensagem no padrão `tipo(escopo): descrição (NAV-98)`; sem trailer de coautoria e sem menção a ferramenta de geração.
- **Verificação:** a conferência autenticada no navegador **não é possível nesta execução**: exige login e backend em `localhost:8080`, e credenciais não são digitadas durante a implementação. A verificação desta etapa é por testes e build; layout, densidade, 320 px, recolhimento do grupo "Atendimento já realizado" e leitura dos dois detalhes ficam no roteiro manual da Tarefa 5, executado pelo usuário.

## Inventário de inconsistências (evidência)

### Lista de ordens de serviço e histórico

| Tema | Hoje | Evidência |
| --- | --- | --- |
| Cabeçalho | `<section class="page-heading">` sem contagem; não usa `app-page-header` | `rmas.component.html:2-11` |
| Contagem | "N registro(s)" dentro do painel de filtros, longe do título | `rmas.component.html:45-48` |
| Estatísticas | três cartões: "ordens de serviço encontradas", "Em atendimento (nesta página)", "Prioridade alta (nesta página)" | `rmas.component.html:13-29` |
| Escopo dos indicadores | o texto diz "nesta página", mas os valores vêm de `/api/rmas/summary`, calculados sobre **todo o resultado do filtro** (`RmaRecordRepository.java:158-189`; "em atendimento" exclui `COMPLETED`, `RETURNED`, `IRREPARABLE`, `RmaService.java:85-87`) | `rmas.component.ts:377-380,776-781` |
| Zeros como dado | `summarySignal` começa com `{ total: 0, ongoing: 0, highPriority: 0 }`: antes da primeira resposta ou após falha inicial, os cartões mostram zeros; uma falha posterior mantém o último resumo, que pode ser de outro filtro | `rmas.component.ts:377,779` |
| Resumo assíncrono | cada `loadSummary()` abre uma assinatura independente, sem cancelamento nem identificação da consulta; a lista usa `switchMap` e mantém o resultado anterior durante a próxima carga. Buscar B depois de A pode mostrar lista B com resumo A, e uma resposta atrasada de A pode sobrescrever o resumo de B | `rmas.component.ts:776-781`; `paged-list.ts:24-37` |
| Filtro aplicado x digitado | a lista lê o formulário **no momento da requisição**; editar busca ou status sem "Buscar" e trocar de página ou de tamanho aplica o valor novo à lista, enquanto os indicadores ficam com o filtro anterior | `rmas.component.ts:358-360,509-517,873-881` |
| Barra de filtros | painel `form-panel` com título "Filtros" ao lado do painel "Histórico" (`two-column-grid`), e não a barra comum `.catalog-toolbar--filters` das etapas 2 e 3 | `rmas.component.html:43-69` |
| Ordem dos botões | "Buscar" antes de "Limpar" (pendência registrada no roteiro manual) | `rmas.component.html:64-67` |
| Falha de carga | `pageError` mistura falha da lista (`:360`), falha de clientes/produtos (`:765`), falha do resumo (`:779`), permissão (`:532,556,561`), erros dos formulários (`:630,639,681,700,729`) e link de notificação (`:743`); não há sinal próprio de falha da última consulta | `rmas.component.ts:343,360` |
| Falha inicial x vazio | com a lista em erro, o corpo mostra "Nenhuma OS encontrada." com "Nova OS", junto do banner | `rmas.component.html:31-35,113-121` |
| Vazio x busca sem resultado | um só estado para cadastro vazio e busca sem resultado ("Ajuste os filtros ou abra um nova OS."), com ponto final no título, sem "Limpar busca e filtros" | `rmas.component.html:113-121` |
| Carregando | `loading() && rmas().length === 0`: ao recarregar uma página vazia, a tabela some e aparece "Carregando ordens de serviço..." | `rmas.component.html:111-112` |
| Banners | erro e sucesso da página em `.status-card` sem `role` | `rmas.component.html:31-41` |
| Colunas | "N item(ns)" no plural fixo (`:155`); o código da OS pode quebrar (sem `nowrap` em `.rma-table-code`, `rmas.component.ts:96-98`); a coluna "Detalhes" tem `title="Abrir"` no ícone (`:171`) | `rmas.component.html:149-171` |
| Garantia por produto | etiqueta por item com SKU, estado só em `.sr-only` e nome do produto só no `title` | `rmas.component.html:161-169` |
| Histórico: título | "Histórico" sozinho não diz que é consulta por lote/série | `rmas.component.html:72` |
| Histórico: rótulos | "Serial" no histórico e na abertura; "Série" no detalhe e em `rmaItemTrackableLabel` (`rma-ui.ts:75-89`) | `rmas.component.html:80,396` |
| Histórico: retorno | "N registro(s) encontrados." (`rmas.component.ts:601`); envio sem lote e sem série (ou só com espaços) limpa tudo em silêncio (`:580-585`); erro em `p.field-error` sem `role` (`rmas.component.html:89-91`); o botão só desabilita, sem texto de andamento (`:85`) | `rmas.component.ts:575-610` |

### Abertura de OS

| Tema | Hoje | Evidência |
| --- | --- | --- |
| Agrupamento | grade plana de 6 colunas; a ordem mistura momentos: cliente, prioridade, nota fiscal, produtos, compra, entrada, falha, acessórios, condição, reparo, peças trocadas, testes | `rmas.component.html:338-476`; grade em `rmas.component.ts:271-297` |
| Subtítulo | "Preencha os dados do atendimento." (frase genérica, achado global 3) | `rmas.component.html:331` |
| Diálogo | sem `role="dialog"`, `aria-modal` e `aria-labelledby` | `rmas.component.html:327` |
| Compra desconhecida | checkbox "Data da compra desconhecida" é outro item da grade, sem relação programática com o campo de compra; o rótulo "Compra" não tem `for` (componente próprio) | `rmas.component.html:420-437` |
| Itens repetidos | cabeçalho "Item N" + botão de texto "Remover" (`.button-secondary`); o cabeçalho ocupa uma linha inteira | `rmas.component.html:372-379`; grade em `rmas.component.ts:295-297` |
| Instrução repetida | placeholder "Informe lote ou serial" nos dois campos de cada item, mais a frase "Cada produto pode ter seu próprio lote ou serial." | `rmas.component.html:367,392,397` |
| Registros retroativos | Reparo, Peças trocadas e Testes no mesmo nível dos dados de recebimento, sem indicar que servem para atendimento já realizado | `rmas.component.html:463-476` |
| Erros | `createRma` grava "Preencha os campos obrigatórios.", "Corrija as datas indicadas no formulário." e a falha do serviço em `pageError`, exibido **na página, atrás da sobreposição do diálogo** | `rmas.component.ts:630,639,681`; `rmas.component.html:31-35` |
| Erros por campo | só datas e identificação do item têm mensagem; cliente, produto e falha relatada obrigatórios não têm; o envio inválido só marca os controles (`markAllAsTouched`) e não leva o foco a nenhum campo; o formulário tem `novalidate` (Angular), então o navegador não revela campos | `rmas.component.ts:628-633`; `rmas.component.html:407-414,429-444` |

### Diagnóstico

| Tema | Hoje | Evidência |
| --- | --- | --- |
| Agrupamento | grade plana: falha encontrada, tipo, causa, data, técnico, notas | `rmas.component.html:502-539` |
| Diálogo | sem `role="dialog"`, `aria-modal`, `aria-labelledby` | `rmas.component.html:491` |
| Contexto | o diálogo mostra só o código; a falha relatada, que o técnico compara com a encontrada, não aparece | `rmas.component.html:493-496` |
| Rótulos | "Data" sem dizer de quê (`:527`); "Notas" no formulário e "Observações" no modal do Kanban (`rma-detail-modal.component.html:79`) | `rmas.component.html:527,537` |
| Erros | obrigatórios e limites (`foundFailure` 2000, `technicianName` 120) sem mensagem por campo e sem `maxlength` no campo; o aviso "Preencha os campos obrigatórios do diagnóstico." e a falha do serviço vão para `pageError`, atrás do diálogo | `rmas.component.ts:467,472,700,729`; `rmas.component.html:505,533` |
| Acesso | botão "Diagnóstico" no cabeçalho do detalhe, igual para registrar e para editar | `rmas.component.html:209-211` |

### Os dois detalhes (lista, seis abas × Kanban, blocos e linha do tempo)

| Fato | Detalhe da lista (`pages/rmas`) | Modal do Kanban (`shared/rma-detail-modal`) |
| --- | --- | --- |
| Título | `h3` com o **cliente** (`rmas.component.html:199`) | `h2` com o **produto** (`productSummary`) e cliente como subtítulo (`rma-detail-modal.component.html:12-13`) |
| Status | `.status-chip[data-status]` no cabeçalho (`:201`) | `span.rma-detail__status` azul fixo na lateral (`:129`; CSS `rma-detail-modal.component.css:47`) |
| Prioridade | `.priority-tag` com barras (`:202`) | `.mini-chip` com `priorityChipClass` (`:140`), sem as barras da decisão 4 |
| SLA | ausente | `app-rma-sla-badge` (`:141`) |
| Impedimento ativo | etiqueta "Bloqueado" sem duração (`:203-205`) | "Bloqueado há X" + motivo (`:25-27`) |
| Nota fiscal | "Não informada" (`:220`) | "—" (`:150`) |
| Compra | "Compra": "Desconhecida" quando marcada (`:222`) | "Data da compra": "Não informada" quando marcada como desconhecida (`:151`), o que confunde "desconhecida" com "não preenchida" |
| Datas do registro | só "Atualizado" (`:224`) | "Criado em" e "Atualizado em" (`:155-160`) |
| Recebido por / rastreio | ausentes (o spec `rmas.component.spec.ts:136-145` garante que "Recebido por" não aparece) | presentes (`:149,152`) |
| Falha relatada | primeira seção da aba Produtos (`:236-239`) | primeiro bloco (`:29-35`) |
| Produtos | seção "Produtos, lotes e garantias" com SKU, nome, estado, Série, Lote, Prazo, Vencimento, Fabricação (`:240-265`) | bloco "Itens" com nome, "SKU · Série · Lote" e estado; **sem prazo nem vencimento** (`:37-53`), embora os dados existam (`core/models.ts:256-267`) |
| Prazo de garantia | "12 meses", e "1 meses" para um mês (`:256`) | ausente |
| Vencimento sem compra | "Informe a compra" (instrução num detalhe só de leitura, `:257`) | ausente |
| Item sem identificação | "Não informada"/"Não informado" por campo (`:254-255`) | "Item sem identificação" (`rma-ui.ts:88`) |
| Recebimento (acessórios, condição física) | **ausente** | bloco "Recebimento" (`:55-66`) |
| Diagnóstico | só Falha encontrada, Tipo, Causa provável (`:269-273`); sem data, técnico e notas | Falha encontrada, Tipo, Causa provável, Técnico, "Observações" (`:68-82`); sem data; bloco some quando não há diagnóstico |
| Falha encontrada vazia | texto vazio | "—" (`:75`) |
| Reparo, peças trocadas, testes | **ausentes** (o dado registrado na abertura não aparece) | bloco "Reparo" com "Resumo do reparo", "Peças substituídas", "Testes" (`:84-96`), rótulos diferentes dos da abertura ("Reparo", "Peças trocadas", "Testes", `rmas.component.html:464-474`) |
| Peças | aba com `app-rma-parts-panel` (`:284-290`) | ausente, sem caminho para chegar |
| Protocolos | aba com `RmaProtocolsComponent` carregado sob demanda (`:291-297`) | ausente, sem caminho para chegar |
| Impedimentos | aba com `app-rma-block-history` (`:298-300`) | botão "Ver impedimentos" que abre `rma-block-panel` (`:22`) |
| Histórico | aba "Histórico" só com **troca de responsável** (`:301-317`); `statusHistory` não aparece | bloco "Atividade" com `statusHistory` e responsável, mais recente primeiro (`rma-detail-modal.component.ts:62-65`), e cada registro de status exibido como "Moveu para <status>" (`:116`) |
| Semântica de `statusHistory` | — | o backend grava em `statusHistory` também **mudança de prioridade com o mesmo status** (`RmaService.java:164-166`) e **nota sem transição** (`RmaService.java:216-221`); "Moveu para" pode comunicar uma movimentação inexistente |
| Responsável vazio no histórico | "Sem responsável" (`:307`) | "ninguém" (`:119`) |
| Itens no total | "N item(ns)" (`:219`) | contagem em `.mini-chip` (`:40`) |

### Specs existentes afetados

| Spec | Linha | Hoje espera | Ação |
| --- | --- | --- | --- |
| `rmas.component.spec.ts` | `:74-82` | "45", "30" e "7" no texto (cartões) | Tarefa 1a: renomear para `shows result indicators from server totals`; esperar "30" e "7" em `.rma-summary`, ausência de `.stat-card` e de "nesta página"; o "45" sai (a lista dessa montagem tem `totalElements` 0 e o total vai para o título pela lista) |
| `rmas.component.spec.ts` | `:136-145` | detalhe com "Nota fiscal"/"NF-123" e **sem** "Recebido por" | **Não alterar**; preservação. O contrato mantém "Recebido por" fora do detalhe da lista (ver "Diferenças mantidas") |
| `rmas.component.spec.ts` | `:210` | `.page-heading .button-primary` abre a criação | Continua válido: `app-page-header` mantém `.page-heading` e projeta o botão |
| `rmas.component.spec.ts` | `:214` | `.rma-details__header-actions .button-primary` abre o diagnóstico | Continua válido: a classe e o contêiner ficam; só o texto muda (Tarefa 3) |
| `rmas.component.spec.ts` | `:252` | `.modal-overlay .form-actions--full .button-secondary` é Cancelar | Manter `form-actions form-actions--full` com Cancelar como primeiro `.button-secondary`; "Adicionar produto" e "Limpar" não podem ficar dentro desse rodapé |
| `rmas.component.spec.ts` | `:314,347` | `.status-card h3` com a mensagem de erro | Trocar por um auxiliar `editorFeedback(mode)`: para `create` (Tarefa 2a) e depois para `diagnosis` (Tarefa 3), `[role="dialog"] [role="alert"]` |
| `rmas.component.spec.ts` | `:220-247` | `[formControlName="..."]` dentro de `.modal-overlay`; opção "SKU-2 · Produto" | Continua válido: nomes de controle e rótulo das opções não mudam |
| `rmas.component.spec.ts` | `:202,276` | `expectOne('/api/rmas/summary')` uma vez por carga | Continua válido: o contrato do resumo mantém uma requisição por carga; com `switchMap`, uma requisição ainda pendente pode aparecer como `cancelled` — nenhum desses testes deixa duas pendentes |
| `kanban.component.spec.ts` | `:227-285` | abrir/fechar o modal, Escape coberto, "Alterar status", "responsável", "Ver impedimentos" | **Não alterar** os testes; só acrescentar `provideRouter([])` aos `providers` (`:26-65`) na Tarefa 4C, porque o modal passa a ter `routerLink`. O mock de perfil autoriza tudo (`:29`); a matriz por perfil vai para spec novo |
| `rma-ui.spec.ts` | todo | rótulos existentes | Manter; acrescentar `itemCountLabel` e a preservação de `productSummary`/`trackableLabel` com vários itens (Tarefa 1a) |

## Decisão de indicadores (decisão 3 aplicada à lista de ordens de serviço)

| Indicador | Hoje | Destino | Motivo |
| --- | --- | --- | --- |
| ordens de serviço encontradas | cartão com `summary.total` | Contagem no título ("45 ordens de serviço"), a partir de `totalElements` da lista exibida | O resumo usa o mesmo filtro da lista, então os dois números são iguais; não existe denominador independente do filtro sem nova requisição, logo **não há "X de Y"** nesta tela |
| Em atendimento | cartão "(nesta página)" | Linha compacta `.rma-summary` na barra: "No resultado: 30 em atendimento · 7 com prioridade alta" | Não é reproduzível por filtro (o filtro de status escolhe uma etapa só); é calculado sobre todo o resultado, então o texto passa a dizer isso |
| Prioridade alta | cartão "(nesta página)" | Mesma linha | Não há filtro de prioridade na lista; orienta a triagem |
| Todos | zeros antes da primeira resposta ou após falha inicial; resumo antigo após falha posterior ou fora de ordem | Ocultos enquanto não houver resumo **do mesmo filtro da lista exibida**, se o resumo falhar ou se a lista estiver em falha | Zero ou número de outro filtro não pode parecer dado |

`getSummary` continua sendo chamado nos mesmos momentos (carga inicial, "Buscar", "Limpar", nova tentativa, após criar ou diagnosticar), com o **filtro confirmado**. Não se cria endpoint nem requisição adicional por carga.

## Contrato de informação dos dois detalhes

Implementado em `core/utils/rma-detail.ts` (Tarefa 4A). Cada fato tem um rótulo e uma formatação; cada detalhe decide **onde** o mostra com a própria marcação.

| Ordem | Seção (rótulo) | Fatos e formatação | Lista (aba) | Kanban (bloco) |
| --- | --- | --- | --- | --- |
| 1 | Falha relatada | texto integral | Produtos | 1º bloco (como hoje) |
| 2 | Produtos | por item: nome, SKU, Série (ou "Não informada"), Lote (ou "Não informado"), Fabricação (só se houver), estado da garantia (`warrantyLabel` + `warrantyClass`), Prazo de garantia ("1 mês"/"N meses"), Vencimento (data ou "Sem data da compra"); total "1 item"/"N itens" | Produtos; nota "Garantia avaliada na entrada da OS." mantida | bloco "Produtos" (era "Itens"), mesma lista `<li>` |
| 3 | Recebimento | Acessórios, Condição física (só os preenchidos; seção oculta sem nenhum) | Produtos (nova seção, depois de Produtos) | bloco "Recebimento" (como hoje) |
| 4 | Diagnóstico | Falha encontrada (ou "Não informada"), Tipo (`failureTypeLabel`), Causa provável (`failureCauseLabel`), Data do diagnóstico, Técnico (ou "Não informado"), Notas (só se houver); sem diagnóstico: "Sem diagnóstico registrado." | Diagnóstico (a lista mantém o CTA por perfil) | bloco "Diagnóstico", agora também quando vazio, sem CTA |
| 5 | Reparo e testes | Reparo, Peças trocadas, Testes (rótulos da abertura; só os preenchidos; seção oculta sem nenhum) | Diagnóstico (nova seção, depois do diagnóstico) | bloco "Reparo e testes" (era "Reparo") |
| 6 | Peças | painel existente | aba Peças (inalterada) | link "Abrir OS na lista" para `/rmas?rma=<id>`; o destino abre o detalhe na aba Produtos, e Peças fica a um clique na aba existente |
| 7 | Protocolos | painel existente | aba Protocolos (inalterada) | mesmo link; idem |
| 8 | Impedimentos | ativo: "Bloqueado há X" + motivo; histórico no componente existente | cabeçalho com "Bloqueado há X"; aba Impedimentos (inalterada) | linha atual + "Ver impedimentos" (inalterados) |
| 9 | Histórico | registros de status e mudanças de responsável, mais recente primeiro; autor e instante em todos; registro de status como **"Status registrado: <status>"** com a nota, quando houver; mudança de responsável como "<origem> → <destino>", com "Sem responsável" quando nulo. **Não inferir transição nem origem** para registros de status | aba Histórico (passa a incluir os registros de status) | bloco "Histórico" (era "Atividade"); "Moveu para" sai |

Propriedades da OS (mesmos rótulos e valores nos dois): **Status** (`statusLabel` em `.status-chip[data-status]`), **Prioridade** (`priorityLabel` em `.priority-tag[data-priority]` com barras), **Responsável** (`ownerLabel` + avatar), **SLA** (`app-rma-sla-badge`), **Entrada** (data), **Nota fiscal** (valor ou "Não informada"), **Compra** ("Desconhecida" quando marcada; "Não informada" quando vazia; senão a data), **Atualizado em** (data e hora). Título do detalhe: produto (`productSummary`) com o cliente abaixo, nos dois.

**Diferenças mantidas, de propósito:** "Recebido por", rastreio e "Criado em" continuam só no Kanban (o spec `rmas.component.spec.ts:136-145` protege a ausência de "Recebido por" na lista; eventual ampliação vai ao backlog). A lista mantém o CTA de diagnóstico; o Kanban não ganha ação de diagnóstico.

**Por que funções e não pipes:** o projeto expõe formatadores como membros (`protected readonly statusLabel = statusLabel`, `rmas.component.ts:382-395`; `rma-detail-modal.component.ts:49-61`); funções puras seguem esse padrão, são testáveis sem `TestBed` e não exigem importar pipes nos dois componentes.

## Contrato de estados da lista (Tarefa 1a e 1b)

Reaproveita o de clientes (`clients.component.ts:58,66-73,87,126-128`; `clients.component.html:50-76`) e acrescenta a coordenação com o resumo, toda no componente:

- **Filtro confirmado.** `private readonly appliedFilters = signal<RmaListFilters>({})`, com `RmaListFilters = { query?: string; status?: RmaStatus }`. Gravado só por `submitFilters()` (a partir de `buildFilters()`), zerado por `clearFilters()` e após criar uma OS (onde o formulário já é zerado, `rmas.component.ts:675`). O `fetch` da lista e o resumo leem `appliedFilters()`; `goToPage`, `changePageSize`, `refreshRmas` e `retryLoad` não leem o formulário. `protected readonly hasActiveFilters = computed(() => Boolean(this.appliedFilters().query || this.appliedFilters().status))`.
- **Filtro do resultado exibido.** O `fetch` grava em `private requestedFilters` o valor de `appliedFilters()` no instante da requisição; o `onLoaded` copia esse valor para `private readonly resultFilters = signal<RmaListFilters | null>(null)`, faz `loadFailed.set(false)` e continua chamando `syncSelection`. Como `PagedList` usa `switchMap` (`paged-list.ts:24-37`), só a resposta da requisição mais recente chega ao `onLoaded`.
- **Falha da lista.** `protected readonly loadFailed = signal(false)` e `protected readonly listErrorMessage = signal('')`, gravados pelo `onError`; `pageError` deixa de receber a falha da lista.
- **Resultado atual.** `protected readonly hasCurrentResult = computed(() => this.rmaList.result() !== null && !this.loadFailed() && sameFilters(this.resultFilters(), this.appliedFilters()))`. Depois de "Buscar" ou "Limpar", fica falso até a lista do novo filtro responder (a tabela anterior continua visível com `loading()`, mas sem contagem e sem indicadores). `hasLoaded = computed(() => this.rmaList.result() !== null)` continua servindo à precedência dos estados.
- **Resumo assíncrono.** `private readonly summaryRequests = new Subject<RmaListFilters>()` com `switchMap` (inscrito no construtor com `takeUntilDestroyed`): cada emissão **invalida** o resumo anterior (`summary.set(null)`) e **cancela** a assinatura anterior; a resposta grava `summary.set({ filters, value })`; o erro grava `null`, sem `pageError`, e não encerra o fluxo (`catchError` dentro do `switchMap`). `loadSummary()` passa a ser `summaryRequests.next(this.appliedFilters())`.
- **Exibição.** Contagem do cabeçalho: `hasCurrentResult() ? totalElements() : null`. Indicadores: só quando `hasCurrentResult()` e `summary()?.filters` igual a `resultFilters()`. Nenhuma combinação de lista de um filtro com resumo de outro chega à tela.

Precedência no corpo da tabela:

1. `loadFailed()` → `.empty-state` com `role="alert"`, ícone `alert`, título "Não foi possível carregar as ordens de serviço.", detalhe `listErrorMessage()` quando diferente do título, botão "Tentar novamente" ("Carregando..." e desabilitado enquanto `loading()`). Substitui tabela e paginação.
2. `loading() && !hasLoaded()` → "Carregando ordens de serviço...".
3. Vazio sem filtro aplicado → "Nenhuma OS registrada", "Abra a primeira OS para iniciar o atendimento." e "Nova OS" só com `canOpenRma()` (para os outros perfis, sem botão).
4. Vazio com filtro aplicado → "Nenhuma OS encontrada", "Ajuste a busca ou o status." e "Limpar busca e filtros".
5. Tabela e paginação.

`retryLoad()` chama `rmaList.reload()` e `loadSummary()` (mesmo filtro confirmado, mesma página e tamanho). O padrão `searchChanges` das etapas 2 e 3 **não se aplica**: a busca de ordens de serviço é por envio, sem debounce, e assim permanece; `clearFilters()` gera exatamente uma requisição de lista e uma de resumo. `pageError` fica para permissão, falha de clientes/produtos e link de notificação, em banner com `role="alert"`; `pageMessage` com `role="status"`.

## Review Focus

1. **Lista, resumo e filtro confirmado.** Lista e indicadores nunca mostram filtros diferentes, em qualquer ordem de resposta (B antes de A, A depois de B, erro antigo depois de sucesso novo); a contagem some depois de "Buscar" até a lista do novo filtro responder e antes da primeira resposta; paginar, trocar o tamanho, atualizar após salvar e tentar de novo usam o filtro confirmado, nunca a busca ou o status não enviados; "Limpar" gera uma requisição de lista na página 0 e uma de resumo; a linha de indicadores nunca diz "nesta página"; não existe "X de Y" (Tarefa 1a).
2. **Payloads, validadores e obrigatoriedade da abertura e do diagnóstico.** Mover campos para `fieldset.form-section` e Reparo/Peças trocadas/Testes para um `<details>` recolhido não desabilita, remove nem recria controles; `formArrayName="items"` e `[formGroupName]="index"` ficam; o payload completo, enviado pelo formulário com o grupo fechado, é idêntico ao de hoje; um controle inválido dentro do grupo fechado abre o grupo, mostra a mensagem e recebe o foco (Tarefas 2a, 2b e 3).
3. **Mensagens dentro do diálogo.** Erros de abertura e diagnóstico (obrigatórios, datas, falha do serviço) aparecem em `[role="dialog"] [role="alert"]`; permissão negada, falha de clientes/produtos e link de notificação continuam no banner da página; a mensagem some ao reabrir, ao reenviar depois de corrigir e ao iniciar nova tentativa; Cancelar e fechar continuam desabilitados durante o envio (`rmas.component.spec.ts:290-350`, só com o seletor trocado) (Tarefas 2a e 3).
4. **Harmonizar sem trocar estrutura nem inventar fatos.** Seis abas na mesma ordem e com os mesmos rótulos; nenhum `role="tablist"` no modal; "Recebido por" continua fora da lista; registros de status aparecem como "Status registrado", sem inferir transição; `productSummary`/`trackableLabel` mantêm a saída (card do Kanban, `rma-kanban-board.component.html:59`); o link "Abrir OS na lista" navega de fato para `/rmas?rma=<id>`, que abre o detalhe na aba Produtos, e fica inativo com `disabled()`; o `routerLink` exige `provideRouter([])` nos specs do Kanban (Tarefas 4A–4C).
5. **Permissões por perfil.** Matriz: abertura `ADMIN`/`SERVICE_DESK`; diagnóstico, reservas e protocolos `ADMIN`/`TECHNICIAN`; status no Kanban `ADMIN`/`SERVICE_DESK`/`TECHNICIAN`; responsável `ADMIN`/`SERVICE_DESK`; impedimentos editáveis pelos três operacionais; `VIEWER` só consulta. Testes para os quatro perfis cobrem botões **e** chamadas diretas negadas a `createRma()` e `saveDiagnosis()` sem chamada ao serviço; no Kanban, o componente pai é parametrizado por perfil e os inputs entregues ao modal são conferidos (Tarefas 1b, 2a, 3, 4C).

---

### Task 1a: Lista — estado, filtro confirmado e resumo coerente

**Files:**
- Modify: `frontend/src/app/pages/rmas/rmas.component.html` (`:2-29`: cabeçalho e cartões, trocados pelo cabeçalho compartilhado e pela linha de indicadores)
- Modify: `frontend/src/app/pages/rmas/rmas.component.ts` (imports `:1-58`; sinais `:343-380`; `submitFilters`/`goToPage`/`changePageSize`/`clearFilters` `:502-528`; sucesso de `createRma` `:675`; `loadWorkspace`/`refreshRmas`/`loadSummary` `:751-781`; `buildFilters` `:873-881`)
- Modify: `frontend/src/app/core/utils/rma-ui.ts` (nova função `itemCountLabel`)
- Modify: `frontend/src/app/core/utils/rma-ui.spec.ts`
- Modify: `frontend/src/app/pages/rmas/rmas.component.spec.ts` (`:74-82`)
- Create: `frontend/src/app/pages/rmas/rmas.component.list.spec.ts`
- Create: `frontend/src/app/testing/rma-fixtures.ts` (fábricas `buildRma(overrides)` e `buildRmaItem(overrides)`, só dados, sem globais de teste; usadas pelos specs desta etapa)

**Interfaces:**
- Consumes: `PageHeaderComponent` (`shared/page-header/page-header.component.ts:22-42`), `PagedList` (`result`, `reload`, `firstPage`, `onLoaded`).
- Produces em `rmas.component.ts`: `appliedFilters`, `requestedFilters`, `resultFilters`, `hasActiveFilters`, `loadFailed`, `listErrorMessage`, `hasLoaded`, `hasCurrentResult`, `summary` (`Signal<{ filters: RmaListFilters; value: RmaSummaryResponse } | null>`), `summaryRequests`, `retryLoad(): void`, função de módulo `sameFilters(a, b)`; remover `totalRmas`/`ongoingRmas`/`highPriorityRmas`. Contrato completo em "Contrato de estados da lista".
- Produces em `rma-ui.ts`: `export function itemCountLabel(count: number): string` → `'1 item'`, `'2 itens'`, `'0 itens'`.
- Template: `<app-page-header heading="ordens de serviço" singular="OS" plural="ordens de serviço" [count]="hasCurrentResult() ? totalElements() : null">` com "Nova OS" projetado só com `canOpenRma()`; sem `[total]`. Os cartões `:13-29` saem; no lugar, provisoriamente logo abaixo do cabeçalho (a Tarefa 1b a move para a barra), `@if (visibleSummary(); as s) { <p class="rma-summary">No resultado: <strong>{{ s.ongoing }}</strong> em atendimento · <strong>{{ s.highPriority }}</strong> com prioridade alta</p> }`, com `visibleSummary` = `computed` da regra de exibição. O resto da página (painéis de filtro e histórico, estados da tabela, banners) muda na 1b e na 1c.

- [ ] **Step 1: Escrever os testes.**
  *Comportamento novo (devem falhar antes; asserção que reprova hoje entre parênteses)*, em `rmas.component.list.spec.ts`, com serviços falsos como em `rmas.component.spec.ts:20-46` e `hasAnyRole: (roles) => roles.includes(role)`:
  - `shows the count next to the title and no statistics cards` (`.page-heading__count` "45 ordens de serviço" — hoje não existe; e `.stat-card` ausente — hoje há três).
  - `uses the singular for one OS` ("1 OS" no cabeçalho — hoje ausente).
  - `shows indicators scoped to the whole result` (`.rma-summary` com "No resultado", "30" e "7" — hoje ausente; e o texto da página **não** contém "nesta página" — hoje contém).
  - `shows no count and no indicator values before the first responses` (`list` e `getSummary` como `Subject` não emitidos: sem `.page-heading__count` e o texto da página não contém "0 ordens de serviço" nem "Prioridade alta" acompanhado de "0" — hoje os cartões mostram "0"; só então emitir e ver "45 ordens de serviço" e os valores).
  - `hides stale indicators when a later summary fails` (sucesso com 30/7; "Buscar" com outro texto; `getSummary` em erro; lista do novo filtro responde: o texto da página não contém "30" nem "7" — hoje o último resumo fica na tela — e não há `[role="alert"]` com "resumo").
  - `never shows the summary of filter A next to the list of filter B` (A confirmado e respondido; "Buscar" B; lista B responde antes do resumo B: sem `.rma-summary` e sem os valores de A; resumo B responde: valores de B — hoje os valores de A ficam até o resumo B).
  - `discards a late summary of filter A after B was requested` (resumos como `Subject` por chamada: B responde, depois A responde: a tela mantém os valores de B — hoje A sobrescreve B; e a assinatura de A foi encerrada: `observed` do `Subject` de A é `false`).
  - `ignores a late error of filter A after B succeeded` (B responde; o `Subject` de A emite erro: os valores de B continuam — hoje um erro tardio grava `pageError`).
  - `hides the count after Buscar until the new list responds` (com A exibido, "Buscar" B com lista pendente: sem `.page-heading__count` — hoje a contagem antiga ficaria até a resposta).
  - `keeps the confirmed text filter when paging and changing size` (digitar "abc" sem enviar; `goToPage(1)` e `changePageSize(50)`: chamadas com `query: undefined` — hoje vão com `'abc'`).
  - `keeps the confirmed status when paging` (trocar o status no formulário para `TRIAGE` sem enviar; `goToPage(1)`: `status: undefined` — hoje vai `'TRIAGE'`).
  - `refreshes with the confirmed filter after saving a diagnosis` (confirmar `query: 'x'`; digitar "y" sem enviar; salvar diagnóstico com sucesso: a recarga de `list` e de `getSummary` vai com `query: 'x'` — hoje vai `'y'`).
  - Em `rma-ui.spec.ts`: `formats item counts` (`itemCountLabel(1)` "1 item", `(2)` "2 itens", `(0)` "0 itens" — hoje a função não existe: vermelho de compilação, relatar à parte).
  - Ajustar `rmas.component.spec.ts:74-82` conforme "Specs existentes afetados".
  *Preservação (passam antes e depois):* `sends query and status on Buscar and resets to page 0` (parâmetros de `list` e `getSummary` iguais aos de hoje); `clears to one list request on page 0 and one summary request` (com o formulário preenchido e enviado, "Limpar" → `list` uma vez `{ page: 0, size: 20, query: undefined, status: undefined }` e `getSummary` uma vez `{ query: undefined, status: undefined }`); `falls back to the last page when the current one empties` (recuo de `PagedList`); `opens the OS requested by a notification link on the Produtos tab` (`ActivatedRoute` com `?rma=1` → `getById(1)`, detalhe aberto e aba "Produtos" com `aria-selected="true"`); em `rma-ui.spec.ts`, `keeps productSummary and trackableLabel for several items` ("Produto A + 1 item(ns)" e "Série S1 · Lote L1 + 1 item(ns)").
- [ ] **Step 2: Rodar e ver falhar.** `npm --prefix frontend test -- --watch=false --runner-config 'C:\Users\joseh\AppData\Local\Temp\vitest-runner.config.mjs'`. Esperado: se o import de `itemCountLabel` abortar a compilação, relatar isso e não afirmar nada sobre os demais; se compilar (por exemplo, com o teste de `itemCountLabel` executado depois), FAIL nos de comportamento novo e no ajustado, PASS nos de preservação.
- [ ] **Step 3: Implementar** o contrato de estados (sem os estados do corpo da tabela, que são da 1b), `itemCountLabel`, as fábricas e o cabeçalho de **Interfaces**.
- [ ] **Step 4: Rodar e ver passar.** Mesmo comando. Esperado: PASS na suíte inteira, inclusive o ciclo dos editores em `rmas.component.spec.ts:173-359`.
- [ ] **Step 5: Commit.** `git add` dos arquivos de **Files**; mensagem: `feat(rmas): filtro confirmado, contagem no título e indicadores coerentes com o resultado (NAV-98)`.

### Task 1b: Lista — composição: barra comum, estados e tabela

**Files:**
- Modify: `frontend/src/app/pages/rmas/rmas.component.html` (`:31-69` banners e painel de filtros; `:110-188` tabela e estados)
- Modify: `frontend/src/app/pages/rmas/rmas.component.ts` (`.rma-table-code` `:96-98`; CSS local)
- Modify: `frontend/src/app/pages/rmas/rmas.component.list.spec.ts`

**Interfaces:**
- Consumes: tudo da 1a; classes `.catalog-toolbar--filters`, `.search-field`, `.filter-field`, `.empty-state`, `.icon-tile`.
- Template:
  - `<section class="panel catalog-toolbar catalog-toolbar--filters">` com o `form [formGroup]="filtersForm" (ngSubmit)="submitFilters()"`: `label.search-field` "Busca" (rótulo atual, distinto do botão "Buscar") com `input type="search" formControlName="query"` e placeholder "Cliente, OS, lote ou série"; `label.filter-field` "Status" com o `app-custom-select` atual; ações "Limpar" (`button-secondary`, `type="button"`) e depois "Buscar" (`button-primary`, `type="submit"`). A linha `.rma-summary` da 1a passa para a direita da barra.
  - Banners: `pageError` mantém `article.status-card.panel` com `h3` e ganha `role="alert"`; `pageMessage` mantém `.status-card.success-card` e ganha `role="status"`. A marcação fica igual porque os specs de ciclo dos editores leem `.status-card h3` até as Tarefas 2a e 3.
  - Corpo da tabela pela precedência do contrato; `.rma-table-code { white-space: nowrap; }`; subtítulo do produto com `itemCountLabel(rma.items.length)`; colunas, linha clicável e paginação inalteradas.
  - O painel de histórico fica no lugar até a 1c; o `two-column-grid` sai na 1c.
  - CSS local: `.rma-summary` (`margin: 0; margin-left: auto; color: var(--muted); font-size: var(--font-size-md)`; `strong` em `var(--text)`).

- [ ] **Step 1: Escrever os testes.**
  *Comportamento novo:*
  - `uses the shared toolbar with Limpar before Buscar` (`.catalog-toolbar--filters` contém busca e status; "Limpar" precede "Buscar" — hoje "Buscar" vem antes; sem "registro(s)" na barra — hoje há).
  - `shows the failure state on an initial load error` (`list` em erro antes de criar: `[role="alert"]` com "Não foi possível carregar as ordens de serviço." e "Tentar novamente" — hoje o banner não tem `role` e o texto é outro; e **não** contém "Nenhuma OS encontrada" — hoje contém; sem `app-pagination`).
  - `replaces the table when a reload fails after a success with records` e `... after an empty success` (falha em `goToPage(1)`: o alerta acima aparece e o `tbody` some — hoje a tabela anterior fica).
  - `recovers with Tentar novamente using the confirmed filter and page` (filtro confirmado e página 1; falha; restaurar; clicar: última chamada com o mesmo filtro e página e `getSummary` chamado de novo — hoje não existe o botão).
  - `distinguishes an empty registry from a search without results` (sem filtro e vazio: "Nenhuma OS registrada" — hoje "Nenhuma OS encontrada."; com filtro confirmado e vazio: "Nenhuma OS encontrada", "Ajuste a busca ou o status." e "Limpar busca e filtros" — hoje ausente; clicar gera **uma** chamada de `list` na página 0 sem filtros e uma de `getSummary`).
  - `keeps the table while reloading a page` (com resultado exibido, `goToPage(1)` pendente: `tbody` continua — hoje aparece "Carregando ordens de serviço..." se a página atual estiver vazia; usar resultado vazio filtrado para reprovar).
  - `keeps OS codes on one line and counts products with singular and plural` ("1 item", "2 itens" — hoje "1 item(ns)").
  *Preservação:* `opens the detail by click, Enter and Space on a row`; `changes page and page size through the pagination` (com o filtro confirmado); `keeps warranty per product with an accessible status` (SKU e `.sr-only` "· Em garantia"); `shows Nova OS only for ADMIN and SERVICE_DESK` (quatro perfis, no cabeçalho e no estado vazio).
- [ ] **Step 2: Rodar e ver falhar.** Esperado: FAIL nos de comportamento novo; PASS nos de preservação.
- [ ] **Step 3: Implementar** conforme **Interfaces**.
- [ ] **Step 4: Rodar e ver passar.** Esperado: PASS na suíte inteira.
- [ ] **Step 5: Commit.** `git add` dos arquivos de **Files**; mensagem: `feat(rmas): barra comum, estados distintos e tabela legível na lista (NAV-98)`.

### Task 1c: Consulta de histórico por lote ou série

**Files:**
- Modify: `frontend/src/app/pages/rmas/rmas.component.html` (`:43,71-108`)
- Modify: `frontend/src/app/pages/rmas/rmas.component.ts` (`searchHistory` `:575-610`)
- Create: `frontend/src/app/pages/rmas/rmas.component.history.spec.ts`

**Interfaces:**
- Consumes: `historyForm`, `rmaService.history`, `selectHistoryItem`, `normalizeText` (inalterados).
- Produces: `searchHistory()` com as mensagens abaixo; parâmetros e normalização idênticos.
- Template: `<section class="panel form-panel rma-history" aria-labelledby="rma-history-title">`, logo abaixo da barra, largura total (sai o `two-column-grid`), título `h2#rma-history-title` "Histórico por lote ou série"; rótulo "Série" no lugar de "Serial" (`formControlName` inalterado); botão "Consultar"/"Consultando..."; erro em `p.field-error` com `role="alert"`; mensagem em `p.muted-inline` com `role="status"`: "1 OS encontrada", "N ordens de serviço encontradas", "Nenhuma OS encontrada para este lote ou série."; envio vazio ou só com espaços mostra "Informe o lote ou a série.", continua sem requisição e limpando os resultados anteriores; resultados como hoje.

- [ ] **Step 1: Escrever os testes.**
  *Comportamento novo:*
  - `labels the history panel and its fields` ("Histórico por lote ou série" e "Série" — hoje "Histórico" e "Serial").
  - `reports results with the right plural` (1, 2 e 0 resultados → "1 OS encontrada", "2 ordens de serviço encontradas", "Nenhuma OS encontrada para este lote ou série." — hoje "1 registro(s) encontrados." e "Nenhum histórico encontrado.").
  - `announces a history error` (`[role="alert"]` dentro de `.rma-history` — hoje sem `role`).
  - `asks for a batch or serial on an empty submit` ("Informe o lote ou a série." — hoje nenhum texto).
  - `shows progress while consulting` (com `Subject` pendente, botão "Consultando..." desabilitado — hoje o texto continua "Consultar").
  *Preservação:* `sends normalized parameters for batch, serial and both` (`'  L1  '` → `{ batchNumber: 'L1', serialNumber: undefined }`; série só; ambos); `does not call the service for blank input and clears previous results` (resultados exibidos, depois envio só com espaços: `history` não chamado e lista vazia); `opens the selected result in the detail` (clicar no segundo resultado abre o detalhe com o código **dele**).
- [ ] **Step 2: Rodar e ver falhar.** Esperado: FAIL nos de comportamento novo; PASS nos de preservação.
- [ ] **Step 3: Implementar.**
- [ ] **Step 4: Rodar e ver passar.** Esperado: PASS na suíte inteira.
- [ ] **Step 5: Commit.** `git add` dos arquivos de **Files**; mensagem: `feat(rmas): histórico por lote ou série identificado e com retorno claro (NAV-98)`.

### Task 2a: Abertura — mensagens e validação no diálogo

**Files:**
- Modify: `frontend/src/app/pages/rmas/rmas.component.html` (`:325-337` cabeçalho do diálogo; mensagens junto dos campos atuais em `:339-476`)
- Modify: `frontend/src/app/pages/rmas/rmas.component.ts` (`openCreateModal` `:530-539`; `createRma` `:622-684`; novos sinais e métodos)
- Modify: `frontend/src/app/pages/rmas/rmas.component.spec.ts` (`:314,347`, só no modo `create`)
- Create: `frontend/src/app/pages/rmas/rmas.component.create.spec.ts`

**Interfaces:**
- Produces em `rmas.component.ts`:
  - `protected readonly createErrorMessage = signal('')` — recebe as três mensagens hoje gravadas em `pageError` por `createRma` (`:630,639,681`); limpo em `openCreateModal()` e no início de cada envio. A mensagem de permissão (`:532,624-626`) continua em `pageError`.
  - `protected readonly createSubmitAttempted = signal(false)` — `true` em envio inválido; `false` ao abrir e após sucesso.
  - `protected showCreateError(control: AbstractControl): boolean` — `control.invalid && (control.touched || this.createSubmitAttempted())`.
  Mensagens (só para validadores existentes):

  | Controle | Erro | Mensagem |
  | --- | --- | --- |
  | `clientId` | `min`/`required` | "Selecione o cliente." |
  | `items[i].productId` | `min`/`required` | "Selecione o produto." |
  | `items[i].batchNumber`, `items[i].serialNumber` | `maxlength` (validador Angular de 60) | "Use até 60 caracteres." |
  | `reportedFailure` | `required` | "Descreva a falha relatada." |
  | `repairSummary`, `replacedPartsSummary` | `maxlength` | "Use até 600 caracteres." |
  | `testSummary` | `maxlength` | "Use até 800 caracteres." |
  | item | `identificationRequired` | "Informe ao menos o lote ou a série deste produto." (texto atual, `:413`, trocando "serial" por "série") |

- Template: `article` com `role="dialog" aria-modal="true" aria-labelledby="rma-create-title"`; `h3#rma-create-title` "Nova OS"; sem o subtítulo `:331`; `@if (createErrorMessage())` → `<article class="panel alert-banner alert-banner--error modal-feedback" role="alert">` no topo do formulário (padrão `clients.component.html:177`); `<small class="field-error">` junto de cada campo da tabela. Layout atual mantido nesta tarefa.

- [ ] **Step 1: Escrever os testes.**
  *Comportamento novo*, em `rmas.component.create.spec.ts`:
  - `marks the creation dialog for assistive technology` (`role="dialog"`, `aria-modal="true"`, `aria-labelledby` → "Nova OS" — hoje ausentes; sem "Preencha os dados do atendimento" — hoje presente).
  - `shows required-field errors and the banner inside the dialog after an invalid submit` ("Selecione o cliente.", "Selecione o produto.", "Descreva a falha relatada." e `[role="dialog"] [role="alert"]` "Preencha os campos obrigatórios." — hoje a mensagem vai para `.status-card` fora do diálogo; `create` não chamado).
  - `shows length errors for batch and serial` (61 caracteres por `setValue`: "Use até 60 caracteres." — hoje sem mensagem).
  - `shows date errors with the banner inside the dialog` ("Corrija as datas indicadas no formulário." dentro do diálogo — hoje fora).
  - `shows the save error inside the dialog and keeps the values` (`create` em `throwError`).
  - `clears the dialog message on reopen, on a corrected resubmit and on a new pending attempt` (mensagem visível → fechar e reabrir: sem alerta; inválido → corrigir e reenviar com `Subject` pendente: sem alerta durante o envio; falha → nova tentativa pendente: sem alerta — hoje a mensagem fica em `pageError`).
  - Em `rmas.component.spec.ts`, criar `editorFeedback(mode)`: `create` lê `[role="dialog"] [role="alert"]`; `diagnosis` continua em `.status-card h3` até a Tarefa 3; usar em `:314,347`.
  *Preservação:* `denies createRma to TECHNICIAN and VIEWER without calling the service` (chamada direta com formulário válido: `create` não chamado e `pageError` "Seu perfil não pode abrir novas ordens de serviço."; para `ADMIN` e `SERVICE_DESK`, chamado); `keeps required and length rules for every field` (`clientId` 0, `entryDate` '', `reportedFailure` '' e `priority` '' inválidos — prioridade só por `required`; `invoiceNumber`, `purchaseDate`, `receivedAccessories`, `physicalCondition`, `repairSummary`, `replacedPartsSummary`, `testSummary` vazios válidos; limites por `setValue`: `reportedFailure` 1001, `receivedAccessories`/`physicalCondition` 501, `repairSummary`/`replacedPartsSummary` 601, `testSummary` 801, lote/série 61 → `maxlength`); os testes existentes `:51-134`; o ciclo pendente `:290-350` no modo `create`.
- [ ] **Step 2: Rodar e ver falhar.** Esperado: FAIL nos de comportamento novo e nos dois testes de `:314,347` em modo `create`; PASS nos de preservação.
- [ ] **Step 3: Implementar.** Não alterar `createForm`, `createRmaItemForm`, `validateCreateDates`, `resetCreateForm` nem o payload.
- [ ] **Step 4: Rodar e ver passar.** Esperado: PASS na suíte inteira.
- [ ] **Step 5: Commit.** `git add` dos arquivos de **Files**; mensagem: `feat(rmas): mensagens da abertura por campo e dentro do diálogo (NAV-98)`.

### Task 2b: Abertura — seções por momento do atendimento

**Files:**
- Modify: `frontend/src/app/pages/rmas/rmas.component.html` (`:338-484`)
- Modify: `frontend/src/app/pages/rmas/rmas.component.ts` (CSS `:106-112,195-223,266-327`; `createRma` só para abrir o grupo e focar; sinal novo)
- Modify: `frontend/src/app/pages/rmas/rmas.component.create.spec.ts`

**Interfaces:**
- Consumes: tudo da 2a; `RowActionComponent` (`label` + `target` formam o nome acessível); `expectCancelBeforePrimary` (`testing/dialog-actions.ts`).
- Produces em `rmas.component.ts`: `protected readonly retroactiveOpen = signal(false)`, ligado a `<details [open]="retroactiveOpen()" (toggle)="retroactiveOpen.set($any($event.target).open)">`; em envio inválido, se `repairSummary`, `replacedPartsSummary` ou `testSummary` estiver inválido, `retroactiveOpen.set(true)` e, depois da renderização (`afterNextRender` com o `Injector` do componente), foco no primeiro desses campos inválido. Volta a `false` em `resetCreateForm()`. **Recolher não desabilita, remove nem recria controles:** o `<details>` só oculta a apresentação; os três controles ficam sempre no DOM e no `FormGroup`.
- Template (mesmo `form [formGroup]="createForm" (ngSubmit)="createRma()"`, classes `form-grid rma-create-form`):
  - `fieldset.form-section` **Atendimento**: Cliente | Prioridade; Falha relatada (largura total, `maxlength="1000"`).
  - `fieldset.form-section` **Produtos e identificação**: `p.muted-inline` "Informe o lote, a série ou os dois para cada produto." (uma vez; saem os placeholders `:392,397` e a frase `:367`); contêiner com `formArrayName="items"`; cada item com `[formGroupName]="index"` é uma linha `div.rma-item-editor.rma-item-editor--row` com `role="group"` e `[attr.aria-label]="'Produto ' + (index + 1)"`: Produto | Lote | Série | Fabricação | ação; a ação, só com mais de um item, é `<button appRowAction icon="trash" tone="danger" label="Remover produto" [target]="'' + (index + 1)" (click)="removeCreateItem(index)">` (nome "Remover produto 2"); erros na linha de baixo; "Adicionar produto" (texto) depois das linhas. IDs `batchNumber-i`/`serialNumber-i` e `ariaLabel` dos componentes mantidos.
  - `fieldset.form-section.rma-create-form__receipt` **Recebimento** (6 colunas): Nota fiscal (`col-2`) | grupo Compra (`col-2`) | Entrada (`col-2`); Acessórios (`col-3`) | Condição física (`col-3`). O grupo Compra é `div.field-group.rma-purchase` com `role="group" aria-labelledby="rma-purchase-label"`, `span#rma-purchase-label` "Data da compra", o `app-date-picker` atual, logo abaixo o checkbox "Compra desconhecida" (`formControlName="purchaseDateUnknown"`), quando marcado o texto "Sem data da compra, a garantia fica pendente." (consequência real: `ItemWarranty.calculate` devolve `PENDING`) e o erro de data. `.rma-purchase { grid-template-rows: auto; }`, porque `.modal-panel .field-group` impõe três linhas (`styles.css:1224-1227`). A ordem Compra → Entrada acompanha as regras de data (fabricação ≤ compra ≤ entrada).
  - `<details class="rma-create-form__done">` recolhido por padrão, `<summary>` "Atendimento já realizado", dentro um `fieldset.form-section` com `legend.sr-only` igual, `p.muted-inline` "Para registrar reparo, peças trocadas e testes feitos antes da abertura." e Reparo | Peças trocadas; Testes (largura total), com os `maxlength` atuais (600/600/800) e as mensagens da 2a.
  - Rodapé `form-actions form-actions--full` com Cancelar e "Abrir OS"/"Abrindo..." como hoje.
  - CSS: substituir `.rma-create-form > .col-2/.col-3` por regras dentro de `.rma-create-form__receipt`; linha do item com `grid-template-columns: minmax(0, 1.6fr) repeat(3, minmax(0, 1fr)) auto`; mesmos pontos de quebra (900 px: 2 colunas; 720 px: 1 coluna, já global para `.form-section`, `styles.css:1802-1810`).

- [ ] **Step 1: Escrever os testes.**
  *Comportamento novo:*
  - `groups the form into Atendimento, Produtos e identificação, Recebimento and Atendimento já realizado` (ordem das `legend`/`summary` — hoje não há `fieldset`; cada `formControlName` na seção prevista e uma única vez).
  - `keeps Atendimento já realizado collapsed by default` (`details.open === false` — hoje não há `details`; abrir mostra os três campos).
  - `opens the retroactive group, shows the message and focuses an invalid field` (grupo fechado; `repairSummary.setValue` com 601 caracteres e o resto válido; enviar: `details.open` verdadeiro, "Use até 600 caracteres." visível e `document.activeElement` é o `textarea` de `repairSummary`; `create` não chamado).
  - `ties Compra desconhecida to the purchase field` (checkbox dentro do mesmo `[role="group"]` que o seletor de data, rotulado "Data da compra" — hoje são itens separados; marcar desabilita o seletor e mostra "Sem data da compra, a garantia fica pendente.").
  - `removes a product row with an accessible icon button` (com um item, sem botão de remoção; "Adicionar produto" → `[role="group"]` "Produto 1"/"Produto 2"; `button[aria-label="Remover produto 2"]` sem texto visível — hoje "Remover" com texto; clicar volta a um item).
  - `shows one identification hint and the Série label` (sem placeholder "Informe lote ou serial" — hoje presente; rótulos "Lote" e "Série").
  *Preservação:*
  - `sends the full payload with a known purchase and the retroactive group closed` (todos os campos, dois itens, compra conhecida, reparo/peças/testes preenchidos com espaços nas bordas e o grupo **fechado**; envio pelo evento `submit` do formulário: `create` recebe exatamente o objeto de `:643-662`, com `normalizeText`).
  - `sends purchaseDate null when the purchase is unknown` (caso separado: `purchaseDateUnknown` marcado → `purchaseDate: null`, `purchaseDateUnknown: true`).
  - `shows Cancelar before the primary action` (`expectCancelBeforePrimary`); os testes existentes `:51-134`; o ciclo pendente `:290-350` no modo `create`; todos os testes da 2a.
- [ ] **Step 2: Rodar e ver falhar.** Esperado: FAIL nos de comportamento novo; PASS nos de preservação.
- [ ] **Step 3: Implementar** conforme **Interfaces**.
- [ ] **Step 4: Rodar e ver passar.** Esperado: PASS na suíte inteira.
- [ ] **Step 5: Commit.** `git add` dos arquivos de **Files**; mensagem: `feat(rmas): abertura em seções por momento e compra desconhecida junto da compra (NAV-98)`.

### Task 3: Diagnóstico em seções, com contexto e mensagens por campo

**Files:**
- Modify: `frontend/src/app/pages/rmas/rmas.component.html` (`:209-211` botão do cabeçalho do detalhe; `:489-550`)
- Modify: `frontend/src/app/pages/rmas/rmas.component.ts` (`openDiagnosisModal` `:554-568`; `saveDiagnosis` `:686-732`; novos sinais e métodos; CSS local)
- Modify: `frontend/src/app/pages/rmas/rmas.component.spec.ts` (`editorFeedback('diagnosis')`)
- Create: `frontend/src/app/pages/rmas/rmas.component.diagnosis.spec.ts`

**Interfaces:**
- Consumes: `diagnosisForm`, `primeDetailForms`, `currentOperatorName`, `canRegisterDiagnosis`, `failureTypeSelectOptions`/`failureCauseSelectOptions` (inalterados).
- Produces em `rmas.component.ts`: `diagnosisErrorMessage = signal('')` (recebe `:700` e `:729`; limpo ao abrir e a cada envio; as mensagens de seleção e permissão `:556,561,689,694` continuam em `pageError`, porque o diálogo não está aberto nesses casos); `diagnosisSubmitAttempted = signal(false)`; `showDiagnosisError(control)` com a mesma regra da 2a.
  Mensagens (validadores existentes):

  | Controle | Erro | Mensagem |
  | --- | --- | --- |
  | `foundFailure` | `required` | "Descreva a falha encontrada." |
  | `foundFailure` | `maxlength` | "Use até 2000 caracteres." |
  | `diagnosedAt` | `required` | "Informe a data do diagnóstico." |
  | `technicianName` | `required` | "Informe o técnico." |
  | `technicianName` | `maxlength` | "Use até 120 caracteres." |

  Não acrescentar atributo `maxlength` nesses campos (manteria o limite, mas mudaria o comportamento de digitação).
- Template:
  - `article` com `role="dialog" aria-modal="true" aria-labelledby="rma-diagnosis-title"`; `h3#rma-diagnosis-title` "Diagnóstico"; subtítulo com código e cliente.
  - Contexto somente leitura: `section.rma-diagnosis__context` com "Falha relatada" e `selectedRma()?.reportedFailure` (sem controle de formulário).
  - `@if (diagnosisErrorMessage())` → banner `role="alert"` no diálogo.
  - `fieldset.form-section` **Falha encontrada**: Falha encontrada (largura total), Tipo de falha | Causa provável. `fieldset.form-section` **Registro**: Data do diagnóstico | Técnico. `fieldset.form-section` **Notas**: Notas (largura total). Rodapé Cancelar / "Salvar diagnóstico"/"Salvando...".
  - Cabeçalho do detalhe: o `.button-primary` em `.rma-details__header-actions` passa a "Registrar diagnóstico" sem diagnóstico e "Editar diagnóstico" com diagnóstico; continua só com `canRegisterDiagnosis()`.

- [ ] **Step 1: Escrever os testes.**
  *Comportamento novo*, em `rmas.component.diagnosis.spec.ts`:
  - `groups the diagnosis into Falha encontrada, Registro and Notas` (`legend` nessa ordem e controles em cada uma — hoje sem `fieldset`; rótulo "Data do diagnóstico" — hoje "Data"; `role="dialog"`, `aria-modal`, `aria-labelledby` — hoje ausentes).
  - `shows the reported failure as read-only context` (texto da falha relatada dentro do diálogo e fora de `[formControlName]` — hoje ausente).
  - `shows field errors and the banner inside the dialog after an invalid submit` ("Descreva a falha encontrada.", "Informe o técnico." e `[role="dialog"] [role="alert"]` "Preencha os campos obrigatórios do diagnóstico." — hoje em `.status-card` fora; `upsertDiagnosis` não chamado).
  - `shows length errors for found failure and technician` (2001 e 121 caracteres — hoje sem mensagem).
  - `shows the save error inside the dialog and keeps the values`.
  - `clears the dialog message on reopen, on a corrected resubmit and on a new pending attempt`.
  - `labels the header action by diagnosis state` ("Registrar diagnóstico" e "Editar diagnóstico" — hoje "Diagnóstico").
  - Em `rmas.component.spec.ts`, `editorFeedback('diagnosis')` passa a ler `[role="dialog"] [role="alert"]`.
  *Preservação:* `sends the same diagnosis payload` (`failureType`/`probableCause` vazios → `null`; `notes` vazio → `null`; `trim` em falha e técnico; `diagnosedAt` como digitado); `primes the form from the existing diagnosis and defaults the technician to the operator`; `gives the diagnosis action only to ADMIN and TECHNICIAN` (quatro perfis: botão do cabeçalho e CTA "Registrar diagnóstico" da aba ausentes para `SERVICE_DESK` e `VIEWER`; para eles `openDiagnosisModal()` mantém o diálogo fechado e grava "Seu perfil não pode registrar diagnóstico técnico."); `denies saveDiagnosis to SERVICE_DESK and VIEWER without calling the service` (chamada direta com OS selecionada e formulário válido: `upsertDiagnosis` não chamado; para `ADMIN` e `TECHNICIAN`, chamado); `shows Cancelar before Salvar diagnóstico`; o ciclo pendente `:290-350` no modo `diagnosis`.
- [ ] **Step 2: Rodar e ver falhar.** Esperado: FAIL nos de comportamento novo e nos dois testes de `:314,347` em modo `diagnosis`; PASS nos de preservação.
- [ ] **Step 3: Implementar** conforme **Interfaces**. Não alterar `diagnosisForm`, `primeDetailForms`, `saveDiagnosis` além do destino das mensagens.
- [ ] **Step 4: Rodar e ver passar.** Esperado: PASS na suíte inteira.
- [ ] **Step 5: Commit.** `git add` dos arquivos de **Files**; mensagem: `feat(rmas): diagnóstico em seções com contexto da falha relatada e erros no diálogo (NAV-98)`.

### Task 4A: Funções do contrato de informação

**Files:**
- Create: `frontend/src/app/core/utils/rma-detail.ts`
- Create: `frontend/src/app/core/utils/rma-detail.spec.ts`

**Interfaces:**
- Consumes: `statusLabel`, `warrantyLabel`, `failureTypeLabel`, `failureCauseLabel`, `formatDate`, `itemCountLabel` (`rma-ui.ts`, Tarefa 1a), `blockDuration` (`rma-block.ts:10-12`), `buildRma`/`buildRmaItem` (`testing/rma-fixtures.ts`, Tarefa 1a), tipos `RmaResponse`, `RmaItemResponse`, `DiagnosisResponse`, `RmaBlockResponse`, `RmaStatus` (`core/models.ts:137-147,256-318`).
- Produces:
  ```ts
  export interface RmaFact { label: string; value: string; empty: boolean }

  export type RmaDetailSection =
    'failure' | 'products' | 'receipt' | 'diagnosis' | 'repair' | 'parts' | 'protocols' | 'blocks' | 'history';
  export const RMA_DETAIL_SECTIONS: ReadonlyArray<{ id: RmaDetailSection; label: string }>;
  // Falha relatada, Produtos, Recebimento, Diagnóstico, Reparo e testes, Peças, Protocolos, Impedimentos, Histórico
  export function sectionLabel(id: RmaDetailSection): string;

  export function warrantyTermLabel(months: number): string;          // '1 mês' | '12 meses'
  export function warrantyExpiryLabel(item: Pick<RmaItemResponse, 'warrantyExpiresAt'>): RmaFact; // 'Vencimento': data | 'Sem data da compra' (empty)
  export function purchaseFact(rma: Pick<RmaResponse, 'purchaseDate' | 'purchaseDateUnknown'>): RmaFact; // 'Compra': 'Desconhecida' | 'Não informada' | data
  export function invoiceFact(rma: Pick<RmaResponse, 'invoiceNumber'>): RmaFact;   // 'Nota fiscal': valor | 'Não informada'
  export function rmaItemFacts(item: RmaItemResponse): RmaFact[];   // SKU, Série, Lote, [Fabricação], Prazo de garantia, Vencimento
  export function receiptFacts(rma: RmaResponse): RmaFact[];        // [Acessórios], [Condição física]
  export function diagnosisFacts(diagnosis: DiagnosisResponse): RmaFact[]; // Falha encontrada, Tipo, Causa provável, Data do diagnóstico, Técnico, [Notas]
  export function repairFacts(rma: RmaResponse): RmaFact[];         // [Reparo], [Peças trocadas], [Testes]
  export const NO_DIAGNOSIS_LABEL = 'Sem diagnóstico registrado.';
  export function blockedLabel(block: RmaBlockResponse, now: number): string; // 'Bloqueado há 2h 5min'

  export type RmaHistoryEntry =
    | { kind: 'status'; at: string; by: string; label: string; status: RmaStatus; note: string | null } // label: 'Status registrado: Triagem'
    | { kind: 'assignee'; at: string; by: string; from: string; to: string };                          // 'Sem responsável' quando nulo ou vazio
  export function rmaHistory(rma: Pick<RmaResponse, 'statusHistory' | 'assignmentHistory'>): RmaHistoryEntry[];
  // registros de status e mudanças de responsável, mais recente primeiro; empate de instante mantém a ordem
  // de entrada (statusHistory e depois assignmentHistory, cada um na ordem original); não altera os arrays recebidos;
  // não compara registros vizinhos nem infere transição ou origem para registros de status
  ```
  `[campo]` = só quando preenchido (texto com `trim()` não vazio). Texto livre é devolvido sem truncar.

- [ ] **Step 1: Escrever os testes (todos de comportamento novo; hoje o módulo não existe, então o vermelho é de import — relatar à parte)** em `rma-detail.spec.ts`: `lists the nine sections in contract order`; `formats warranty term in singular and plural`; `shows the expiry date or Sem data da compra`; `distinguishes unknown purchase from missing purchase` ("Desconhecida" × "Não informada" × "20/10/2026"); `labels invoice and identification gaps` ("Não informada" para nota e série, "Não informado" para lote, `empty: true`); `includes manufacture only when present`; `returns receipt and repair facts only when filled, with the creation labels` ("Reparo", "Peças trocadas", "Testes"); `returns six diagnosis facts with date and technician, notes only when present`; `labels every status record as Status registrado without inferring a transition` (dois registros seguidos com o mesmo status → duas entradas "Status registrado: Triagem", nenhuma com "Moveu" ou com origem); `keeps a note recorded without a status change` (registro com o status atual e nota → entrada com a nota); `orders by instant, newest first, and keeps input order on ties` (status e responsável no mesmo instante → status primeiro, depois responsável); `does not mutate the input arrays` (cópias congeladas com `Object.freeze` e comparação com o original); `uses Sem responsável for empty assignee ends`; `formats the active block duration` (com `now` fixo).
- [ ] **Step 2: Rodar e ver falhar.** Esperado: erro de resolução de `./rma-detail` (vermelho de compilação; não afirmar nada sobre os demais testes).
- [ ] **Step 3: Implementar** as funções. Nenhum componente muda nesta tarefa.
- [ ] **Step 4: Rodar e ver passar.** Esperado: PASS na suíte inteira.
- [ ] **Step 5: Commit.** `git add` dos dois arquivos; mensagem: `feat(rmas): contrato comum de informação do detalhe da OS (NAV-98)`.

### Task 4B: Contrato no detalhe da lista (seis abas preservadas)

**Files:**
- Modify: `frontend/src/app/pages/rmas/rmas.component.html` (`:192-323`)
- Modify: `frontend/src/app/pages/rmas/rmas.component.ts` (imports; membros `:382-395`; `inject(SlaClockService)`; `imports` do componente com `RmaSlaBadgeComponent`; CSS `:114-262`)
- Create: `frontend/src/app/pages/rmas/rmas.component.detail.spec.ts`

**Interfaces:**
- Consumes: tudo de **4A**; `RmaSlaBadgeComponent`; `SlaClockService.now`; `productSummary`; `detailTabs` (inalterado).
- Produces: só template e membros de leitura. Cabeçalho: código, `h3` com `productSummary(rma)` e cliente abaixo, `.status-chip`, `.priority-tag`, e com impedimento ativo `.mini-chip.priority-high` com `blockedLabel(block, clock.now())`. Resumo `dl.meta-list` na ordem: Produtos (`itemCountLabel`), Entrada, Nota fiscal (`invoiceFact`), Compra (`purchaseFact`), Responsável, SLA (`<app-rma-sla-badge>`), Atualizado em. Aba Produtos: Falha relatada; "Produtos" (`h4` com `sectionLabel('products')`) com a nota de garantia e, por item, SKU/nome/estado no cabeçalho e `rmaItemFacts` no `dl` (sem repetir o SKU); "Recebimento" com `receiptFacts` quando houver. Aba Diagnóstico: `diagnosisFacts` ou o estado vazio atual (título trocado para `NO_DIAGNOSIS_LABEL`, CTA mantido por perfil); "Reparo e testes" com `repairFacts` quando houver. Aba Histórico: `rmaHistory(rma)` em `ol.record-list` (status: `entry.label` + nota em `blockquote`, sem "Moveu para"; responsável: "origem → destino"), vazio "Nenhuma alteração registrada.". Abas Peças, Protocolos e Impedimentos inalteradas. `dd.is-empty` quando `fact.empty`.

- [ ] **Step 1: Escrever os testes.**
  *Comportamento novo*, em `rmas.component.detail.spec.ts` (`SlaClockService` falso com `now` fixo, como `kanban.component.spec.ts:21,27`):
  - `shows product as title, client below and the same status, priority and block formats` (`h3` com o produto — hoje o cliente; "Bloqueado há 2h 0min" — hoje só "Bloqueado").
  - `lists the summary facts in contract order with SLA` (rótulos Produtos, Entrada, Nota fiscal, Compra, Responsável, SLA, Atualizado em — hoje sem SLA e com "Atualizado"; `app-rma-sla-badge` presente; compra desconhecida "Desconhecida"; compra vazia não marcada "Não informada").
  - `shows warranty term, expiry and Recebimento in the Produtos tab` ("1 mês" — hoje "1 meses"; "Sem data da compra" — hoje "Informe a compra"; seção "Recebimento" com acessórios e condição quando existem — hoje ausente; ausente quando não).
  - `shows the six diagnosis facts and Reparo e testes in the Diagnóstico tab` (Data do diagnóstico, Técnico, Notas — hoje ausentes; "Reparo", "Peças trocadas", "Testes" com os valores registrados — hoje ausentes).
  - `shows status records and assignee changes in the Histórico tab, newest first` (a entrada de status "Status registrado: Triagem" com a nota — hoje só há trocas de responsável; a entrada de responsável com origem nula, consultada **por ela mesma**, mostra "Sem responsável → Ana").
  *Preservação:* `keeps the six tabs in order with tab semantics` (Produtos, Diagnóstico, Peças, Protocolos, Impedimentos, Histórico; `aria-selected`, `aria-controls`; abre sempre em Produtos); `renders parts, protocols and impediments panels in their tabs` (`app-rma-parts-panel` com `rmaId`/`rmaStatus`; protocolos carregados sob demanda; `app-rma-block-history`); `keeps the diagnosis CTA only for ADMIN and TECHNICIAN`; `rmas.component.spec.ts:136-145` (sem "Recebido por") sem alteração.
- [ ] **Step 2: Rodar e ver falhar.** Esperado: FAIL nos de comportamento novo; PASS nos de preservação.
- [ ] **Step 3: Implementar.** Não alterar `detailTabs`, `openDetailsModal`, o `@defer` de peças nem o carregamento de protocolos.
- [ ] **Step 4: Rodar e ver passar.** Esperado: PASS na suíte inteira.
- [ ] **Step 5: Commit.** `git add` dos arquivos de **Files**; mensagem: `feat(rmas): detalhe da lista com o contrato comum de informação (NAV-98)`.

### Task 4C: Contrato no modal do Kanban (blocos e linha do tempo preservados, sem abas)

**Files:**
- Modify: `frontend/src/app/shared/rma-detail-modal/rma-detail-modal.component.html`
- Modify: `frontend/src/app/shared/rma-detail-modal/rma-detail-modal.component.ts` (imports; `activity` `:62-65` passa a `rmaHistory`; `RouterLink`)
- Modify: `frontend/src/app/shared/rma-detail-modal/rma-detail-modal.component.css` (`:21-24` itens; `:43,47` status)
- Modify: `frontend/src/app/pages/kanban/kanban.component.spec.ts` (só `provideRouter([])` em `:26-65`)
- Create: `frontend/src/app/shared/rma-detail-modal/rma-detail-modal.component.spec.ts`
- Create: `frontend/src/app/pages/kanban/kanban.component.profiles.spec.ts`

**Interfaces:**
- Consumes: tudo de **4A**; `RouterLink`; entradas e saídas atuais do modal (`rma`, `canUpdateStatus`, `canUpdateAssignee`, `disabled`, `closed`, `statusChange`, `assigneeChange`, `blockInspect`), inalteradas.
- Produces: blocos na ordem do contrato, com títulos de `sectionLabel`: Falha relatada; **Produtos** (era "Itens"; cada `<li>` com nome, `.mini-chip` de garantia e, abaixo, `rmaItemFacts` como pares curtos); Recebimento (`receiptFacts`); Diagnóstico (`diagnosisFacts`, agora com "Data do diagnóstico" e "Notas"; sem diagnóstico, `p.rma-detail__muted` com `NO_DIAGNOSIS_LABEL`); **Reparo e testes** (`repairFacts`, rótulos da abertura); **Histórico** (era "Atividade"; mesma linha do tempo, com `rmaHistory`: registro de status com `entry.label` e nota, sem "Moveu para"; responsável com "Sem responsável" no lugar de "ninguém").
  Ações de negócio, depois de "Ver impedimentos": com `disabled()` falso, `<a class="button-secondary" routerLink="/rmas" [queryParams]="{ rma: rma().id }">Abrir OS na lista</a>`; com `disabled()` verdadeiro, `<button type="button" class="button-secondary" disabled>Abrir OS na lista</button>` (mesmo comportamento dos outros botões de ação; fechar e clicar na sobreposição continuam ativos, como hoje, `rma-detail-modal.component.html:1,5`). O destino abre o detalhe na aba Produtos.
  Lateral: status em `.status-chip[data-status]`; prioridade em `.priority-tag[data-priority]` com barras; Atendimento com Cliente, Entrada, Recebido por, Nota fiscal (`invoiceFact`), Compra (`purchaseFact`, rótulo "Compra"), Rastreio; Criado em/Atualizado em como hoje. Nenhum `role="tablist"`. Remover `.rma-detail__status` se ficar sem uso.

- [ ] **Step 1: Escrever os testes.**
  *Comportamento novo*, em `rma-detail-modal.component.spec.ts` (`TestBed` com o componente, `provideRouter([{ path: 'rmas', component: StubComponent }])`, `SlaClockService` falso):
  - `shows the blocks in contract order with the shared names` (títulos `.rma-detail__heading` na ordem Falha relatada, Produtos, Recebimento, Diagnóstico, Reparo e testes, Histórico — hoje "Itens", "Reparo", "Atividade").
  - `shows warranty term and expiry for each product` ("12 meses" e vencimento ou "Sem data da compra" — hoje ausentes; Série e Lote separados).
  - `shows diagnosis date and Notas, and an empty diagnosis state` ("Data do diagnóstico" e "Notas" — hoje ausente e "Observações"; sem diagnóstico, "Sem diagnóstico registrado." — hoje o bloco some).
  - `uses the creation labels for retroactive repair records` ("Peças trocadas" — hoje "Peças substituídas"; sem "Resumo do reparo").
  - `labels status records without inferring a move` (registro de status repetido e registro de prioridade com nota: "Status registrado: Triagem" com a nota — hoje "Moveu para").
  - `uses Sem responsável in assignee history` (consultar o `li.rma-detail__event.is-assignee` com origem nula: contém "Sem responsável" e não "ninguém" — a lateral já mostra "Sem responsável", por isso a consulta é no evento).
  - `formats status, priority, invoice and purchase like the list` (`.status-chip[data-status]` e `.priority-tag[data-priority]` — hoje `span.rma-detail__status` e `.mini-chip`; "Não informada" na nota vazia — hoje "—"; "Desconhecida" na compra desconhecida — hoje "Não informada").
  - `navigates to the OS in the list` (clicar em "Abrir OS na lista" e `await fixture.whenStable()`: `Router.url` é `/rmas?rma=<id>` — hoje o link não existe).
  - `keeps the list link inactive while disabled` (com `disabled` verdadeiro: "Abrir OS na lista" é `button[disabled]` e não há `a[href]`; clicar não muda a URL).
  *Preservação:* `has no tabs` (sem `[role="tablist"]`); `shows status and assignee actions only when allowed and always Ver impedimentos`; `disables business actions while disabled` (Alterar status, Trocar/Atribuir, Ver impedimentos com `disabled`; fechar continua habilitado); `emits closed, statusChange, assigneeChange and blockInspect`; `shows the active block and the SLA badge`; `focuses the panel on open`.
  *Preservação*, em `kanban.component.profiles.spec.ts` (montagem do `KanbanComponent` como `kanban.component.spec.ts:20-69`, com `provideRouter([])` e `hasAnyRole: (roles) => roles.includes(role)`, parametrizada pelos quatro perfis): `passes status and assignee permissions to the detail modal` (abrir o detalhe e ler os inputs do `RmaDetailModalComponent` via `By.directive`: `ADMIN` true/true, `SERVICE_DESK` true/true, `TECHNICIAN` true/false, `VIEWER` false/false; os botões correspondentes presentes ou ausentes; "Ver impedimentos" para todos).
  *Preservação:* todo `kanban.component.spec.ts:227-285`, com `provideRouter([])` acrescentado.
  *Integração de destino (preservação, já coberta na 1a):* `/rmas?rma=<id>` abre o detalhe da OS na aba Produtos.
- [ ] **Step 2: Rodar e ver falhar.** Esperado: FAIL nos de comportamento novo; PASS nos de preservação (com `provideRouter([])` já acrescentado no Step 1, para que o `kanban.component.spec.ts` não quebre depois do Step 3).
- [ ] **Step 3: Implementar.** Não mudar entradas, saídas, `trapFocus`, `onEscape` nem a estrutura principal/lateral.
- [ ] **Step 4: Rodar e ver passar.** Esperado: PASS na suíte inteira.
- [ ] **Step 5: Commit.** `git add` dos arquivos de **Files**; mensagem: `feat(kanban): modal de detalhe com o contrato comum de informação, sem abas (NAV-98)`.

### Task 5: Verificação

**Files:** ao final, e só com aprovação do usuário, `docs/ux/2026-11-07-etapa-1-fundacao-visual.md` (linha da etapa 4 no roteiro) e `docs/ux/2026-11-07-roteiro-conferencia-manual.md` (seção da etapa 4 e remoção da pendência "filtros de ordens de serviço com 'Buscar' antes de 'Limpar'").

- [ ] **Step 1: Suíte e build.** `npm --prefix frontend test -- --watch=false --runner-config 'C:\Users\joseh\AppData\Local\Temp\vitest-runner.config.mjs'` e `npm --prefix frontend run build`. Esperado: PASS; os avisos de orçamento existentes não pioram além do custo das funções novas.
- [ ] **Step 2: Buscas de regressão (PowerShell, só componentes, sem specs).**
  ```powershell
  $files = Get-ChildItem -Path frontend/src/app/pages/rmas, frontend/src/app/shared/rma-detail-modal -File |
    Where-Object { $_.Name -match '\.component\.(html|ts)$' }
  $files | Select-String -Pattern 'stats-grid', 'stat-card', 'nesta página', 'registro\(s\)', 'item\(ns\)', 'Informe a compra', 'ninguém', 'Moveu para', 'Resumo do reparo', 'Peças substituídas', 'peças e protocolos', 'role="tablist"'
  ```
  Esperado: uma única ocorrência, `role="tablist"` em `rmas.component.html` (as seis abas); nenhuma no modal.
  ```powershell
  Select-String -Path frontend/src/app/pages/rmas/rmas.component.html -Pattern 'formControlName="(clientId|priority|invoiceNumber|purchaseDate|purchaseDateUnknown|entryDate|reportedFailure|receivedAccessories|physicalCondition|repairSummary|replacedPartsSummary|testSummary|productId|batchNumber|serialNumber|manufacturedAt|foundFailure|failureType|probableCause|diagnosedAt|technicianName|notes)"' | Measure-Object
  git diff --stat main -- frontend/src/app/app.routes.ts frontend/src/app/core/services/rma.service.ts frontend/src/app/core/utils/paged-list.ts backend
  ```
  Esperado: 24 linhas — 12 controles da abertura, 4 do item, 6 do diagnóstico e mais 2 porque `batchNumber`/`serialNumber` também nomeiam os campos do histórico (`historyForm`) — e nenhuma saída no `git diff`.
- [ ] **Step 3: Relatar** que a verificação foi por testes e build, que a conferência autenticada não foi possível, e entregar o roteiro abaixo ao usuário.
- [ ] **Step 4: Depois da conferência do usuário,** marcar a etapa 4 como entregue no roteiro das etapas (com os commits) e atualizar o roteiro de conferência manual.

**Roteiro manual (usuário, com backend em `localhost:8080` e `npm --prefix frontend start -- --port 4300`; login feito pelo próprio usuário), em 1440 px e 320 px:**

1. **ADMIN**, lista de ordens de serviço: título com contagem ("N ordens de serviço"), sem cartões; barra com o campo Busca, Status, Limpar e Buscar nessa ordem; linha "No resultado: X em atendimento · Y com prioridade alta" que muda ao buscar e não muda ao paginar; sem rolagem horizontal da página (a tabela rola sozinha); códigos sem quebra.
2. Digitar na busca ou trocar o status sem clicar em "Buscar" e ir para a página 2 ou trocar o tamanho: a lista continua com o filtro anterior. Buscar duas vezes seguidas com termos diferentes: contagem e indicadores nunca mostram o termo anterior junto da lista nova. Buscar algo sem resultado: "Nenhuma OS encontrada" com "Limpar busca e filtros", que volta à página 1.
3. Histórico por lote ou série: consultar um lote existente (contagem no singular/plural), um inexistente e enviar vazio; abrir um resultado.
4. Nova OS: seções Atendimento, Produtos e identificação, Recebimento e "Atendimento já realizado" recolhido; campos alinhados em cada linha de produto; remover produto pela lixeira (tooltip e Tab); marcar "Compra desconhecida" desabilita a data e mostra a consequência; enviar vazio mostra os erros por campo e o aviso **dentro** do diálogo; abrir com reparo, peças trocadas e testes preenchidos, fechar o grupo antes de enviar e conferir esses textos no detalhe (aba Diagnóstico, seção "Reparo e testes").
5. Diagnóstico: "Registrar diagnóstico" abre com a falha relatada visível; seções Falha encontrada, Registro e Notas; salvar; o botão passa a "Editar diagnóstico".
6. Detalhe da lista e modal do Kanban do **mesma OS**, lado a lado: mesmos nomes (Produtos, Recebimento, Diagnóstico, Reparo e testes, Histórico), mesma prioridade com barras, mesmo status, garantia com prazo e vencimento nos dois, compra "Desconhecida" igual, histórico com "Status registrado" e trocas de responsável nos dois; o modal continua sem abas; "Abrir OS na lista" leva à OS aberta na aba Produtos, com Peças e Protocolos nas abas.
7. **SERVICE_DESK**: "Nova OS" presente; sem botão de diagnóstico; no Kanban, status e responsável. **TECHNICIAN**: sem "Nova OS"; diagnóstico presente; reservas e protocolos como antes; no Kanban, status sem responsável. **VIEWER**: nenhuma ação de alteração em lista, detalhe e modal.
8. Com o backend parado, abrir a lista e depois religar e usar "Tentar novamente": antes aparece a falha (nunca "Nenhuma OS registrada" nem indicadores zerados), depois a lista e os indicadores voltam.
9. Teclado: Tab percorre a barra, a tabela (Enter/Espaço abrem o detalhe), as abas e os diálogos; Cancelar à esquerda e Enter envia os formulários.

## Critérios de aceite

1. A lista usa `app-page-header` com "N ordens de serviço" (contagem oculta sem resultado do filtro atual), a barra comum `.catalog-toolbar--filters` com Limpar antes de Buscar e o histórico em painel identificado "Histórico por lote ou série".
2. Não há cartões de estatística; "em atendimento" e "prioridade alta" aparecem numa linha que declara o escopo "No resultado", nunca "nesta página", só quando o resumo corresponde ao filtro da lista exibida; respostas fora de ordem não misturam filtros.
3. Busca e status só passam a valer com "Buscar"; paginação, tamanho, atualização e nova tentativa usam o último filtro confirmado; parâmetros, tamanho e recuo de página preservados.
4. Falha da última consulta, carregando, registro vazio e busca sem resultado são estados distintos, com "Tentar novamente" e "Limpar busca e filtros".
5. A abertura está em Atendimento, Produtos e identificação, Recebimento e "Atendimento já realizado" (recolhido, sem desabilitar controles e reaberto com foco quando houver erro nele), com "Compra desconhecida" no grupo da compra, remoção de produto por ícone com nome acessível e erros dentro do diálogo; campos, obrigatoriedade, validadores e payload idênticos.
6. O diagnóstico está em Falha encontrada, Registro e Notas, com a falha relatada como contexto, mensagens por campo e erros dentro do diálogo; payload e permissões idênticos.
7. Os dois detalhes mostram os fatos do contrato com os mesmos nomes, ordem e formatação, a partir de `core/utils/rma-detail.ts`, sem inferir transições de status; a lista mantém as seis abas; o modal do Kanban mantém blocos e linha do tempo, sem abas, e ganha "Abrir OS na lista".
8. Permissões por perfil cobertas por testes de botões e de chamadas diretas; `app.routes.ts`, `RmaService`, `PagedList` e backend sem diff.
9. Testes e build passam; a conferência autenticada fica com o usuário, pelo roteiro acima.

## Registro da revisão independente

A revisão (veredito "aprovar com ajustes") levantou oito pontos. Todos foram conferidos no código e **aceitos**; as evidências e o destino de cada um:

1. **Resumo assíncrono (alta).** Conferido: `loadSummary` abre assinaturas independentes (`rmas.component.ts:776-781`) e `PagedList` mantém o resultado anterior durante a carga (`paged-list.ts:24-37`). Aplicado no "Contrato de estados da lista" (invalidação, `switchMap`, exibição só com o mesmo filtro da lista exibida, `hasCurrentResult`) e nos testes de ordem de resposta da Tarefa 1a.
2. **Filtro confirmado como exceção explícita.** Conferido: `rmas.component.ts:358-360,873-881`. O Goal e as Global Constraints passaram a declarar a exceção; testes de status não enviado, troca de tamanho e atualização após diagnóstico na 1a.
3. **`<details>` recolhido.** Conferido: validadores em `rmas.component.ts:461-463`, `getRawValue()` em `:635`, envio inválido só marca os controles em `:628-633`. Aplicado na 2b (controles nunca desabilitados/removidos, `formArrayName`/`[formGroupName]` preservados, abertura com mensagem e foco, payload completo com grupo fechado, compra conhecida separada de `purchaseDateUnknown`). Corrigidas as notas: lote/série têm validador Angular de 60 sem atributo HTML (`rmas.component.html:392,397`; `rmas.component.ts:886-887`); prioridade só `required` (`:460`).
4. **Rótulo do link.** Conferido: `openDetailsModal` sempre seleciona Produtos (`rmas.component.ts:545`). Rótulo trocado para "Abrir OS na lista"; navegação real testada; comportamento com `disabled()` definido; "nenhuma requisição nova" restrito aos detalhes.
5. **Semântica de `statusHistory`.** Conferido: mudança de prioridade grava registro com o mesmo status (`RmaService.java:164-166`) e nota sem transição também grava (`RmaService.java:216-221`). Contrato passa a "Status registrado: <status>", sem inferir transição; testes de status repetido, nota sem transição, empate de instante e imutabilidade na 4A.
6. **Regras de teste.** Aplicadas nas Global Constraints; cada teste novo indica a asserção que reprova hoje; vermelho de compilação relatado à parte (1a e 4A); os testes de ausência de `.rma-summary` e de `[role="alert"]` passaram a afirmar também a ausência do valor atual; o teste de "Sem responsável" consulta o evento; "desabilita ações" restrito às ações de negócio.
7. **Cobertura do Review Focus.** Acrescentados: chamadas diretas negadas a `createRma()` (2a) e `saveDiagnosis()` (3); matriz do Kanban pelo componente pai (`kanban.component.profiles.spec.ts`, 4C; mapeamento em `kanban.component.ts:240-245`, mock atual em `kanban.component.spec.ts:29`); parâmetros normalizados, entrada em branco e abertura do resultado no histórico (1c); limpeza das mensagens ao reabrir, reenviar e nova tentativa (2a, 3); cenários concorrentes e ausência de contagem antes da primeira resposta (1a); preservação de `productSummary`/`trackableLabel` com vários itens (1a).
8. **Dependências, granularidade e evidências.** 4A depende da 1a; Tarefa 1 dividida em 1a/1b/1c e Tarefa 2 em 2a/2b; corrigidas as evidências dos zeros ("antes da primeira resposta ou após falha inicial; uma falha posterior mantém o último resumo") e de "Causa provável", que já existe no Kanban (`rma-detail-modal.component.html:77`).

**Ressalvas (sem discordância de mérito):** no ponto 4, a "integração de navegação" fica em dois testes complementares — o modal prova a navegação até `/rmas?rma=<id>` com rota de teste, e a 1a prova que essa URL abre o detalhe na aba Produtos —, e não num teste ponta a ponta entre as duas páginas, que exigiria montar o roteador completo da aplicação. No ponto 3, um controle retroativo inválido é praticamente inalcançável pela interface (os `textarea` têm `maxlength`); a recuperação é implementada e testada por `setValue`, como rede de proteção.

**Decisões próprias e destino após a revisão:**

| Nº | Decisão | Destino |
| --- | --- | --- |
| 1 | Indicadores numa linha com escopo "No resultado", total no título | Manter, com o ciclo assíncrono corrigido |
| 2 | Sem "X de Y" | Manter: não há denominador independente do filtro |
| 3 | Filtro confirmado em sinal próprio | Manter, como exceção comportamental explícita |
| 4 | Busca por envio, sem `searchChanges`/debounce | Manter |
| 5 | "Série" no lugar de "Serial" nos rótulos | Manter |
| 6 | "Atendimento já realizado" recolhido | Manter, com preservação e recuperação de erro testadas |
| 7 | Mensagem para envio vazio do histórico | Manter |
| 8 | Erros de abertura e diagnóstico dentro do diálogo | Manter |
| 9 | Falha relatada como contexto e "Registrar/Editar diagnóstico" | Manter |
| 10 | Histórico da lista com registros de status | Manter, com "Status registrado" e sem inferir transições |
| 11 | Link do Kanban para a lista | **Modificada:** "Abrir OS na lista" para `/rmas?rma=<id>` (abre em Produtos); o rótulo "Abrir peças e protocolos" sai; abrir direto em Peças/Protocolos vai ao backlog |
| 12 | "Notas" como rótulo comum | Manter |
| 13 | "Recebido por", rastreio e "Criado em" só no Kanban | Manter a preservação atual; ampliação na lista vai ao backlog |

## Fora deste plano

Abas no modal do Kanban ou estrutura única de detalhe (hipótese posterior da decisão 2); abrir o detalhe da lista direto em Peças ou Protocolos a partir do Kanban (backlog); "Recebido por", rastreio e "Criado em" no detalhe da lista (backlog); voltar ao detalhe depois de salvar ou cancelar o diagnóstico (hoje fecha tudo, `rmas.component.ts:570-573,747-749`, e os testes `:280-288` esperam isso); prender o foco e devolvê-lo no detalhe e nos diálogos da lista (pendência da conferência global); "item(ns)" dentro de `productSummary`/`trackableLabel` (saída usada no card do Kanban); `registro(s)` da paginação compartilhada (`shared/pagination/pagination.component.ts:11`); painéis de peças, protocolos e impedimentos (`rma-parts-panel`, `rma-protocols`, `rma-block-panel`, `rma-block-history`: etapa 5); edição de OS, filtro de prioridade, exportação, métricas no dashboard (etapa 6); densidade de 36 px.
