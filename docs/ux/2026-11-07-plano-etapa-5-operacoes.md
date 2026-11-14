# Etapa 5 — Operações especializadas Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans or superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Este documento é somente um plano; a solicitação atual não autoriza implementar nem commitar código.

**Goal:** Harmonizar estoque, reposição, movimentos/estornos/histórico, reservas de peças, impedimentos e execução de protocolos com a base visual entregue; completar no editor de versões somente o resumo e a edição focada dos itens. Tornar estados, quantidades, custos, consequências e próximas ações inequívocos, preservando contratos, permissões e rastreabilidade.

**Architecture:** Alterações locais nos componentes existentes, reutilizando `app-page-header`, `button[appRowAction]`, `fieldset.form-section`, controles compartilhados e tokens de `frontend/src/styles.css`. Cada recurso assíncrono distingue carga, falha e vazio; os padrões de `loadFailed`/`hasLoaded`/`retryLoad`/`clearFilters` são adaptados às listas não paginadas destas operações, sem introduzir `PagedList`. Uma alteração pequena em `core/utils/protocol-ui.ts` explicita o progresso dos obrigatórios; o editor mantém seu `FormArray` e seu construtor de payload. Nenhum serviço HTTP, modelo de API ou backend muda. A coordenação global de foco fica em backlog justificado neste plano.

**Tech Stack:** Angular 21 (standalone, signals, reactive forms, `@if/@for`), RxJS, Vitest pelo runner Angular, CSS com os tokens atuais (`--control-height`, `--control-height-sm`, `--space-*`, `--radius-*`, cores e tipografia).

**Spec:** `docs/ux/2026-11-06-estudo-ui-ux.md` — “Peças: estoque, reposição, movimento e reservas” (`:145-151`), “Protocolos: catálogo e editor de versões” (`:161-165`), “Protocolos: execução na OS” (`:167-169`), “Impedimentos e operações em lote” (`:190-194`, somente impedimentos), “Decisões que valem para qualquer tela” (`:103-111`) e contrato de componentes (`:302-317`); `docs/ux/2026-11-07-etapa-1-fundacao-visual.md`; `docs/ux/2026-11-07-roteiro-conferencia-manual.md`. Modelo de formato e rigor: planos das etapas 3 e 4, especialmente separação entre novidade e preservação.

**Base inspecionada:** diretório atual, branch `main`, em 8 de novembro de 2026. Na abertura havia alterações preexistentes de fechamento da etapa 4 em ordens de serviço, Kanban, detalhe e controles compartilhados. Durante a elaboração esse fechamento avançou externamente; a conferência final encontrou `main` em `f889f70` (contrato comum dos detalhes), precedido por `2aaf896`, `6e409f9` e `dda22b2`. Nenhum desses arquivos foi escrito nesta solicitação; não reverter nem incluir trabalho anterior nos commits da etapa 5. As evidências do escopo foram reconferidas, e as referências de ordens de serviço abaixo usam o fechamento atual. Reconfirmar âncoras antes de executar.

**Ordem e dependências:** 1 → 2 → 3 → 4 → 5 (mesmos arquivos de Peças); 6a → 6b (reservas); 7a → 7b (impedimentos, o painel consome o histórico); 8 → 9 → 10 (execução de protocolos); 11 (editor, independente das operações e dependente apenas da etapa 3 já entregue); conferência final. Cada tarefa é revisável e testável separadamente. Executar sequencialmente os grupos que editam os mesmos arquivos.

## Global Constraints

