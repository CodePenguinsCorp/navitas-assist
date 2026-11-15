# Etapa 5 - Operações especializadas Implementation Plan

Referência histórica de UX. O fluxo de peças vigente está em [padrões visuais](padroes-visuais.md) e [API](../api.md): uso imediato com motivo e reversão em OS aberta.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans or superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Este documento é somente um plano; a solicitação atual não autoriza implementar nem commitar código.

**Architecture:** Alterações locais nos componentes existentes, reutilizando `app-page-header`, `button[appRowAction]`, `fieldset.form-section`, controles compartilhados e tokens de `frontend/src/styles.css`. Cada recurso assíncrono distingue carga, falha e vazio; os padrões de `loadFailed`/`hasLoaded`/`retryLoad`/`clearFilters` são adaptados às listas não paginadas destas operações, sem introduzir `PagedList`. Uma alteração pequena em `core/utils/protocol-ui.ts` explicita o progresso dos obrigatórios; o editor mantém seu `FormArray` e seu construtor de payload. Nenhum serviço HTTP, modelo de API ou backend muda. A coordenação global de foco fica em backlog justificado neste plano.

**Tech Stack:** Angular 21 (standalone, signals, reactive forms, `@if/@for`), RxJS, Vitest pelo runner Angular, CSS com os tokens atuais (`--control-height`, `--control-height-sm`, `--space-*`, `--radius-*`, cores e tipografia).

**Base inspecionada:** diretório atual, branch `main`, em 8 de novembro de 2026. Na abertura havia alterações preexistentes de fechamento da etapa 4 em ordens de serviço, Kanban, detalhe e controles compartilhados. Durante a elaboração esse fechamento avançou externamente; a conferência final encontrou `main` em `f889f70` (contrato comum dos detalhes), precedido por `2aaf896`, `6e409f9` e `dda22b2`. Nenhum desses arquivos foi escrito nesta solicitação; não reverter nem incluir trabalho anterior nos commits da etapa 5. As evidências do escopo foram reconferidas, e as referências de ordens de serviço abaixo usam o fechamento atual. Reconfirmar âncoras antes de executar.

## Global Constraints

## Inventário de inconsistências e limites, com evidência

Os caminhos abreviados nesta tabela são relativos a `frontend/src/app/`; `styles.css` é `frontend/src/styles.css`. Cada linha aponta uma tarefa ou um backlog, para não confundir achado com funcionalidade nova.

| Tema | Evidência no código inspecionado | Destino |
| --- | --- | --- |
| Estoque ainda fora da composição comum | `pages/parts/parts.component.html:2-29,51-59`: cabeçalho manual, três cartões e contagem “registro(s)” no campo de busca | 2 |
| Falha confundida com vazio ou saldo anterior | `parts.component.ts:298-311` grava só `errorMessage`; HTML `:62-75,131-132,163-164` não distingue falha; `clearMessages` apaga a mensagem em `:314-317` | 1 |
| Reposição sem carga própria visível | HTML `:128-190` mostra textos de ausência antes do `forkJoin` terminar; aba mostra `(0)` em `:34` antes de haver resposta | 1 |
| Ações sem identificação e tooltip por foco | HTML `:113-118`: `title` nativo + `.sr-only` genérica; `.part-actions` em TS `:58-62` duplica `.row-actions` | 2 |
| Reposição concatena identidade e localização | HTML `:148`: código, nome e localização juntos; dados comparáveis já existem nas respostas | 2 |
| Cadastro plano; fechar permitido durante gravação | HTML `:214-260`, fechar `:203`; `closeModals` TS `:174-180` sem guarda; `submit` chama-o antes do `finalize` (`:276-282`) | 3 |
| Movimento sem unidade junto da quantidade, prévia ou erro de campo | HTML `:276-305`; regras já estão em TS `:216-227`; cabeçalho conhece somente o disponível e não separa os três saldos | 4 |
| Histórico falho parece vazio; respostas podem chegar fora de ordem | TS `:288-295` não guarda falha nem cancela leitura anterior; HTML `:331-335` mostra “Nenhum movimento registrado.” após erro | 5 |
| Estorno sem Cancelar e sem rótulo persistente para motivo | HTML `:372-376`: input só com placeholder e “Confirmar”; TS `:239-264` não oferece cancelamento individual nem guarda contra duplo envio | 5 |
| Impedimentos sem Cancelar no rodapé | `shared/rma-block-panel/rma-block-panel.component.html:4,13-31`: só Fechar no cabeçalho, submit isolado em ambos os formulários | 7a |
| Histórico de impedimentos sem rótulo de início/resolução | `shared/rma-block-history/rma-block-history.component.ts:29-41`: início como `<time>` solto, duração só nos resolvidos e nota sem identificação | 7b |
| Protocolos: falha de leitura parece lista vazia | `shared/rma-protocols/rma-protocols.component.html:4-15`; TS `:245-250`; catálogo em `:138-139` sem tratamento de erro | 8 |
| Progresso visual usa todos os itens, não obrigatórios | `core/utils/protocol-ui.ts:34-40`; HTML de execução `:22,28` combina total registrado com pendência; não oferece numerador/denominador dos obrigatórios | 9 |
| Etapa/item/resultado concatenados e contexto some | HTML de execução `:33-34`; `resultSummary`, TS `:231-238`, troca resultado esperado por último registro; `instructions`, `minValue` e `maxValue` não são apresentados | 9 |
| Tentativas disponíveis, mas sem leitura no painel | `models.ts:681-684` oferece `latest` e `attempts`; HTML não exibe evidência/justificativa de cada tentativa; TS `:237` mostra só número da última | 9 |
| Justificativa sinalizada só ao repetir | HTML de execução `:63-68`: evidência sempre marcada quando configurada e justificativa só com `latest`; diverge das condições atuais do servidor descritas nas restrições | 10 |
| Resultado pode ser cancelado durante gravação e erro fica longe | `cancelResult`, TS `:168-169`, não testa `submitting`; HTML `:71` não desabilita Cancelar; erro único em `:4-5`, fora do formulário | 10 |
| Editor residual de itens | `pages/protocols/protocols.component.html:171-246` monta todos os campos de todos os itens; esperado/instruções são inputs de uma linha (`:220-226`). Etapa 3, Tarefa 7, `:364`: “Resumo por item com edição focada fica fora” | 11 |
| Foco não uniforme entre diálogos | Peças usa sections sem semântica de diálogo (`parts.component.html:197,273,314`); editor declara `aria-modal` sem confinamento/retorno (`protocols.component.html:97-103`). Referência: `shared/rma-detail-modal/rma-detail-modal.component.ts:68-91`; HTML `:2`. Impedimentos já usa `showModal` (`rma-block-panel.component.ts:39`) | Backlog F1 |