- **Esta entrega escreve somente** `docs/ux/2026-11-07-plano-etapa-5-operacoes.md`. Não implementar os passos, criar specs, executar commits, alterar outros documentos ou atualizar o estado das etapas nesta solicitação. Testes e build abaixo são comandos para a futura implementação; não foram executados para produzir este plano. A inspeção desta entrega foi por leitura de templates, TS, estilos e specs.
- **Decisões do usuário:** paleta atual; controles de 40 px (`styles.css:35`), exceção já existente de 34 px para ações pequenas (`:36`); Cancelar à esquerda; indicadores avaliados por tela. Não criar tokens, cores, ícones ou bibliotecas. Estilos locais novos usam tokens; não fazer limpeza global de CSS.
- **Reutilização:** cabeçalho em `shared/page-header/page-header.component.ts:22-40`; ação de linha em `shared/row-action/row-action.component.ts:28-86`; `fieldset.form-section` em `styles.css:1041-1065`, com coluna única em `:1807-1809`. Referências de estado e limpeza: `clients.component.ts:58-87,118-127`, equivalentes em produtos/usuários e `rmas.component.ts:483-522,694-707`. Não copiar debounce/paginação para listas que hoje filtram imediatamente em memória.
- **API e negócio:** manter `PartService`, `ProtocolService`, `RmaService`, `core/models.ts`, `app.routes.ts` e backend sem alterações. Reusar normalização e formatação existentes (`part-ui.ts`, `protocol-ui.ts`, `date.ts`). Datas continuam no fuso de negócio; moeda BRL; quantidades com unidade quando disponível no contrato.
- **Estoque:** `onHand`, `reserved` e `available` são fatos diferentes (`models.ts:417-419`). Não substituir um pelo outro nem recalcular a lista a partir de reservas locais. `belowMinimum`, sugestão de compra e pendências continuam vindo das fontes atuais. Cadastro de peça nunca ganha campo de saldo nem gera movimento.
- **Movimento:** manter somente `ENTRY`, `EXIT`, `ADJUSTMENT`; zero proibido; entrada/saída positivas; ajuste aceita sinal e exige motivo normalizado (`parts.component.ts:211-229`). A prévia é estimativa sobre o saldo carregado, não promessa de saldo confirmado nem validação de disponibilidade; o servidor continua decidindo concorrência e insuficiência.
- **Estorno:** chama `reverseMovement(id, reason)`, nunca exclusão; motivo obrigatório normalizado, limites atuais, movimento original preservado e relacionado pelo `reversedMovementId`. Não tratar consumo estornado como reabertura de reserva: o backend devolve a quantidade ao saldo livre e marca a reserva `REVERSED` (`PartStockService.java:107-115`). Não calcular estorno invertendo indiscriminadamente estoque e reserva.
- **Reservas:** “Aplicar”, “Efetivar reserva” e **“Cancelar reserva”** ficam visíveis em texto. Manter matriz de estados: OS aberta permite reservar; `ACTIVE` permite aplicar/cancelar; `PENDING` efetivar/cancelar; encerrado só cancelar `ACTIVE`/`PENDING`; `CONSUMED`/`CANCELLED`/`REVERSED` sem essas ações. Encerrados continuam os de `CLOSED_RMA_STATUSES`. Nenhuma alocação automática após entrada de estoque.
- **Permissões existentes:** gerir peças/movimentos/estornos `ADMIN`/`SERVICE_DESK` (`parts.component.ts:114`); reservar/agir em reservas `ADMIN`/`TECHNICIAN` (`rma-parts-panel.component.ts:135-137`); executar protocolos `ADMIN`/`TECHNICIAN` (`rma-protocols.component.ts:119`); editar impedimentos `ADMIN`/`SERVICE_DESK`/`TECHNICIAN` (`rma-block-panel.component.ts:30`). Custos de peças são atualmente visíveis também na consulta: preservar essa visibilidade, sem criar nova política. Editor de protocolos continua na rota exclusiva de `ADMIN`. Testar os quatro perfis com `roles.includes(role)`, não com mocks que devolvem sempre `true`.
- **Impedimentos:** motivo e nota de resolução obrigatórios, sem aceitar só espaços, máximo 1000; categoria opcional, máximo 80 (`rma-block-panel.component.ts:31-32`). Preservar erro de conflito, `updated`, cancelamento da leitura anterior e aviso de que o tempo bloqueado conta no SLA. O painel usa `<dialog>` nativo e `showModal()`: não substituir por overlay nem adicionar um segundo confinamento de foco.
- **Protocolos:** preservar nome/versão fixados na execução e histórico de tentativas. `requiredItems` e `pendingRequiredItems` vêm do servidor; `FAILED` não satisfaz obrigatório, `PASSED` e `NOT_APPLICABLE` satisfazem (`ProtocolItemOutcome.java:8-9`; `ProtocolExecutionService.java:245-250`). Evidência obrigatória somente com `evidenceRequired && outcome === 'PASSED'`; justificativa com tentativa anterior **ou** resultado diferente de `PASSED` (`:94-101,204-205`). Não tornar evidência obrigatória para todos os resultados. Medição, casas decimais/faixa e texto continuam sujeitos às regras atuais do servidor (`:180-205`), sem novo validador de negócio no frontend.
- **Concluir protocolo:** não desabilitar por `pendingRequiredItems > 0`: o backend pode concluir com reprovação quando todos os obrigatórios têm registro, mesmo que algum tenha falhado (`ProtocolExecutionService.java:132-145`). Preservar chamada e retorno/erro atuais. Progresso de obrigatórios atendidos não é autorização para concluir nem percentual da OS.
- **Editor residual:** etapa 3 já entregou lista, cabeçalho, estados, seções Configuração geral/Etapas bloqueadas/Itens, mensagens por campo e estabilidade ao publicar. Não refazê-los. Preservar `itemGroup`, validadores, ordem, checkboxes, remoção mínima de um item e `buildTemplatePayload` (`protocols.component.ts:240-253,285-308`). Publicar continua criando uma versão via `updateTemplate`; execuções antigas não migram.
- **Commits da execução futura:** um por tarefa implementável, apenas seus **Files**, no padrão `tipo(escopo): descrição (NAV-98)`, sem coautoria. Não usar `git add .`; não commitar alterações de fechamento das etapas anteriores. A conferência final não cria commit vazio nem altera os documentos de acompanhamento.
- **Conferência autenticada não é possível nesta execução.** Depende do backend e de login do próprio usuário. Na implementação, comprovar por testes e build e entregar o roteiro manual deste arquivo. Testes de DOM não comprovam geometria, recorte de tooltip, foco nativo real, 320 px ou uso autenticado.

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
| Histórico mistura autor/motivo e omite reserva após | HTML `:340-369`: “Usuário / motivo”, “Saldo após” é só `onHandAfter`; `reservedAfter` já existe em `models.ts:446` | 5 |
| Histórico falho parece vazio; respostas podem chegar fora de ordem | TS `:288-295` não guarda falha nem cancela leitura anterior; HTML `:331-335` mostra “Nenhum movimento registrado.” após erro | 5 |
| Estorno sem Cancelar e sem rótulo persistente para motivo | HTML `:372-376`: input só com placeholder e “Confirmar”; TS `:239-264` não oferece cancelamento individual nem guarda contra duplo envio | 5 |
| Reserva rotula disponível como estoque | `shared/rma-parts-panel/rma-parts-panel.component.html:39` usa `partAvailable` sob “Em estoque”; contrato `models.ts:476` é disponibilidade | 6b |
| Cancelamento de reserva ambíguo | HTML do painel `:57-58` mostra só “Cancelar”; chips `:6-8` usam “reservada(s)/aplicada(s)/pendente(s)” sem dizer que contam reservas | 6b |
| Falha de peças da OS parece nenhuma reserva | HTML `:16-27`; TS `:206-217`: erro do catálogo é convertido silenciosamente em `[]`; não há nova tentativa em nenhuma fonte | 6a |
| Reserva sem mensagens por campo | HTML `:68-81`, TS `:163-165`: apenas erro geral; formulário não tem seção identificada | 6b |
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

- `pages/parts/parts.component.spec.ts:61-85,88-113`: consulta por perfil, motivo do ajuste/estorno e ordem Cancelar/primária. Ao migrar ações para ícone, consultar nome acessível/tooltip; não depender de texto visível “Histórico” no botão.
- `shared/rma-parts-panel/rma-parts-panel.component.spec.ts`: quatro testes cobrem resumos, técnico, saldo insuficiente e OS concluída. Atualizar os textos “1 reservada(s)” etc. e o seletor que procura exatamente “Cancelar” para “Cancelar reserva”; conservar chamadas `(7, 1, 'cancel')` e reserva pendente.
- `shared/rma-block-panel/rma-block-panel.component.spec.ts:34-129`: já cobre erro/retry, espaços/limites, conflito, consulta, nota obrigatória, emissão e troca de OS com cancelamento da leitura. São preservação, não novidades desta etapa. Falta matriz real de perfis, rodapés e mensagens por campo. `rma-block-history` ainda não tem spec próprio.
- `shared/rma-protocols/rma-protocols.component.spec.ts`: conserva versão, normalização `'12,50' → '12.50'`, refresh e Cancelar à esquerda. A expectativa antiga “1/2 itens · 1 obrigatório(s) pendente(s)” muda para duas medidas explicitamente identificadas na Tarefa 9.
- `pages/protocols/protocols.component.spec.ts:309-339,354-405,408-501`: manter as três seções, erros, pendência/fechamento e payload de versão. O teste que espera dois cards expandidos muda para dois resumos e um editor; erros de item oculto passam a ser testados depois de selecionar/revelar o item.
- `core/utils/part-ui.spec.ts` e `core/services/part.service.spec.ts`, `protocol.service.spec.ts`: preservação integral de formato, elegibilidade de estorno e endpoints. Não existe `core/utils/protocol-ui.spec.ts`: será criado na Tarefa 9.

## Decisão de indicadores e informação

| Área | Decisão própria proposta | Escopo verdadeiro |
| --- | --- | --- |
| Cabeçalho Peças | `app-page-header heading="Peças" singular="peça" plural="peças"`; Estoque mostra quantidade filtrada e total somente com busca; Reposição mostra total de peças do catálogo, sem aplicar a busca escondida | Sem contagem antes do primeiro sucesso ou após falha; nenhuma paginação nova |
| Abaixo do mínimo / Reservas pendentes | Manter em uma linha compacta, sem cartões: “No estoque completo: X peças abaixo do mínimo · Y reservas pendentes” | Arrays completos da última carga conjunta, não o resultado da busca; abaixo do mínimo considera só ativas, como hoje |
| Valor em estoque | Retirar o cartão e o cálculo ocioso da página; candidato ao dashboard da etapa 6, sem implementá-lo aqui | Custos unitários na tabela e custos das reservas continuam com moeda e mesmas permissões |
| Disponível / reservado / em estoque | Comparar em colunas com unidade; disponível em destaque, mínimo e “Repor” preservados | Manter a barra decorativa atual com mínimo visível; ela não é percentual de execução nem disponibilidade garantida |
| Reposição | Dois grupos mantidos: “Alerta de reposição” e “Peças pendentes por OS”; separar Nome/Código/Localização | `suggestedQuantity` e `pendingQuantity` da API, sem recalcular, somar unidades diferentes ou gerar pedido de compra |
| Reservas da OS | Linha “Reservas ativas: X · Aplicadas: Y · Pendentes: Z”; custos “Custo aplicado na OS” / “Custo reservado na OS”; por registro “Custo da reserva” | Contagem de registros, não soma de peças/unidades; custos da OS carregado |
| Execução | “N/T itens registrados” separado de “A/B obrigatórios atendidos”, estado e versão | A = `requiredItems - pendingRequiredItems`; B = `requiredItems`; sem obrigatórios: “Sem itens obrigatórios”, sem barra percentual |

## Contrato de carga, mensagens e testes

1. **Peças:** manter o `forkJoin` de `list`, `listReplenishment`, `listPending` como uma carga atômica; falha em qualquer fonte não publica valores parciais. `loadFailed` e `hasLoaded` são sinais; erro da carga tem mensagem própria independente de `clearMessages()`. Precedência em ambas as abas: falha com “Tentar novamente” → primeira carga → vazio real/sem resultado → dados. Durante tentativa após falha, manter o estado de falha, botão “Carregando...” desabilitado e dados/indicadores ocultos até sucesso. Atualização após sucesso pode manter os dados identificados por “Atualizando estoque...”, com ações de mutação desabilitadas durante a carga; nunca mostrar zeros como resultado inicial. `clearFilters(): void` só limpa a busca local, sem HTTP e sem debounce.
2. **Histórico, reservas e protocolos:** falha de leitura principal substitui dados e resumo antigos; nova tentativa usa a peça/OS atual. Catálogos auxiliares têm erro e retry locais: não apagar reservas/execuções carregadas nem dizer “nenhuma opção” após falha. `hasLoaded` é por recurso/contexto; ao trocar peça/OS, limpar resultado, erro e edição do contexto anterior, cancelar leitura pendente e impedir resposta antiga de repor os dados. Reusar o padrão de assinatura cancelável de `rma-block-panel`, sem novo coordenador global.
3. **Escritas:** erro fica junto da operação e mantém valores; falha de leitura não some quando abre/fecha um formulário. Mensagens de sucesso usam `role="status"`; erro de campo/operação `role="alert"` com escopo claro. Durante escrita, impedir repetição da mesma operação e descarte do formulário; liberar no erro. O sucesso pode fechar pelo reset interno, mesmo antes do `finalize`. Isso aplica-se aos fluxos alterados, sem refatoração geral de todos os diálogos.
4. **Preparação dos specs:** usar fábricas e `setup({ role, ...sources })` com mocks configurados **antes** de `TestBed.createComponent`; efeitos de inputs estabilizados com `fixture.detectChanges()`/`whenStable()`. Casos de ordem usam `Subject` por requisição. Ajustes programáticos de reactive forms usam o padrão de `ChangeDetectorRef.markForCheck()` do spec de protocolos, sem converter o formulário inteiro para signals.
5. **Novidade x preservação:** cada teste novo abaixo tem nome e asserção observável que reprova o código inspecionado. Copiar a razão do vermelho como comentário de uma linha no spec. Teste de preservação passa antes e depois; não forçar vermelho nele. Se um teste já passa na base de execução, reclassificá-lo como preservação e registrar por quê. Se o vermelho for de compilação/import, informar separadamente: não afirmar que as asserções rodaram.
6. **Assertivas:** os trechos `expect(...)` abaixo são especificações dos testes, não implementação. Variáveis `panel`, `form`, `text`, `headers`, `row`, `retry`, `cancel`, `primary` designam o DOM do recurso testado; `text` normaliza espaços, incluindo NBSP da moeda. Não comparar snapshots integrais, detalhes internos de CSS nem só a ausência de seletor novo. Nas ocultações, afirmar ausência do texto/valor antigo e presença do substituto.
7. **Comandos:** executar no **Git Bash**, a partir da raiz, sempre com o caminho do runner entre aspas simples. `--include` é relativo ao projeto `frontend`, portanto começa por `src/`. O arquivo de runner existente fora do repo usa `maxWorkers: 2`; não alterá-lo. Comando base:

   ```bash
   npm --prefix frontend test -- --watch=false --runner-config 'C:\Users\joseh\AppData\Local\Temp\vitest-runner.config.mjs'
   npm --prefix frontend run build
   ```

## Review Focus

1. **Resposta antiga em outro contexto / falha após sucesso:** a peça ou OS B nunca exibe resultado, custo, editor ou pendência de A; retry não confirma cache antigo. Testes de `Subject`, falha inicial, após vazio e após registros nas Tarefas 1, 5, 6a e 8.
2. **Quantidade e sinal:** peça com `onHand=10`, `reserved=4`, `available=6`, unidade `m`, e saída `1,5` não pode parecer estoque livre `10`, nem reduzir reserva na prévia; estorno de consumo não reativa reserva. Tarefas 2, 4, 5 e 6b; payloads e servidor mantidos.
3. **Perfil e encerramento:** os quatro perfis, OS aberta/encerrado e cinco estados de reserva mantêm a matriz; custos não ganham restrição inexistente; VIEWER continua lendo histórico/evidência sem ações de escrita. Tarefas 2, 6b, 7a, 9 e 10.
4. **Resultado registrado x obrigatório atendido:** um obrigatório reprovado e um opcional aprovado não significam 100% dos obrigatórios; “Não se aplica” com justificativa segue o resultado do servidor; concluir com reprovação continua possível. Tarefas 9 e 10.
5. **Formulário que desaparece / item inválido oculto:** escrita pendente não perde motivo/resultado; erro não fecha; publicar com item inválido não selecionado revela esse item e sua mensagem, sem excluir campos do payload. Tarefas 3, 4, 5, 7a, 10 e 11. Confinamento e retorno global de foco continuam explicitamente no backlog F1.

---

### Task 1: Estados de carga de estoque e reposição

**Files:**
- Modify: `frontend/src/app/pages/parts/parts.component.ts` (sinais `:87-105`, `load :298-311`, `clearMessages :314-317`).
- Modify: `frontend/src/app/pages/parts/parts.component.html` (estados `:38-75,128-190`, contadores `:13-34`).
- Create: `frontend/src/app/pages/parts/parts.component.load.spec.ts`.

**Interfaces:**
- Consumes: `PartService.list/listReplenishment/listPending`, os três arrays e `loading`, assinaturas HTTP intactas.
- Produces: `protected readonly loadFailed`, `hasLoaded`, `loadErrorMessage` (signals de boolean/boolean/string); `protected retryLoad(): void`; `protected clearFilters(): void`; `private load(): void` continua ponto único da carga conjunta. Guardar/cancelar a assinatura anterior e encerrá-la no destroy; cancelar antes de iniciar o próximo `loading`. `clearMessages()` não limpa falha/mensagem da leitura.