### Specs existentes e o que deve permanecer

## Decisão de indicadores e informação

| Área | Decisão própria proposta | Escopo verdadeiro |
| --- | --- | --- |
| Cabeçalho Peças | `app-page-header heading="Peças" singular="peça" plural="peças"`; Estoque mostra quantidade filtrada e total somente com busca; Reposição mostra total de peças do catálogo, sem aplicar a busca escondida | Sem contagem antes do primeiro sucesso ou após falha; nenhuma paginação nova |
| Reposição | Dois grupos mantidos: “Alerta de reposição” e “Peças pendentes por OS”; separar Nome/Código/Localização | `suggestedQuantity` e `pendingQuantity` da API, sem recalcular, somar unidades diferentes ou gerar pedido de compra |
| Execução | “N/T itens registrados” separado de “A/B obrigatórios atendidos”, estado e versão | A = `requiredItems - pendingRequiredItems`; B = `requiredItems`; sem obrigatórios: “Sem itens obrigatórios”, sem barra percentual |

## Contrato de carga, mensagens e testes

   ```bash
   npm --prefix frontend test -- --watch=false --runner-config 'C:\Users\joseh\AppData\Local\Temp\vitest-runner.config.mjs'
   npm --prefix frontend run build
   ```

## Review Focus

---

### Task 1: Estados de carga de estoque e reposição

**Files:**
- Modify: `frontend/src/app/pages/parts/parts.component.ts` (sinais `:87-105`, `load :298-311`, `clearMessages :314-317`).
- Modify: `frontend/src/app/pages/parts/parts.component.html` (estados `:38-75,128-190`, contadores `:13-34`).
- Create: `frontend/src/app/pages/parts/parts.component.load.spec.ts`.

**Interfaces:**
- Consumes: `PartService.list/listReplenishment/listPending`, os três arrays e `loading`, assinaturas HTTP intactas.
- Produces: `protected readonly loadFailed`, `hasLoaded`, `loadErrorMessage` (signals de boolean/boolean/string); `protected retryLoad(): void`; `protected clearFilters(): void`; `private load(): void` continua ponto único da carga conjunta. Guardar/cancelar a assinatura anterior e encerrá-la no destroy; cancelar antes de iniciar o próximo `loading`. `clearMessages()` não limpa falha/mensagem da leitura.

### Task 2: Composição do estoque e comparação na reposição

**Files:**
- Modify: `frontend/src/app/pages/parts/parts.component.html` (cabeçalho, indicadores, barra, tabelas de estoque/reposição).
- Modify: `frontend/src/app/pages/parts/parts.component.ts` (imports, estilos inline `:49-62`, `stockValue :120`).
- Modify: `frontend/src/app/pages/parts/parts.component.spec.ts` (ações por nome acessível).
- Create: `frontend/src/app/pages/parts/parts.component.presentation.spec.ts`.

- [ ] **Step 1: Testes novos:**
  - `counts parts in the heading and clears an empty search`: duas peças, buscar uma; `expect(count.textContent).toBe('1 de 2 peças'); expect(searchLabel.textContent).not.toContain('registro(s)')`. Reposição ignora busca escondida no cabeçalho: “2 peças”. Hoje contagem está na busca.
  - `shows scoped alerts without statistic cards`: `expect(text).toContain('No estoque completo:'); expect(text).not.toContain('Valor em estoque'); expect(root.querySelector('.stat-card')).toBeNull()`. Filtrar não muda os números globais; falha oculta valores e a linha. Hoje cartão monetário existe.
  - `names row actions with the part and exposes a focus tooltip`: focar Editar; `expect(button.getAttribute('aria-label')).toBe('Editar PCA-1 Capacitor'); expect(tooltip.textContent).toBe('Editar')`. Hoje nome acessível só “Editar”. O componente compartilhado já testa Escape/posição; não duplicar a suíte inteira.
  - `separates replenishment identity from location`: `expect(headers).toContain('Localização'); expect(nameCell.textContent).not.toContain('A1'); expect(locationCell.textContent).toBe('A1')`. Hoje localização é subtítulo da identidade.
  **Preservação:** ler células por cabeçalho com fixture 10/4/6 `m`: três valores distintos, mínimo e “Repor”; `belowMinimum` só chama atenção com texto; inativa continua identificada; sugestão/pendência exatamente iguais à API; aba de pendências conserva OS e data. Matriz `ADMIN`/`SERVICE_DESK` com Nova peça/Editar/Movimentar, técnico/consulta só Histórico; todos veem BRL conforme comportamento atual.
- [ ] **Step 2: Rodar e ver falhar.** Mesmo comando de Peças da 1. Esperado: FAIL nas quatro novidades e PASS na matriz/formatação.
- [ ] **Step 3: Implementar** cabeçalho/linha de indicadores conforme tabela de decisões, `.catalog-toolbar--filters`, `.row-actions` e `appRowAction`; remover apenas CSS/cálculo local sem uso. Não alterar `stockPercent` ou criar resumo HTTP. Erro/retry da 1 continua antes de tabelas e indicadores.
- [ ] **Step 4: Repetir o comando.** Esperado: PASS; verificar que o teste de consulta existente usa nome acessível/tooltip para Histórico.
- [ ] **Step 5: Commit.** `git add` dos quatro **Files**; `git commit -m "feat(pecas): alinhar estoque e reposicao a composicao comum (NAV-98)"`.