- [ ] **Step 1: Escrever testes novos**, com `setup` parametrizável antes da criação:
  - `never reports empty replenishment before the first response`: três `Subject` pendentes, selecionar Reposição; `expect(text).toContain('Carregando peças...'); expect(text).not.toContain('Nenhuma peça abaixo do mínimo'); expect(text).not.toContain('Nenhuma reserva aguardando saldo')`. Hoje aparecem os dois vazios.
  - `replaces stock and replenishment with load failure`: parametrizar erro em cada fonte e nas duas abas; `expect(text).toContain('Não foi possível carregar as peças.'); expect(text).not.toContain('Nenhuma peça cadastrada'); expect(text).not.toContain('Capacitor')` após sucesso anterior com esse registro. Repetir após sucesso vazio. Hoje vazio/cache continuam no corpo.
  - `keeps failure after opening and closing a form`: erro inicial, abrir Nova peça e cancelar; `expect(panel.textContent).toContain('Tentar novamente')` no corpo da página. Hoje abrir apaga `errorMessage` e não há retry.
  - `retries the complete snapshot without publishing partial arrays`: retry pendente, emitir só peças; `expect(retry.disabled).toBe(true); expect(text).not.toContain('Capacitor')`; só depois das três fontes exibir o registro e ocultar alerta. Hoje não há retry e carga parcial não tem contrato de apresentação.
  - `keeps only the latest complete refresh`: duas cargas controladas, terminar a nova antes de tentar responder a antiga; `expect(text).toContain('Peça atual'); expect(text).not.toContain('Peça antiga')`; a carga substituída é cancelada e não libera o loading da seguinte. Hoje as assinaturas não são canceladas e o retorno antigo pode sobrescrever o novo.
  - `clearFilters restores the local list without another request`: busca sem resultado, clicar “Limpar busca”; `expect(input.value).toBe(''); expect(list).toHaveBeenCalledTimes(1)`. Hoje não existe a ação.
  **Preservação:** três endpoints por carga; busca imediata por código/nome/localização, sem HTTP; seleção de abas não consulta de novo; arrays publicados juntos.
- [ ] **Step 2: Rodar o vermelho.**
  ```bash
  npm --prefix frontend test -- --watch=false --runner-config 'C:\Users\joseh\AppData\Local\Temp\vitest-runner.config.mjs' --include 'src/app/pages/parts/parts.component*.spec.ts'
  ```
  Esperado: FAIL nas novas assertivas de carregamento/falha/retry/limpeza; preservação PASS. Não interpretar mock incompleto ou erro de compilação como prova de comportamento.
- [ ] **Step 3: Implementar** o contrato de carga, sem mudar os endpoints nem separar o `forkJoin`. Usar os títulos “Nenhuma peça cadastrada” (CTA só para `canManage`), “Nenhuma peça encontrada” / “Limpar busca”, e os vazios próprios da reposição somente após sucesso. Ocultar contadores de abas/indicadores sem resultado válido. Desabilitar ações de escrita sobre snapshot em atualização.
- [ ] **Step 4: Repetir o comando.** Esperado: todos os specs selecionados PASS, inclusive os existentes.
- [ ] **Step 5: Commit.** `git add` somente os três **Files**; `git commit -m "fix(pecas): distinguir carga, falha e vazio nas abas (NAV-98)"`.

### Task 2: Composição do estoque e comparação na reposição

**Files:**
- Modify: `frontend/src/app/pages/parts/parts.component.html` (cabeçalho, indicadores, barra, tabelas de estoque/reposição).
- Modify: `frontend/src/app/pages/parts/parts.component.ts` (imports, estilos inline `:49-62`, `stockValue :120`).
- Modify: `frontend/src/app/pages/parts/parts.component.spec.ts` (ações por nome acessível).
- Create: `frontend/src/app/pages/parts/parts.component.presentation.spec.ts`.

**Interfaces:**
- Consumes: estados da 1; `PageHeaderComponent` (`heading/singular/plural/count/total`); `RowActionComponent` (`icon/label/target`); arrays e formatadores atuais.
- Produces: nenhuma API de componente nova. Estoque: Nome/Código, Localização, Em estoque, Reservado, Disponível, Mínimo, Custo unitário, Ações. Reposição: Nome/Código e Localização separados, demais quantidades atuais. `target` das ações = código e nome da peça. Manter Histórico e Movimentar por ícone existente, agora com tooltip comum; não converter outras ações de negócio para ícones.

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

- [ ] **Step 1: Testes novos:** `groups identification and stock policy` — `expect(legends).toEqual(['Identificação', 'Estoque e custo'])`, e cada controle no grupo descrito; hoje grade plana. `keeps the form while creating or updating` — mocks `Subject` para ambos, clicar Fechar/overlay/Cancelar e chamar `savePart` novamente: `expect(formPanel.isConnected).toBe(true); expect(write).toHaveBeenCalledTimes(1)`; hoje fecha e repete chamada. Emitir sucesso: diálogo ausente e recarga; emitir erro em teste separado: valores mantidos, erro dentro do painel, fechar volta a funcionar.
  **Preservação:** payload completo com trim/null, mínimos/custo, limites 60/120/20/120, ativa; criar não chama `registerMovement`; editar não manda `onHand`/`available`/`reserved`; envio inválido marca campos e não chama serviço; `expectCancelBeforePrimary` continua passando. Falha de carga da página sobrevive ao formulário.
- [ ] **Step 2: Rodar e ver falhar.** Comando de Peças da 1; esperado FAIL em seções/fechamento/duplicidade; preservação PASS.
- [ ] **Step 3: Implementar** somente agrupamento e ciclo de gravação descritos. Aplicar `[disabled]` aos fechamentos durante escrita; usar `resetModals` no `next`, pois `finalize` ainda não liberou `submitting`. Não acrescentar obrigatoriedade/limites. Foco global segue F1.
- [ ] **Step 4: Repetir o comando.** Esperado: PASS, inclusive rodapé de movimento e estorno existentes.
- [ ] **Step 5: Commit.** `git add` dos três **Files**; `git commit -m "feat(pecas): organizar cadastro e preservar formulario durante gravacao (NAV-98)"`.

### Task 4: Movimento com contexto, unidade e impacto estimado

**Files:**
- Modify: `frontend/src/app/pages/parts/parts.component.html` (`:271-310`).
- Modify: `frontend/src/app/pages/parts/parts.component.ts` (`movementForm :132-136`, `saveMovement :211-229`, helpers locais).
- Create: `frontend/src/app/pages/parts/parts.component.movement.spec.ts`.

**Interfaces:**
- Consumes: ciclo de escrita da 3, `movementPart`, `movementForm`, regras atuais e formatadores.
- Produces: `protected movementPreview(): { onHandBefore: number; onHandAfter: number; reserved: number; availableBefore: number; availableAfter: number } | null`, método que lê o formulário a cada render, não `computed` sobre reactive forms. Para entrada somar quantidade; saída subtrair; ajuste somar valor assinado; reservado não muda. Sem peça, quantidade inválida/não finita/zero ou sinal inválido para entrada/saída: `null`. `saveMovement(): void` mantém validações e impede repetição pendente.