### Task 3: Cadastro de peça em seções e gravação estável

**Files:**
- Modify: `frontend/src/app/pages/parts/parts.component.html` (formulário `:195-269`, botões de fechar dos diálogos).
- Modify: `frontend/src/app/pages/parts/parts.component.ts` (`closeModals :174-180`, `savePart :182-203`, `submit :272-285`).
- Create: `frontend/src/app/pages/parts/parts.component.form.spec.ts`.

**Interfaces:**
- Consumes: `form`, limites/validadores e `PartRequest` atuais; `fieldset.form-section`.
- Produces: `protected closeModals(): void` ignora pedido com `submitting`; `private resetModals(): void` faz a limpeza atual sem guarda e é chamado no sucesso de `submit`; `savePart(): void` não duplica submissão pendente. Identificação: código, peça, unidade, localização. Estoque e custo: mínimo, custo unitário (R$), ativa. Sem controle de saldo.

### Task 4: Movimento com contexto, unidade e impacto estimado

**Files:**
- Modify: `frontend/src/app/pages/parts/parts.component.html` (`:271-310`).
- Modify: `frontend/src/app/pages/parts/parts.component.ts` (`movementForm :132-136`, `saveMovement :211-229`, helpers locais).
- Create: `frontend/src/app/pages/parts/parts.component.movement.spec.ts`.

### Task 5: Histórico rastreável e cancelamento do estorno

**Files:**
- Modify: `frontend/src/app/pages/parts/parts.component.html` (`:312-389`).
- Modify: `frontend/src/app/pages/parts/parts.component.ts` (`:110-112,232-264,288-295`, estilos inline da reversão).
- Create: `frontend/src/app/pages/parts/parts.component.history.spec.ts`.

**Interfaces:**
- Consumes: `PartMovementResponse`, `canReverseMovement`, `reverseMovement(id, reason)` e ciclo de fechamento da 3.
- Produces: `historyLoadFailed`, `historyHasLoaded`, `historyLoadErrorMessage` (signals por peça); `protected retryHistory(): void`; `protected cancelReversal(): void` limpa id/motivo/erro da operação sem fechar histórico, e não faz nada durante envio. `confirmReversal(movement): void` ignora submissão repetida; `loadHistory(partId)` cancela leitura anterior e não publica resposta de outra peça.

**Interfaces:**
- Consumes: inputs `rmaId: number`, `rmaStatus: RmaStatus`, `getRmaParts(rmaId)` e `list()`; não muda requisições nem visibilidade por perfil.
- Produces: `loadFailed`, `hasLoaded`, `loadErrorMessage`, `catalogLoading`, `catalogLoadFailed`, `catalogLoadErrorMessage` (signals locais); `protected retryLoad(): void` para peças da OS e `protected retryCatalog(): void` para opções. `private load(rmaId: number): void` e `private loadCatalog(): void` mantêm assinaturas canceláveis distintas; catálogo só é pedido quando `canCreateReservation()`. Troca de OS invalida resumo/formulário/erro e leitura anteriores. Callbacks de escrita que recarregam devem conferir o id capturado antes de aplicar efeito a outra OS.

**Files:**
- Modify: `frontend/src/app/shared/rma-parts-panel/rma-parts-panel.component.html` (`:4-13,30-82`).
- Modify: `frontend/src/app/shared/rma-parts-panel/rma-parts-panel.component.ts` (estilos inline, helpers de apresentação).
- Modify: `frontend/src/app/shared/rma-parts-panel/rma-parts-panel.component.spec.ts` (resumo e seletor de cancelamento).
- Create: `frontend/src/app/shared/rma-parts-panel/rma-parts-panel.component.presentation.spec.ts`.

### Task 7a: Rodapés e validação local de impedimentos

**Files:**
- Modify: `frontend/src/app/shared/rma-block-panel/rma-block-panel.component.html`.
- Modify: `frontend/src/app/shared/rma-block-panel/rma-block-panel.component.ts` (helper de erro e estilos inline tocados).
- Modify: `frontend/src/app/shared/rma-block-panel/rma-block-panel.component.spec.ts`.

**Interfaces:**
- Consumes: `open(id: number): void`, `close/cancel/save`, `busy`, `blockForm`, `resolveForm`, `canEdit` e output `updated: EventEmitter<RmaResponse>`, intactos.
- Produces: `protected hasError(control: AbstractControl): boolean`, inválido e tocado/alterado. Formulário de bloqueio em seção “Bloquear OS”; resolução em “Resolver impedimento”; rodapé `.form-actions--full` com Cancelar (`type="button"`, `close()`) à esquerda de Bloquear OS/Desbloquear OS (`type="submit"`). Fechar do cabeçalho permanece para consulta, erro e carga.

- [ ] **Step 1: Testes novos:**
  - `puts Cancelar before Bloquear OS and closes without a write` e `puts Cancelar before Desbloquear OS`: usar `expectCancelBeforePrimary(dialog)`, clicar Cancelar; `expect(dialog.open).toBe(false)` e nenhum POST/PATCH. Hoje não existe `.form-actions` nem Cancelar.
  - `shows trimmed required errors beside the current form`: motivo/espaços ou resolução/espaços → `expect(field.textContent).toContain('Informe o motivo do impedimento.')` / “Informe a nota de resolução.”; limites → “Use até 1000 caracteres.” e categoria “Use até 80 caracteres.”. Hoje só mensagem geral no início do painel.
  - `disables the new cancel action while writing`: requisição HTTP pendente, `expect(cancel.disabled).toBe(true)`, clicar/chamar close mantém `dialog.open`; erro mantém texto e permite cancelar; sucesso mantém painel aberto com histórico atualizado, como hoje. A guarda de `close` é preservação; botão Cancelar desabilitado é novidade.
  **Preservação:** suíte atual inteira (nota obrigatória, normalização, limites, conflitos, emissão, cancelamento de carga); teste parametrizado dos quatro perfis, só VIEWER sem formulário, e chamada direta a `save()` sem permissão não faz HTTP (guarda já existe). Sem `rma` carregado ou com `busy`, não enviar. `dialog.showModal()`, Escape nativo via `cancel`, autofocus e semântica nativa preservados.