- [ ] **Step 1: Testes novos:**
  - `previews a fractional exit without changing reservations`: peça 10/4/6 `m`, saída 1.5 via input; `expect(preview.textContent).toContain('Em estoque: 10 m → 8,5 m'); expect(preview.textContent).toContain('Disponível: 6 m → 4,5 m'); expect(preview.textContent).toContain('Reservado: 4 m')`. Hoje não há prévia.
  - `updates the estimate for entry and signed adjustment`: entrada 2 → 12/8; ajuste -2 → 8/4, reservado 4; zero/quantidade vazia → ausência de números projetados, com orientação “Informe uma quantidade válida para ver a estimativa.”. Hoje somente disponível no cabeçalho.
  - `shows movement errors beside quantity or reason`: zero, entrada negativa e ajuste sem motivo; `expect(quantityField.textContent).toContain('Informe uma quantidade diferente de zero.')`, `expect(reasonField.textContent).toContain('Informe o motivo do ajuste.')`; serviço não chamado. Hoje mensagens são apenas banner.
  - `keeps a pending movement and sends it once`: clique repetido no submit e fechar; `expect(registerMovement).toHaveBeenCalledTimes(1); expect(panel.isConnected).toBe(true)`; erro mantém campos e libera fechamento. A guarda de fechamento já é preservação da 3; a novidade é impedir envio repetido deste método.
  **Preservação:** mesmas três opções e payloads; motivo opcional em entrada/saída; ajuste aceita negativo com motivo; limite 255; Cancelar à esquerda; backend pode negar saldo mesmo com prévia calculável. Estimativa negativa não cria regra nova de bloqueio: exibir como estimativa, aceitar retorno do servidor e preservar input no erro.
- [ ] **Step 2: Rodar e ver falhar.** Comando de Peças da 1; FAIL nas novidades de prévia/erro por campo/duplicidade, preservação PASS.
- [ ] **Step 3: Implementar** `fieldset.form-section` “Movimento”, quantidade com unidade da peça, contexto em pares separados (código/nome/saldos), bloco “Impacto estimado” e aviso “Estimativa sobre o saldo carregado. O saldo será confirmado ao registrar.”. Calcular só efeito do movimento manual, conforme `PartStockService.java:73-88`; não antecipar estorno/alocação nem alterar estoque local antes da resposta.
- [ ] **Step 4: Repetir o comando.** Esperado: PASS; payload usa número original, não valor formatado com vírgula/unidade.
- [ ] **Step 5: Commit.** `git add` dos três **Files**; `git commit -m "feat(pecas): explicitar contexto e impacto do movimento (NAV-98)"`.

### Task 5: Histórico rastreável e cancelamento do estorno

**Files:**
- Modify: `frontend/src/app/pages/parts/parts.component.html` (`:312-389`).
- Modify: `frontend/src/app/pages/parts/parts.component.ts` (`:110-112,232-264,288-295`, estilos inline da reversão).
- Create: `frontend/src/app/pages/parts/parts.component.history.spec.ts`.

**Interfaces:**
- Consumes: `PartMovementResponse`, `canReverseMovement`, `reverseMovement(id, reason)` e ciclo de fechamento da 3.
- Produces: `historyLoadFailed`, `historyHasLoaded`, `historyLoadErrorMessage` (signals por peça); `protected retryHistory(): void`; `protected cancelReversal(): void` limpa id/motivo/erro da operação sem fechar histórico, e não faz nada durante envio. `confirmReversal(movement): void` ignora submissão repetida; `loadHistory(partId)` cancela leitura anterior e não publica resposta de outra peça.

- [ ] **Step 1: Testes novos:**
  - `cancels only the reversal`: iniciar estorno; `expect(cancel.textContent.trim()).toBe('Cancelar')`, Cancelar vem antes de “Confirmar estorno”, é `type="button"`; clicar limpa motivo/erro e mantém histórico/linha original, `expect(reverseMovement).not.toHaveBeenCalled()`. Hoje Cancelar inexiste. Não usar helper de rodapé de formulário se a confirmação continuar inline sem `<form>`.
  - `identifies the movement and its reason field`: `expect(confirmation.textContent).toContain('Estornar movimento 9'); expect(label.control).toBe(reasonInput); expect(primary.textContent).toContain('Confirmar estorno')`. Mostrar tipo/data/peça e consequência “O movimento original será mantido.”; hoje apenas placeholder e “Confirmar”.
  - `keeps one pending reversal and its reason on failure`: `Subject`, repetir confirmação/Cancelar/fechar; `expect(reverseMovement).toHaveBeenCalledTimes(1)` e motivo mantido no erro, alerta no histórico; hoje repete requisição.
  - `retries history without showing empty or stale movements`: erro inicial e após registro; `expect(text).toContain('Tentar novamente'); expect(text).not.toContain('Nenhum movimento registrado.'); expect(text).not.toContain('tech')` enquanto a carga falhou. Retry usa peça atual. Hoje mostra vazio ou histórico antigo.
  - `ignores an older part history response`: abrir A e depois B com Subjects; responder B e depois A; `expect(panel.textContent).toContain('Movimento de B'); expect(panel.textContent).not.toContain('Movimento de A')`. Hoje a resposta de A substitui B.
  - `separates author, reason and resulting balances`: `expect(headers).toEqual(['Instante', 'Tipo', 'Variação em estoque', 'Variação reservada', 'Em estoque após', 'Reservado após', 'OS', 'Autor', 'Motivo', 'Ações'])` para gestor; valores com sinais/unidade, `reservedAfter` independente de `onHandAfter`. Hoje há coluna mista e reserva após não aparece.
  **Preservação:** fixture da resposta recarregada contém original `id=9,reversed=true` e estorno `id=10,reversedMovementId=9`: ambos permanecem e vínculo é mostrado; tipos reserva/estorno/já estornado não oferecem Estornar; consumo estornado não chama `reserve`/`allocate`. Motivo vazio/espaços continua negado; válido envia `reverseMovement(9, 'Peça não utilizada')`; sucesso recarrega histórico e estoque/reposição; consulta não oferece estorno. Conservar ordenação da API e OS/autor/instante/motivo; sem edição/exclusão de movimentos.
- [ ] **Step 2: Rodar e ver falhar.** Comando de Peças da 1; FAIL em cancelamento, confirmação, carga/ordem e colunas; preservação PASS.
- [ ] **Step 3: Implementar** confirmação **inline na linha atual**, sem modal sobre modal. Motivo com label/id, `.form-actions` ou grupo equivalente Cancelar/Confirmar estorno que quebre linha em largura estreita, controles de 40 px na confirmação. Não inverter saldos no cliente. Estados de carga/falha próprios do histórico não se confundem com erro de estorno.
- [ ] **Step 4: Repetir o comando.** Esperado: PASS; recarregar após estorno não remove nem filtra o original.
- [ ] **Step 5: Commit.** `git add` dos três **Files**; `git commit -m "fix(pecas): permitir cancelar estorno e manter historico rastreavel (NAV-98)"`.

### Task 6a: Carga de reservas e catálogo com falhas independentes

**Files:**
- Modify: `frontend/src/app/shared/rma-parts-panel/rma-parts-panel.component.ts` (`:120-126,155-159,206-224`).
- Modify: `frontend/src/app/shared/rma-parts-panel/rma-parts-panel.component.html` (estados/resumo e área de nova reserva).
- Create: `frontend/src/app/shared/rma-parts-panel/rma-parts-panel.component.load.spec.ts`.

**Interfaces:**
- Consumes: inputs `rmaId: number`, `rmaStatus: RmaStatus`, `getRmaParts(rmaId)` e `list()`; não muda requisições nem visibilidade por perfil.
- Produces: `loadFailed`, `hasLoaded`, `loadErrorMessage`, `catalogLoading`, `catalogLoadFailed`, `catalogLoadErrorMessage` (signals locais); `protected retryLoad(): void` para peças da OS e `protected retryCatalog(): void` para opções. `private load(rmaId: number): void` e `private loadCatalog(): void` mantêm assinaturas canceláveis distintas; catálogo só é pedido quando `canCreateReservation()`. Troca de OS invalida resumo/formulário/erro e leitura anteriores. Callbacks de escrita que recarregam devem conferir o id capturado antes de aplicar efeito a outra OS.

- [ ] **Step 1: Testes novos:**
  - `shows failed OS parts without an empty reservation message`: erro antes da montagem; `expect(text).toContain('Não foi possível carregar as peças da OS.'); expect(text).toContain('Tentar novamente'); expect(text).not.toContain('Nenhuma peça reservada')`. Repetir após sucesso vazio e com reserva/custo; após falha, valores antigos não aparecem. Hoje falha e vazio/cache aparecem juntos.
  - `retries parts without clearing the failure while pending`: `Subject`, clique no retry; `expect(retry.disabled).toBe(true); expect(text).not.toContain('R$ 20,00')`; sucesso restaura resumo/reservas e tira alerta. Hoje não há retry.
  - `distinguishes catalog failure from an empty active catalog`: peças carregam e catálogo falha; `expect(text).toContain('Não foi possível carregar as opções de peças.'); expect(text).toContain('Tentar carregar peças'); expect(text).toContain('Capacitor')` na reserva existente. Sem selecionar uma opção antiga nem habilitar Reservar até recuperação. Hoje erro do catálogo vira `[]` silencioso.
  - `keeps only the latest OS after a context change`: responder B e depois A; `expect(text).toContain('Peça de B'); expect(text).not.toContain('Peça de A')`; editor/mensagem/custo de A ausentes. Hoje assinatura anterior continua podendo atualizar o painel.
  **Preservação:** VIEWER/SERVICE_DESK e OS encerrada não pedem catálogo; erro de reserva/ação não transforma leitura válida em falha de carga; erro do catálogo não apaga reservas já carregadas; retry principal usa `rmaId` atual; carga inicial mostra carregando sem zero/custos falsos.
- [ ] **Step 2: Rodar o vermelho.**
  ```bash
  npm --prefix frontend test -- --watch=false --runner-config 'C:\Users\joseh\AppData\Local\Temp\vitest-runner.config.mjs' --include 'src/app/shared/rma-parts-panel/*.spec.ts'
  ```
  Esperado: FAIL em falha/retry/catálogo/ordem; preservação PASS.
- [ ] **Step 3: Implementar** falha principal antes de resumo/lista e erro auxiliar junto de “Reservar peças”. Catálogo carregado sem ativas mostra “Nenhuma peça ativa disponível para reserva.”, sem inventar disponibilidade: peça ativa com saldo zero continua selecionável e pode gerar pendência. Não usar `available > 0` como filtro novo. Após falha principal ocultar operações sobre reservas antigas; permitir recuperação pela nova tentativa.
- [ ] **Step 4: Repetir o comando.** Esperado: PASS.
- [ ] **Step 5: Commit.** `git add` dos três **Files**; `git commit -m "fix(reservas): separar falhas de carga e de opcoes de pecas (NAV-98)"`.

### Task 6b: Reservas com disponibilidade correta, custos e ações explícitas

**Files:**
- Modify: `frontend/src/app/shared/rma-parts-panel/rma-parts-panel.component.html` (`:4-13,30-82`).
- Modify: `frontend/src/app/shared/rma-parts-panel/rma-parts-panel.component.ts` (estilos inline, helpers de apresentação).
- Modify: `frontend/src/app/shared/rma-parts-panel/rma-parts-panel.component.spec.ts` (resumo e seletor de cancelamento).
- Create: `frontend/src/app/shared/rma-parts-panel/rma-parts-panel.component.presentation.spec.ts`.

**Interfaces:**
- Consumes: estados da 6a, `reserveForm`, `canReserve/canCreateReservation/isClosed`, `runAction(reservation, action)`, custos/contagens atuais.
- Produces: `protected hasError(control: AbstractControl): boolean` pelo padrão de protocolos; `protected selectedPart(): PartResponse | null` lê `reserveForm.controls.partId.value` e catálogo, sem `computed` não reativo. Nenhuma ação, estado ou payload novo.

- [ ] **Step 1: Testes novos:**
  - `labels partAvailable as Disponível`: reserva com `partAvailable=3`, quantidade 2; `expect(facts.get('Disponível')).toBe('3 un'); expect(facts.has('Em estoque')).toBe(false)`. Hoje rótulo é incorreto; não inventar estoque total indisponível na resposta da reserva.
  - `names cancellation as a reservation operation`: `expect(cancel.textContent.trim()).toBe('Cancelar reserva')`, manter “Aplicar” e “Efetivar reserva” e chamada `(7,1,'cancel')`. Hoje texto é “Cancelar”.
  - `states reservation count and OS cost scope`: `expect(text).toContain('Reservas ativas: 1'); expect(text).toContain('Custo aplicado na OS'); expect(text).toContain('Custo da reserva'); expect(text).not.toContain('reservada(s)')`. Custos BRL normalizados, sem somar pendências como aplicadas. Hoje rótulos não declaram escopo e usam plurais artificiais.
  - `groups the inline reservation form and shows existing errors by field`: `expect(legend.textContent).toBe('Reservar peças')`; enviar `partId=null`, `quantity=0`: mensagens “Selecione a peça.” e “Informe uma quantidade de pelo menos 0,001.” junto dos campos; `expect(reserve).not.toHaveBeenCalled()`. `note` com mais de 255 (programaticamente) mostra “Use até 255 caracteres.”. Hoje só há mensagem geral.
  - `shows the selected part unit beside reservation quantity`: escolher peça em metros; `expect(quantityLabel.textContent).toContain('Quantidade (m)')`, trocar para outra em `un` atualiza o rótulo sem alterar o número digitado. Hoje o campo mostra somente “Quantidade”. Sem seleção, não inventar unidade.
  **Preservação:** matriz dos quatro perfis × aberto/encerrado × `ACTIVE/PENDING/CONSUMED/CANCELLED/REVERSED`, incluindo cancelamento em encerrados; tabela de ações das restrições. Sem botão Reservar para quem não pode, custos presentes para todos; peça ativa sem saldo continua nas opções. Payload, nota normalizada, criação pendente e bloqueio com `busyReservationId` mantidos. Histórico recolhível, datas, motivos e indicação de estornado continuam; não inferir unidade de movimento que a resposta não fornece.
- [ ] **Step 2: Rodar e ver falhar.** Comando da 6a; FAIL em rótulos/escopo/seção/erros, matriz e payloads PASS. Atualizar no spec existente somente os textos cuja mudança é deliberada.
- [ ] **Step 3: Implementar** linha de contagens/custos e pares por reserva; Cancelar reserva continua ação textual de negócio, não usa o botão Cancelar de diálogo nem ícone. O formulário inline usa `fieldset.form-section`, sem botão fictício de fechar uma área que está sempre aberta. Manter limite/validação atuais e resumo oculto após falha da 6a. Ajustar grade local para uma coluna abaixo de 720 px e tokens nos estilos tocados, sem alterar CSS global.
- [ ] **Step 4: Repetir o comando.** Esperado: PASS em todos os estados/perfis e retorno pendente.
- [ ] **Step 5: Commit.** `git add` dos quatro **Files**; `git commit -m "feat(reservas): explicitar disponibilidade custos e acoes (NAV-98)"`.

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