- [ ] **Step 2: Rodar o vermelho.**
  ```bash
  npm --prefix frontend test -- --watch=false --runner-config 'C:\Users\joseh\AppData\Local\Temp\vitest-runner.config.mjs' --include 'src/app/shared/rma-block-panel/*.spec.ts'
  ```
  Esperado: FAIL em rodapés/erros por campo; testes existentes de carga e negócio PASS.
- [ ] **Step 3: Implementar** rodapés nos **dois** formulários e mensagens conforme validador existente; associar ajuda/erro ao campo. Não mudar `save`, obrigatoriedade, endpoints, abertura/fechamento ou tratamento de conflitos. Reusar tokens nos espaçamentos tocados; não criar diálogo substituto.
- [ ] **Step 4: Repetir o comando.** Esperado: PASS.
- [ ] **Step 5: Commit.** `git add` dos três **Files**; `git commit -m "fix(impedimentos): incluir cancelar e erros por campo (NAV-98)"`.

### Task 7b: Histórico de impedimentos com fatos identificados

**Files:**
- Modify: `frontend/src/app/shared/rma-block-history/rma-block-history.component.ts` (template/estilos inline `:9-55`).
- Create: `frontend/src/app/shared/rma-block-history/rma-block-history.component.spec.ts`.

**Interfaces:**
- Consumes: único input `rma: RmaResponse`, `SlaClockService.now`, `blockDateTime/blockDuration`, ordenação atual (`:63`).
- Produces: sem interface nova. Cada episódio exibe Motivo, Categoria, Início, Bloqueado por, Duração; resolvidos acrescentam Resolvido em, Resolvido por, Nota de resolução. Estado Bloqueado/Resolvido separado; duração ativa usa relógio, resolvida usa `resolvedAt`. Não acrescentar requisições nem controles de escrita.

- [ ] **Step 1: Testes novos:** `labels the start, duration and resolution of each episode` - ativo e resolvido, `expect(labels).toContain('Início'); expect(labels).toContain('Nota de resolução')`, nota em valor associado; duração no episódio ativo, hoje inexistente ali e nota sem rótulo. `updates the duration of an active episode without changing the resolved duration` - avançar signal de relógio controlado, ler valores antes/depois: ativo muda e resolvido não, sem alterar input; a novidade é a duração identificada por episódio ativo, o cálculo utilitário existente é preservação.
  **Preservação:** ordenação decrescente por início/id, array original intacto; motivo/categoria/autor/datas/nota existentes; sem bloqueio atual distinto de nenhum histórico; aviso “O período bloqueado continua contando no SLA.” sempre presente; texto longo não truncado por TS. Usar relógio fixo para não depender de data real.
- [ ] **Step 2: Rodar o vermelho.**
  ```bash
  npm --prefix frontend test -- --watch=false --runner-config 'C:\Users\joseh\AppData\Local\Temp\vitest-runner.config.mjs' --include 'src/app/shared/rma-block-history/*.spec.ts' --include 'src/app/shared/rma-block-panel/*.spec.ts'
  ```
  Esperado: FAIL nos rótulos/duração ativa por episódio; painel e negócio PASS.
- [ ] **Step 3: Implementar** pares `dl/dt/dd`, mantendo lista de eventos e resumo de bloqueio atual. Identificar início com `<time datetime>` dentro do valor; ausência de categoria continua “Sem categoria”. Não mover os dados para chips nem criar medição de SLA nova.
- [ ] **Step 4: Repetir o comando.** Esperado: PASS, inclusive painel aplicador.
- [ ] **Step 5: Commit.** `git add` dos dois **Files**; `git commit -m "feat(impedimentos): identificar fatos e resolucao no historico (NAV-98)"`.

### Task 8: Estados da execução de protocolos e do catálogo auxiliar

**Files:**
- Modify: `frontend/src/app/shared/rma-protocols/rma-protocols.component.ts` (`:113-121,136-140,245-250`).
- Modify: `frontend/src/app/shared/rma-protocols/rma-protocols.component.html` (estado inicial, lista, lançador).
- Create: `frontend/src/app/shared/rma-protocols/rma-protocols.component.load.spec.ts`.

**Interfaces:**
- Consumes: `rmaId`, `canExecute`, `listExecutions(rmaId)`, `listTemplates()` e listas atuais.
- Produces: `loadFailed`, `hasLoaded`, `loadErrorMessage`, `templatesLoading`, `templatesLoadFailed`, `templatesLoadErrorMessage`; `protected retryLoad(): void`; `protected retryTemplates(): void`; `private loadTemplates(): void`. Leitura de execuções cancelável por OS e destruição, como 6a; não compartilhar implementação por abstração. Trocar contexto limpa `editing`, seleção e mensagens da execução anterior. Callbacks de escrita conferem a OS capturado antes de alterar estado após uma troca de contexto. Effect acompanha somente `rmaId`, usando `untracked` se os novos estados forem lidos na carga.

- [ ] **Step 1: Testes novos:**
  - `distinguishes executions failure from no execution`: erro inicial e depois de vazio/execução; `expect(text).toContain('Não foi possível carregar os protocolos da OS.'); expect(text).not.toContain('Nenhum protocolo executado'); expect(text).not.toContain('Bancada PWM')`. Hoje vazio ou execução anterior ficam junto do erro.
  - `retries executions for the current OS`: retry pendente desabilitado e sem progresso antigo; sucesso restaura lista. Hoje não há retry.
  - `reports template failure locally and retries without losing executions`: execuções carregam, catálogo falha; `expect(launcher.textContent).toContain('Não foi possível carregar as opções de protocolos.'); expect(text).toContain('Bancada PWM'); expect(launcher.textContent).toContain('Tentar carregar protocolos')`. Hoje não há tratamento do erro.
  - `does not present no active templates while still loading`: catálogo pendente → “Carregando opções de protocolos...”; sucesso vazio → “Nenhum protocolo ativo disponível.”; falha nunca é vazio. Hoje lançador simplesmente desaparece em todos esses casos.
  - `does not overwrite another OS with an old response`: B responde antes de A; somente execução/versão de B, sem editor/seleção/erro de A. Hoje assinaturas independentes podem substituir a lista.
  **Preservação:** só ADMIN/TECHNICIAN pedem catálogo; opções filtram somente `active`, com nome/versão, sem inventar filtragem de aplicabilidade por produto; iniciar continua no endpoint atual e trata negativa do servidor. Falha de iniciar/concluir não transforma leitura válida em vazia. Consultas sem execuções são estado vazio legítimo.
- [ ] **Step 2: Rodar o vermelho.**
  ```bash
  npm --prefix frontend test -- --watch=false --runner-config 'C:\Users\joseh\AppData\Local\Temp\vitest-runner.config.mjs' --include 'src/app/shared/rma-protocols/*.spec.ts'
  ```
  Esperado: FAIL em estados/retry/ordem; preservação PASS.
- [ ] **Step 3: Implementar** precedência da leitura principal e estados locais do lançador. Ocultar ações sobre execuções desatualizadas após falha, sem eliminar leitura válida por erro do catálogo. Não criar endpoint ou buscar novas versões para substituir uma execução iniciada.
- [ ] **Step 4: Repetir o comando.** Esperado: PASS.
- [ ] **Step 5: Commit.** `git add` dos três **Files**; `git commit -m "fix(protocolos): separar carga falha e opcoes na execucao (NAV-98)"`.

### Task 9: Checklist, progresso dos obrigatórios e leitura das tentativas

**Files:**
- Modify: `frontend/src/app/core/utils/protocol-ui.ts` (`protocolProgressLabel/Percent :34-40`).
- Create: `frontend/src/app/core/utils/protocol-ui.spec.ts`.
- Modify: `frontend/src/app/shared/rma-protocols/rma-protocols.component.ts` (`progressLabel/progressPercent`, apresentação e estilos inline).
- Modify: `frontend/src/app/shared/rma-protocols/rma-protocols.component.html` (cabeçalho/item/progresso/histórico de tentativas).
- Modify: `frontend/src/app/shared/rma-protocols/rma-protocols.component.spec.ts` (expectativa de progresso).
- Create: `frontend/src/app/shared/rma-protocols/rma-protocols.component.presentation.spec.ts`.

**Interfaces:**
- Consumes: estados da 8; dados de `ProtocolExecutionResponse`, `ProtocolTemplateItemResponse`, `ProtocolItemResultResponse`; rótulos e normalizador atuais.
- Produces em `protocol-ui.ts`: `protocolProgressLabel(execution: Pick<ProtocolExecutionResponse, 'requiredItems' | 'pendingRequiredItems'>): string` e `protocolProgressPercent(execution: Pick<ProtocolExecutionResponse, 'requiredItems' | 'pendingRequiredItems'>): number`. Ambos passam a medir obrigatórios atendidos: numerador limitado ao intervalo 0..B; B=0 retorna texto “Sem itens obrigatórios” e percent=0. B>0: “A/B obrigatórios atendidos” e percentual arredondado. Antes de mudar, buscar todos os aplicadores para confirmar o recorte; na inspeção o uso está no painel de execução. `progressLabel/progressPercent` continuam wrappers locais. Total registrado passa a texto separado “N/T itens registrados”.

- [ ] **Step 1: Testes novos:**
  - Utilitário `measures satisfied required items rather than recorded optional items`: `{totalItems:3,completedItems:2,requiredItems:2,pendingRequiredItems:1}` → `expect(protocolProgressLabel(execution)).toBe('1/2 obrigatórios atendidos'); expect(protocolProgressPercent(execution)).toBe(50)`. Hoje mede 2/3 e retorna 67.
  - Utilitário `does not invent completion when there are no required items`: zero obrigatórios com opcionais registrados → label acima e percent 0; entrada fora do intervalo não produz percent negativo/>100. Hoje o percentual considera opcionais. `normalizeDecimal` permanece com vírgula/ponto/vazio (preservação).
  - Painel `separates protocol version, state and both real measures`: nome/versão atuais, estado separado e `expect(text).toContain('2/3 itens registrados'); expect(text).toContain('1/2 obrigatórios atendidos')`; barra com `role="progressbar"`, `aria-valuemin=0`, `aria-valuenow=1`, `aria-valuemax=2`, nome que identifica o protocolo; zero obrigatórios sem barra. Hoje não há denominador dos obrigatórios nem semântica de progresso.
  - `keeps expected range and instructions after a result`: medição já registrada; `expect(itemPanel.textContent).toContain('Resultado esperado'); expect(itemPanel.textContent).toContain('Mínimo: 11,5 V'); expect(itemPanel.textContent).toContain('Máximo: 12,5 V')` e instrução original; etapa, título e resultado em elementos distintos. Faixa com só mínimo/só máximo/sem limite usa apenas valores disponíveis. Hoje contexto some e faixa/instruções não são exibidas.
  - `reads all attempts with evidence and justification`: duas tentativas com resultados diferentes, autor/instante próprios; abrir “Histórico de resultados”; `expect(attemptRows).toHaveLength(2); expect(historyText).toContain('Foto da bancada'); expect(historyText).toContain('Repetição após ajuste')`. Hoje só número da última tentativa é mostrado. VIEWER pode ler esse histórico, sem Registrar/Repetir/Concluir.
  **Preservação:** nome/versão antigos mesmo com catálogo na versão seguinte; ordem dos itens/etapas como API (sem reagrupar/reordenar por nome); `latest` determina estado atual e `attempts` não é sobrescrito. `FAILED` com todos registrados e um obrigatório pendente pode chamar Concluir e receber estado `FAILED` do servidor; nunca derivar elegibilidade de conclusão do percentual. Estado/texto acompanham cor, datas no fuso atual. Não confundir medição string `'0'` com ausência; valor e unidade do resultado preservados.