- [ ] **Step 1: Testes novos:** `labels the start, duration and resolution of each episode` — ativo e resolvido, `expect(labels).toContain('Início'); expect(labels).toContain('Nota de resolução')`, nota em valor associado; duração no episódio ativo, hoje inexistente ali e nota sem rótulo. `updates the duration of an active episode without changing the resolved duration` — avançar signal de relógio controlado, ler valores antes/depois: ativo muda e resolvido não, sem alterar input; a novidade é a duração identificada por episódio ativo, o cálculo utilitário existente é preservação.
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

### Task 11: Editor residual — resumo dos itens e edição focada

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

- [ ] **Step 1: Rodar a suíte completa no Git Bash.**
  ```bash
  npm --prefix frontend test -- --watch=false --runner-config 'C:\Users\joseh\AppData\Local\Temp\vitest-runner.config.mjs'
  npm --prefix frontend run build
  ```
  Esperado: testes PASS, zero falhas; build com saída 0. Comparar avisos de orçamento com a base de execução, sem aumentar limites para esconder regressão. O roteiro anterior registra bundle de 604 kB, mas ele não é uma medição desta base em fechamento: registrar valores reais antes/depois da implementação. Não declarar build/testes aprovados por simples leitura deste plano.
- [ ] **Step 2: Conferir escopo do diff desde a base escolhida para a etapa 5.** No início da implementação futura, identificar a base com o fechamento das etapas anteriores já registrado, sem incorporar nem reverter alterações alheias. Nesse momento guardar `etapa5_base=$(git rev-parse HEAD)` no Git Bash; conservar esse valor até a conferência e usá-lo nos comandos:
  ```bash
  git diff --check "$etapa5_base"
  git diff --name-only "$etapa5_base"
  git diff "$etapa5_base" -- backend frontend/src/app/core/models.ts frontend/src/app/core/services frontend/src/app/app.routes.ts frontend/src/styles.css
  ```
  Esperado: `--check` sem erro; lista limitada a **Files** das tarefas; último comando sem diff desta etapa. A base precisa preservar/identificar mudanças preexistentes do fechamento da etapa 4, para não atribuí-las à etapa 5. Não usar comandos de reset/checkout para limpar trabalho alheio.
- [ ] **Step 3: Busca de regressão nos componentes do escopo, excluindo specs.** PowerShell de leitura:
  ```powershell
  $operationFiles = Get-ChildItem frontend/src/app/pages/parts,frontend/src/app/shared/rma-parts-panel,frontend/src/app/shared/rma-block-panel,frontend/src/app/shared/rma-block-history,frontend/src/app/shared/rma-protocols -File |
    Where-Object { $_.Name -match '\.component\.(html|ts)$' }
  $operationFiles | Select-String -Pattern 'registro\(s\)','reservada\(s\)','consumida\(s\)','pendente\(s\)','Valor em estoque','title="(Editar|Histórico|Movimentar)"'
  ```
  Esperado: nenhuma ocorrência desses resíduos; “Cancelar reserva”, “Efetivar reserva” e “Aplicar” presentes no painel, “Confirmar estorno” e Cancelar na mesma confirmação, dois rodapés completos no painel de impedimentos. Não exigir ausência de todos os “Cancelar”: os de formulário/diálogo continuam corretos. Conferir também que `partAvailable` está sob Disponível e que custo continua formatado por `formatCurrency`.
- [ ] **Step 4: Relatar limites.** Informar que a conferência autenticada não foi possível e que testes/build não substituem o roteiro abaixo. Não marcar a etapa como visualmente conferida; registrar F1 explicitamente e não prometer que foco está resolvido por `aria-modal` ou por teste em ambiente DOM simulado.

## Critérios de aceite

1. Peças usa cabeçalho/contagem e ações comuns; indicadores têm escopo explícito; busca continua local/imediata, reposição e pendências conservam todas as fontes e quantidades, sem paginação nova.
2. Falha, carga, vazio e busca vazia são distintos nas duas abas; histórico, reservas e protocolos têm retry da fonte correta e não mostram dado de outra peça/OS. Erro auxiliar do catálogo não apaga consultas válidas.
3. Disponível, reservado e em estoque continuam distintos; unidade/mínimo/Repor visíveis; cadastro não altera saldo; custo mantém BRL e permissões atuais.
4. Movimento explicita tipo, quantidade/unidade, motivo e estimativa antes/depois identificada como tal; validações e payload atuais preservados. Escrita pendente não fecha nem duplica requisição.
5. Estorno oferece Cancelar à esquerda de Confirmar estorno, motivo rotulado e identificação do movimento. Original e compensação continuam no histórico; nenhum DELETE/edição retroativa; consumo estornado não reabre reserva.
6. Reservas exibem Disponível corretamente, contagem de registros/custos com escopo e ações textuais Aplicar/Efetivar reserva/Cancelar reserva. Matriz por perfil, estado e encerramento preservada.
7. Ambos os formulários de impedimento têm Cancelar à esquerda, mensagens junto aos campos e bloqueio durante escrita. Histórico identifica motivo, início, duração e resolução; nota obrigatória e impacto atual no SLA preservados.
8. Protocolos mostram nome/versão, estado, total registrado e progresso real dos obrigatórios, sem confundir com percentual da OS. Contexto, medição/unidade/faixa, evidência/justificativa e tentativas permanecem legíveis; concluir com reprovação não é bloqueado por uma regra nova no cliente.
9. Registro de resultado informa as condições reais de evidência/justificativa, mantém valores no erro e impede descarte/duplicação durante escrita. Leitura e ações continuam com os perfis atuais.
10. Editor só completa resumo/edição focada e espaço para textos; item inválido oculto é revelado com mensagem; todos os itens continuam no payload e publicação gera nova versão, mantendo execuções anteriores na original.
11. Cada tarefa implementável tem um commit próprio, novidade com vermelho observável e preservação separada; suíte/build da implementação passam com resultados relatados. Backend, contratos, rotas, CSS global e documentos anteriores sem alteração pela etapa.
12. Conferência autenticada permanece pendente até execução pelo usuário; F1 não é encerrado por esta etapa. Layout em 1440/320 px, tooltips e foco real são conferidos pelo roteiro, com as limitações já declaradas.

## Roteiro manual para o usuário

Backend em `localhost:8080`, frontend por `npm --prefix frontend start -- --port 4300`, login realizado pelo próprio usuário. Conferir em **1440 px e 320 px**, também com zoom de 200% e teclado; tabela pode rolar internamente, página e formulário não devem criar rolagem horizontal.

1. **ADMIN e SERVICE_DESK / Peças:** cabeçalho com contagem; buscar por nome, código e localização e limpar; alternar abas com busca ativa. Conferir contagem da aba, linha “No estoque completo” estável e ausência dos três cartões. Conferir caso inativo e abaixo do mínimo: texto Repor com disponível/unidade/mínimo; três saldos comparáveis.
2. **Reposição:** nome, código e localização separados; sugestão e pendente por OS com unidade; múltiplas ordens de serviço, unidades diferentes e sugestão zero. Nenhum total mistura unidades. Nenhum pedido de compra ou alocação acontece só por abrir a aba.
3. **Cadastro:** duas seções, sem campo de saldo, Cancelar à esquerda; criar/editar com localização vazia, custo decimal e peça inativa. Enquanto salva, fechar/overlay/Cancelar não descartam; erro mantém dados e sucesso fecha/recarrega. Estoque só muda via movimento.
4. **Movimento:** entrada, saída e ajuste positivo/negativo, incluindo 1,5 m; comparar estimativa com reservado constante. Zero, sinal inválido e ajuste sem motivo mostram erro no campo. Simular saldo insuficiente: servidor pode negar a estimativa, formulário continua com os valores.
5. **Histórico/estorno:** autor, motivo, sinais, saldos após e OS legíveis; iniciar estorno e cancelar sem fechar histórico, reabrir sem motivo antigo; confirmar com motivo e verificar original “Estornado” mais compensação vinculada. Não existe exclusão nem estorno do estorno. Consumo estornado não reaparece como reserva ativa. Repetir clique durante envio não duplica.
6. **TECHNICIAN e ADMIN / OS aberta:** reservas ativas, pendentes, aplicadas, canceladas e estornadas identificadas; “Disponível” não confunde com total; moeda/escopo dos custos; Reservar com unidade e erro por campo. Sem saldo cria pendência, não bloqueia a escolha da peça. Repor saldo e usar explicitamente Efetivar reserva; aplicar e cancelar mantêm rótulos completos.
7. **OS encerrada:** sem novo pedido, aplicar ou efetivar; ainda pode Cancelar reserva ativa/pendente. **VIEWER e SERVICE_DESK** consultam peças/custos/histórico da OS sem operações de reserva; VIEWER/TECHNICIAN consultam estoque sem gerir peças, conforme matriz atual.
8. **Impedimentos**, ADMIN/SERVICE_DESK/TECHNICIAN: motivo obrigatório e categoria opcional; Cancelar à esquerda tanto em bloqueio quanto resolução, sem gravar; espaços/limites/nota vazia; salvar e conferir episódio ativo/resolvido com início, duração, autores e nota. Duração bloqueada continua contando no SLA. VIEWER somente consulta. Testar fechar por Fechar, Cancelar e Escape com/sem escrita pendente.
9. **Protocolos / leitura:** versão antiga permanece após publicar nova; contexto esperado e instruções não desaparecem após registrar. Medição exibe valor/unidade/faixa unilateral ou bilateral; progresso dos obrigatórios pode ficar incompleto com todos os itens registrados quando há reprovação. Zero obrigatórios mostra texto sem barra artificial; Concluir com reprovação continua permitido pelo servidor quando todos os obrigatórios têm registro.
10. **Protocolos / registro**, ADMIN/TECHNICIAN: registrar CHECK, TEXT, MEASUREMENT; PASSED com evidência configurada, FAILED/Não se aplica com justificativa, repetir com justificativa. Conferir indicação condicional e erro perto do formulário; tentativa recusada mantém valores, pendência bloqueia Cancelar/troca/envio repetido. Abrir histórico de resultados, conferir cada autor/instante/evidência/justificativa. VIEWER/SERVICE_DESK só leem.
11. **Editor**, ADMIN: vários itens, selecionar e alternar sem perder rascunho; adicionar/remover primeiro/intermediário/último, conservar um; tipos com seus adicionais, instruções e esperado multilinha; publicar com item inválido não selecionado revela o item/erro. Confirmar que payload/publicação não perdeu itens e execução anterior permaneceu na versão de origem. Sem opções de catálogo/editor para perfis não autorizados pela rota atual.
12. **Falha e recuperação:** desligar backend para cada leitura principal, incluindo após dados e após vazio; não mostrar ausência nem saldo/custo antigo como atual; religar e usar retry. Simular falha de somente catálogo auxiliar pela rede para preservar reservas/execuções. Em atualização mostrar feedback e impedir operação sobre snapshot que está sendo recarregado.
13. **Teclado e largura:** ordem dos botões, nomes acessíveis/tooltip de ações em hover/foco, Escape do tooltip/select, nenhum recorte em primeira/última linha e ao rolar tabelas. Na seleção do editor e revelação de erro, foco permanece em controle pertinente. Registrar confinamento/retorno dos overlays como pendência **F1**, sem aprovar essa parte por mera presença de `aria-modal`; no `<dialog>` de impedimentos verificar comportamento nativo e retorno ao acionador, inclusive quando aberto sobre o detalhe.

## Decisões tomadas na elaboração, sem nova decisão do usuário

Estas são propostas do autor do plano, não acordos adicionais atribuídos ao usuário:

1. Manter duas abas e a carga atômica das três fontes de Peças; busca continua local, sem debounce, filtro novo ou paginação.
2. Manter alertas de mínimo/pendência em linha global identificada; retirar o cartão monetário como métrica de gestão; manter todos os custos de comparação/execução e sua visibilidade atual.
3. Contagem do cabeçalho corresponde ao catálogo de peças, filtrada apenas quando a busca está visível em Estoque; não apresentar busca escondida como filtro da Reposição.
4. Manter os ícones já existentes de Histórico/Movimentar/Editar, adotando o componente comum para nome e tooltip; estorno e ações específicas de reserva/protocolo continuam textuais.
5. Introduzir apenas prévia local de movimento **manual**, rotulada estimativa; confirmação de estorno fica inline, com Cancelar, sem novo modal ou inversão cliente dos saldos.
6. Separar falhas de leitura principal e catálogos auxiliares nos painéis; não criar abstração assíncrona compartilhada. Guardas de pendência/cancelamento são parte da integridade dos formulários tocados, sem reestruturar autorização.
7. Medir obrigatórios atendidos na barra do protocolo e mostrar todos os registrados em texto separado; não usar esse percentual para proibir conclusão com reprovação.
8. Expor tentativas/evidências/justificativas já recebidas em `<details>`, sem novo endpoint. Explicitar regras em rótulos/ajuda e conservar autoridade de validação do servidor; não adicionar validadores de negócio de resultado no frontend.
9. Editor guarda seleção por identidade do `FormGroup`, com um editor e todos os controles no FormArray. Selecionar/revelar erro, sem desabilitar ou apagar item oculto; textarea de três linhas para os dois textos longos. Sem reordenação/duplicação.
10. Adiar confinamento/retorno global de foco para F1: uma implementação reutilizável isolada não resolve a coordenação com os diálogos pais. Preservar o `<dialog>` nativo existente e não declarar acessibilidade modal concluída nesta etapa.

## Fora de escopo e backlog justificado

- **F1 — Coordenação reutilizável de foco nos diálogos (conferência global / etapa 7).** É dívida real já registrada no roteiro manual, não uma funcionalidade descartada. A referência mínima existe em `shared/rma-detail-modal/rma-detail-modal.component.ts:68-91`: captura de foco anterior, foco inicial após render, Tab circular e devolução no destroy; o Escape já ignora outro `dialog[open]`/overlay sobreposto. Copiá-la para Peças/editor não cobre os pais em `pages/rmas`, abertura de impedimentos sobre detalhe, disparadores removidos após reload e Escape aplicado pelo select (`shared/form-controls/custom-select/custom-select.component.ts:153-159`). Nesta base há também alterações de fechamento desses controles. Corrigir globalmente exigiria mudar componentes fora deste recorte e validar a pilha de diálogos; por isso não entra silenciosamente em uma tarefa de apresentação.
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