- [ ] **Step 2: Rodar o vermelho.**
  ```bash
  npm --prefix frontend test -- --watch=false --runner-config 'C:\Users\joseh\AppData\Local\Temp\vitest-runner.config.mjs' --include 'src/app/core/utils/protocol-ui.spec.ts' --include 'src/app/shared/rma-protocols/*.spec.ts'
  ```
  Esperado: FAIL nas assertivas de progresso/contexto/tentativas; preservação PASS. Usar fixtures completas de `ProtocolExecutionResponse`, aceitas pela assinatura atual e pela planejada, para observar um vermelho comportamental antes de mudar o helper. Relatar erro de compilação separadamente se ocorrer.
- [ ] **Step 3: Implementar** checklist na ordem atual, “Etapa”/item/resultado separados, Obrigatório por texto em vez de asterisco isolado, contexto esperado persistente e `<details>` com resultados de `attempts` já disponíveis. Histórico inclui tentativa, resultado/valor/unidade, evidência, justificativa, autor e instante; não buscar dados novos nem permitir editar tentativa anterior. Reusar rótulos e tokens, remover hex/radius soltos somente nos estilos tocados. Não mudar regra de conclusão.
- [ ] **Step 4: Repetir o comando.** Esperado: PASS no utilitário e painel; teste antigo de progresso atualizado para as duas medidas.
- [ ] **Step 5: Commit.** `git add` dos seis **Files**; `git commit -m "feat(protocolos): explicitar obrigatorios contexto e tentativas (NAV-98)"`.

### Task 10: Registro de resultado com regras visíveis e erro próximo

**Files:**
- Modify: `frontend/src/app/shared/rma-protocols/rma-protocols.component.ts` (`:128-133,147-203`, helpers e erro da edição).
- Modify: `frontend/src/app/shared/rma-protocols/rma-protocols.component.html` (ações e formulário de resultado `:38-74`, lançador).
- Create: `frontend/src/app/shared/rma-protocols/rma-protocols.component.result.spec.ts`.

**Interfaces:**
- Consumes: `EditingItem`, `resultForm`, `openResult`, `recordResult`, `complete`, `startExecution`, regras verificadas no servidor e estados da 8.
- Produces: `protected requiresEvidence(): boolean` = edição presente, item exige evidência e resultado `PASSED`; `protected requiresJustification(): boolean` = edição presente e (`latest !== null` ou resultado não `PASSED`); métodos leem formulário a cada render. `protected readonly resultErrorMessage = signal('')` para erro do registro; `cancelResult(): void` ignora `submitting`, senão encerra edição e limpa erro local. `startExecution/openResult/saveResult/completeExecution` ignoram reentrada enquanto `submitting`. Nenhum campo, tipo ou membro de `ProtocolItemResultRequest` muda.

- [ ] **Step 1: Testes novos:**
  - `signals justification for failed or non applicable first results`: abrir sem `latest`, escolher `FAILED` e `NOT_APPLICABLE`; `expect(justificationLabel.textContent).toContain('Justificativa obrigatória')`. PASSED inicial não marca; repetição PASSED marca. Hoje só repetição é sinalizada.
  - `signals evidence only when the current rule requires it`: item configurado, PASSED marca “Evidência obrigatória”; FAILED/NOT_APPLICABLE exibem “Evidência (opcional)”, com input mantido e sem asterisco obrigatório. Hoje asterisco aparece nos três. Não esconder a opção de registrar evidência facultativa.
  - `keeps result errors inside the editing form`: `recordResult` retorna negativa por evidência, justificativa, precisão/faixa ou texto, em casos separados; `expect(form.querySelector('[role="alert"]')?.textContent).toContain(serverMessage)` e todos os valores/edição ficam mantidos. Hoje erro aparece no topo do painel, fora do formulário.
  - `does not discard or submit a result twice while saving`: `Subject`, Cancelar desabilitado, chamar `cancelResult()` não fecha; clicar novamente em submit/iniciar/concluir/registrar outro item não repete nem troca a edição; `expect(recordResult).toHaveBeenCalledTimes(1)`. Hoje Cancelar fecha e métodos permitem reentrada. No erro libera; no sucesso fecha editor e aplica somente execução devolvida pelo servidor.
  - `uses explicit execution action labels`: botões com “Iniciar protocolo”, “Registrar resultado”, “Repetir registro” e “Concluir protocolo”; `expect(firstRecord.textContent.trim()).toBe('Registrar resultado')`. Hoje aparecem Iniciar/Registrar/Repetir/Concluir sem objeto da ação.
  **Preservação:** teste de `12,50 → 12.50` e `startedAt:null`, opcionais normalizados para null; resultado de TEXT e CHECK não envia medição; limites 1000/500/500 permanecem. Regras de ausência de evidência/justificativa/medição/texto e faixas continuam validadas pelo backend: estes testes simulam o erro, não pretendem provar a implementação do servidor. Concluir com reprovação continua chamável como na 9. Quatro perfis, só ADMIN/TECHNICIAN com ações; Cancelar antes de Registrar resultado, com `expectCancelBeforePrimary`.
- [ ] **Step 2: Rodar e ver falhar.** Comando de protocolos da 8; esperado FAIL nos rótulos condicionais, proximidade do erro e estabilidade; preservação PASS.
- [ ] **Step 3: Implementar** `fieldset.form-section` “Registrar resultado” no editor inline, contexto da 9 preservado e regras indicadas por texto/`aria-required` conforme condições acima. Não introduzir `required`/validators de negócio adicionais nem bloquear Concluir por resultado. Manter inputs de evidência e justificativa facultativos disponíveis; usar texto auxiliar que explica quando são obrigatórios. Separar erro de registro de erros de iniciar/concluir/carga; limpar erro ao abrir, cancelar, reenviar e trocar contexto. Desabilitar ações concorrentes enquanto há escrita pendente.
- [ ] **Step 4: Repetir o comando.** Esperado: PASS, inclusive ciclo erro → reenviar → sucesso e histórico atualizado sem apagar tentativas anteriores.
- [ ] **Step 5: Commit.** `git add` dos três **Files**; `git commit -m "fix(protocolos): preservar registro pendente e explicitar regras do resultado (NAV-98)"`.

### Task 11: Editor residual - resumo dos itens e edição focada

**Files:**
- Modify: `frontend/src/app/pages/protocols/protocols.component.html` (somente lista/edição de itens `:169-249`).
- Modify: `frontend/src/app/pages/protocols/protocols.component.ts` (`:26-64,140-158,179-186,198-205,272-275`, seleção local).
- Modify: `frontend/src/app/pages/protocols/protocols.component.spec.ts` (expectativa de itens expandidos e recuperação de erro).
- Create: `frontend/src/app/pages/protocols/protocols.component.items.spec.ts`.

**Interfaces:**
- Consumes: três seções, `form.items: FormArray<FormGroup>`, `itemGroup`, `hasError`, `isMeasurement`, `buildTemplatePayload` e ciclo de publicação da etapa 3.
- Produces: `protected readonly selectedItem = signal<FormGroup | null>(null)` por **identidade do controle**, não índice persistido; `protected selectItem(item: FormGroup): void` seleciona sem mutar valores, ignora durante publicação; `private revealFirstInvalidItem(): void` seleciona primeiro grupo inválido e, após render, foca seu primeiro campo inválido visível. Se o erro está apenas num adicional de medição oculto, foca o seletor Tipo e apresenta `protected hiddenMeasurementError(item: FormGroup): string | null`: “Revise <campo>: <mensagem existente>. Selecione Medição para corrigir este valor.”, escolhendo o primeiro inválido na ordem Casas decimais/Mínimo/Máximo. Não troca tipo automaticamente. `addItem(): void` seleciona o novo grupo; `removeItem(index: number): void` mantém mínimo de um, conserva seleção se remove outro e escolhe próximo/último se remove o selecionado. Abrir seleciona primeiro; reset limpa seleção. Os métodos existentes mantêm assinaturas.

- [ ] **Step 1: Testes novos:**
  - `summarizes every item while editing only the selected one`: abrir versão com três itens; `expect(summaryButtons).toHaveLength(3); expect(panel.querySelectorAll('[formControlName="title"]')).toHaveLength(1)`; resumo traz número, etapa, título, tipo, Obrigatório/Opcional e Exige evidência quando aplicável. Hoje há três editores expandidos e nenhum resumo selecionável. Resumos usam botão de texto com `aria-expanded`/`aria-controls`; não criar abas nem action de lápis.
  - `switches items without losing unsaved fields or order`: alterar título/instrução/medição do primeiro, selecionar terceiro e voltar; `expect(titleInput.value).toBe('Título alterado')`; payload final inclui todos em ordem e alterações do item não selecionado. Valores já são preservados no FormArray: novidade testada é alternância real dos editores; igualdade do payload é preservação.
  - `adds and removes items without a stale selection`: Adicionar seleciona novo, Remover selecionado vai ao vizinho e recebe foco no resumo correspondente; remover anterior mantém a identidade selecionada; `expect(visibleTitleInput.value).toBe(expectedNeighbourTitle)`; último item não removível. Hoje não há seleção nem editor único.
  - `reveals a non selected invalid item before refusing publication`: selecionar item 2 válido, deixar item 1 com título vazio; publicar → `expect(selectedSummary.getAttribute('aria-expanded')).toBe('true')` no item 1, `expect(visibleError.textContent).toBe('Informe o item.')`, `expect(document.activeElement).toBe(invalidTitleInput)` e serviço não chamado. Hoje todos ficam expandidos e não há seleção/foco do erro. Não desabilitar grupos ocultos para fazê-los parecer válidos.
  - `identifies an invalid measurement field hidden by a type change`: digitar mínimo inválido em MEASUREMENT, trocar para CHECK e selecionar outro item; publicar revela o item, foca Tipo e mostra orientação iniciada por “Revise Mínimo:”, com a mensagem de formato existente. `expect(itemError.textContent).toContain('Selecione Medição para corrigir este valor.'); expect(updateTemplate).not.toHaveBeenCalled()`. Hoje bloqueia pelo validador, mas não identifica o erro oculto. Corrigir pelo tipo Medição e retornar a CHECK permite o payload legado com adicionais null.
  - `provides multiline instructions and expected result`: `expect(instructions.tagName).toBe('TEXTAREA'); expect(expected.tagName).toBe('TEXTAREA')`, `rows=3`, limites 1000/500 e conteúdo com quebra preservado no payload. Hoje ambos são inputs.
  - `does not change selected fields while publication is pending`: `Subject`, seleção/Adicionar/Remover inativos, `expect(visibleTitleInput.value).toBe(originalSelectedTitle)` após tentativa de troca; falha mantém valores/seleção, libera controles; sucesso fecha. O bloqueio de fechamento já é preservação da etapa 3; a nova seleção deve respeitá-lo.
  **Preservação:** configuração geral, etapas bloqueadas, categoria/produto, checkboxes nativos e rótulos; tipo MEASUREMENT revela unidade/casas/mínimo/máximo apenas no editor selecionado, CHECK/TEXT ocultam os adicionais sem mudar `itemGroup` ou apagar valores; `buildTemplatePayload` continua emitindo null nos adicionais não medidos. Fixtures com casas 0 e 6, min/max negativos e vírgula; erro em campo oculto inválido continua impedindo envio como antes (inclusive validador legado de um adicional que permaneça inválido ao trocar tipo). Nesse caso revelar o item e explicar o campo no erro local, sem limpar valor ou mudar validade silenciosamente. Sem nova regra min≤max. Suíte da etapa 3 sobre criação/nova versão, Cancelar à esquerda, payload e mensagem de consequência continua passando.
- [ ] **Step 2: Rodar o vermelho.**
  ```bash
  npm --prefix frontend test -- --watch=false --runner-config 'C:\Users\joseh\AppData\Local\Temp\vitest-runner.config.mjs' --include 'src/app/pages/protocols/*.spec.ts'
  ```
  Esperado: FAIL nas novidades de seleção/revelação/textarea; os testes de negócio/ciclo da etapa 3 PASS. Ajustar o teste de `:333-339` para resumos, sem apagar cobertura de Remover item; testes de erros selecionam o item afetado antes de consultar seu DOM.
- [ ] **Step 3: Implementar** a seleção local dentro de Itens: lista de resumos e apenas um editor montado, com `formArrayName="items"`, `[formGroupName]` correto e controles mantidos no FormArray. Usar leitura atual de controles nos resumos, sem `computed` que congele valores do formulário. Mínimo em 320 px: lista e editor empilhados, nenhum painel lateral obrigatório. Instruções/resultado esperado em textarea de largura completa. Na publicação inválida revelar primeiro item com erro; se o controle inválido é um adicional oculto pelo tipo, identificar nome/erro e permitir reabrir Medição para corrigi-lo, preservando a regra legada. Não adicionar ordenação por arraste, duplicação, autosave, novos campos ou publicação retroativa.
- [ ] **Step 4: Repetir o comando.** Esperado: PASS; conferir payload de **todos** os itens, não só o selecionado, e reabertura sem estado de seleção anterior.
- [ ] **Step 5: Commit.** `git add` dos quatro **Files**; `git commit -m "feat(protocolos): resumir itens e focar edicao da versao (NAV-98)"`.

## Conferência final da implementação futura

**Files:** nenhum arquivo adicional. Não atualizar estudo, planos anteriores, roteiro de conferência ou estado das etapas automaticamente. Esta conferência não é tarefa de produto nem gera commit vazio.

**Interfaces:** consome os commits das tarefas 1–11; produz relatório de comandos, resultados, orçamentos e pendências, mais roteiro manual para o usuário.

## Critérios de aceite

## Roteiro manual para o usuário

Backend em `localhost:8080`, frontend por `npm --prefix frontend start -- --port 4300`, login realizado pelo próprio usuário. Conferir em **1440 px e 320 px**, também com zoom de 200% e teclado; tabela pode rolar internamente, página e formulário não devem criar rolagem horizontal.

## Decisões tomadas na elaboração, sem nova decisão do usuário

Estas são propostas do autor do plano, não acordos adicionais atribuídos ao usuário:

## Fora de escopo e backlog justificado

- **F1 - Coordenação reutilizável de foco nos diálogos (conferência global / etapa 7).** É dívida real já registrada no roteiro manual, não uma funcionalidade descartada. A referência mínima existe em `shared/rma-detail-modal/rma-detail-modal.component.ts:68-91`: captura de foco anterior, foco inicial após render, Tab circular e devolução no destroy; o Escape já ignora outro `dialog[open]`/overlay sobreposto. Copiá-la para Peças/editor não cobre os pais em `pages/rmas`, abertura de impedimentos sobre detalhe, disparadores removidos após reload e Escape aplicado pelo select (`shared/form-controls/custom-select/custom-select.component.ts:153-159`). Nesta base há também alterações de fechamento desses controles. Corrigir globalmente exigiria mudar componentes fora deste recorte e validar a pilha de diálogos; por isso não entra silenciosamente em uma tarefa de apresentação.
  - Candidato mínimo para esse backlog: uma diretiva pequena para overlays não nativos, sem biblioteca/serviço de modais, que receba permissão de fechamento e emita pedido de fechar; foco inicial no painel, Tab/Shift+Tab apenas no diálogo superior, exclusão de campos ocultos/desabilitados e retorno ao acionador conectado (fallback definido no pai). Escape respeita `defaultPrevented`/select aberto e escrita pendente. Primeiro testar diálogo simples, zero focáveis, acionador removido e sobreposição com `<dialog>`; então migrar os pais/filhos no mesmo recorte de acessibilidade. Não duplicar no `dialog.showModal()` do painel de impedimentos. Este candidato **não** cria arquivo nem API nesta entrega.
  - Aceite futuro de F1: confinamento e retorno por teclado no navegador, inclusive nativo sobre overlay, sem fechar o pai ao fechar o filho. Até lá, a pendência permanece explícita na aceitação/manual desta etapa.
- Operações em lote do Kanban: seleção fora dos filtros, confirmação e resultado parcial ficam intactos; a seção do estudo é lida para preservar o recorte, não para reabrir esse fluxo.
- Catálogo de protocolos e formulário geral já tratados na etapa 3; publicação retroativa, migração de execuções, novos tipos/validações, anexos/upload de evidência, comparação de versões, duplicação/reordenação/autosave de itens.
- Compras/fornecedores/pedidos, reposição automática, alocação automática, recálculo de custos, novos indicadores/dashboard, filtros/paginação novos, exclusão/edição de movimentos, regras novas de autorização ou obrigatoriedade.
- Diálogos da lista de ordens de serviço, mudanças de abas/detalhes ou fluxo do Kanban; refatoração de serviços/modelos, backend, rotas e CSS global; atualização de outros documentos ou fechamento administrativo das etapas.

## Autorrevisão do plano

- Cobertura do estudo: peças → 1–6; impedimentos → 7; execução → 8–10; editor residual → 11; decisões globais → restrições, indicadores e roteiro. A parte de lote e F1 estão explicitamente fora, com justificativa.
- Toda tarefa implementável tem **Files**, **Interfaces**, vermelho com asserção identificada, preservação separada, comando/saída esperada, implementação mínima e um commit. Verificação final não finge introduzir comportamento novo nem exige commit vazio.
- Estados de erro persistem separados de mensagens transitórias; cancelamento nativo não foi confundido com falta de focus trap. Progresso de obrigatórios não foi convertido em regra nova de conclusão. Resumo oculto não exclui controles de payload/validação.
- Este arquivo é o único artefato desta solicitação; nenhuma implementação, teste executado, build executado ou conferência autenticada é afirmado como realizado.
