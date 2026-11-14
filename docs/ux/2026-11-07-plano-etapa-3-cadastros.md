# Etapa 3 — Cadastros (clientes, produtos, usuários e catálogo de protocolos) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** As quatro telas de cadastro passam a seguir a mesma composição "Coleção": cabeçalho com título e contagem, barra de busca/filtros na mesma posição, tabela, paginação (onde já existe), ações de linha por ícone com tooltip e nome acessível, formulário agrupado em seções com rodapé Cancelar/ação principal e confirmação de exclusão que identifica o registro. Nenhuma função, campo, validação ou permissão é removida.

**Architecture:** Dois componentes compartilhados pequenos em `frontend/src/app/shared/` (`app-page-header` e `button[appRowAction]`) e regras CSS globais em `frontend/src/styles.css` (`.page-heading__title/__count`, `.form-section`, `.row-action__tip`). Cada página muda template, estilos locais e poucos sinais próprios (falha da última consulta, limpeza de filtros com cancelamento do debounce). `PagedList`, `CatalogService`, `ProtocolService`, os validadores e os payloads ficam como estão.

**Tech Stack:** Angular 21 (signals, reactive forms, controle de fluxo `@if/@for`), Vitest via `ng test`, CSS global com os tokens da etapa 1 (`--control-height`, `--control-height-sm`, `--space-*`, `--font-size-md`, `--font-weight-semibold`).

**Spec:** `docs/ux/2026-11-06-estudo-ui-ux.md` (resumo para decisão: decisões 3 e 6; "Um sistema visual, cinco composições" → Coleção; "Decisões que valem para qualquer tela"; seções Clientes, Produtos, Usuários, "Protocolos: catálogo e editor de versões"; "Contrato dos componentes"; "Escrita: reduzir sem tornar ambíguo") e `docs/ux/2026-11-07-etapa-1-fundacao-visual.md` (tokens, 40 px, paleta atual).

**Ordem e dependências:** Tarefa 1 (cabeçalho e seções) → Tarefa 2 (ação de linha com tooltip) → Tarefas 3, 4 e 5 (clientes, produtos, usuários; dependem de 1 e 2) → Tarefa 6 (catálogo de protocolos; depende de 1) → Tarefa 7 (formulário e ciclo de salvamento de protocolos; depende de 1 e 6, mesmos arquivos) → Tarefa 8 (verificação). Executar em sequência.

## Global Constraints

- **Preservar:** paginação real (`PagedList` em clientes, produtos e usuários; protocolos continuam sem paginação, com busca local imediata por `includesQuery`, `protocols.component.ts:82-84`), busca com debounce (`SEARCH_DEBOUNCE_MS`), todos os filtros (CPF/CNPJ e E-mail; Categoria e Firmware; Perfil e Status), volta à primeira página ao filtrar, recuo para a última página quando a atual esvazia (`paged-list.ts:59-63`), recarga da página atual após excluir.
- **Preservar regras específicas:** categoria livre em produtos (`input[list]` com `<datalist>` alimentado por `getProductSummary().categories`); proteção contra excluir a própria conta (`UsersComponent.isCurrentUser` e o retorno antecipado em `openDeleteModal`, `users.component.ts:224-231`); regra de versões de protocolo ("Nova versão" chama `updateTemplate`, que publica nova versão; execuções iniciadas continuam na original; o texto `protocols.component.html:86` fica); erro de vínculo na exclusão de cliente mostrado **dentro** do diálogo (`deleteModalErrorMessage`, `clients.component.html:266-270`).
- **Não mudar:** campos, obrigatoriedade, validadores, limites (`PRODUCT_LIMITS`, `maxlength`), payloads (`build*Payload`), mensagens de validação existentes, permissões por perfil. As permissões são definidas só nas rotas (`app.routes.ts:59-94`: clientes e produtos `ADMIN`/`SERVICE_DESK`; protocolos e usuários só `ADMIN`); não há checagem de perfil dentro das páginas e não se cria nenhuma. `app.routes.ts` não é tocado. O spec do guard (`guards/guards.spec.ts:43-52`) testa o mecanismo, não a matriz das quatro rotas; a matriz é conferida pela ausência de diff em `app.routes.ts` (Tarefa 8) e pelo roteiro manual.
- **Decisão 3 (indicadores por tela):** total vira contagem no título; indicadores que só repetem o total ou um filtro saem; os que orientam ação ficam ou vão ao dashboard (etapa 6). Resultado por tela em "Decisão de indicadores". As requisições `get*Summary` **continuam**, porque alimentam o denominador "X de Y" e, em produtos, as categorias; os specs HTTP também as esperam (`clients.component.pending.spec.ts:14`, `products.component.errors.spec.ts:54`, `users.component.pending.spec.ts:15`).
- **Regra da contagem:** com filtro ou busca ativos **e** denominador disponível maior que a contagem, mostrar "X de Y"; nos demais casos (sem filtro, resumo indisponível, denominador igual ou menor), mostrar "N". A contagem fica oculta enquanto não houver resultado da consulta atual (primeira carga ou falha).
- **Decisão 6 e etapa 1:** Cancelar à esquerda (já entregue; `expectCancelBeforePrimary` continua passando); paleta atual; controles de 40 px; ação de linha com `--control-height-sm` (34 px) como hoje. Sem cores novas, sem ícones novos.
- **Não inventar:** gestão granular de permissões, recuperação de senha, paginação em protocolos, filtros novos, exclusão de protocolo, edição retroativa de versão, validadores novos.
- **Ações de negócio mantêm texto:** "Nova versão", "Adicionar item", "Remover item", "Publicar nova versão". Só Editar/Excluir recorrentes viram ícone.
- **CSS:** `.stats-grid`/`.stat-card` continuam em `styles.css` (usados por `dashboard.component.html:14` e `parts.component.html:13`). `.kanban-heading__count` não migra nesta etapa.
- **Comandos (PowerShell 5.1 ou Git Bash):** testes `npm --prefix frontend test -- --watch=false --runner-config C:\Users\joseh\AppData\Local\Temp\vitest-runner.config.mjs` (arquivo fora do repositório com `maxWorkers: 2`; existe nesta máquina); build `npm --prefix frontend run build`.
- **Testes:** cada tarefa separa **testes de comportamento novo** (devem falhar antes da implementação) de **testes de preservação** (passam antes e depois; servem de rede de proteção e não precisam falhar). Cenários de falha **inicial** configuram o mock com erro **antes** de `TestBed.createComponent`, porque os `beforeEach` atuais já carregam com sucesso.
- **Commits:** um por tarefa, só com os arquivos listados em **Files**; mensagem no padrão `tipo(escopo): descrição (NAV-98)`; sem trailer de coautoria e sem menção a ferramenta de geração.
- **Verificação:** a conferência autenticada no navegador exige login e backend; o agente não faz login. A verificação desta etapa é por testes e build; visibilidade e recorte do tooltip, densidade e 320 px ficam no roteiro manual da Tarefa 8, executado pelo usuário.

## Inventário de inconsistências (evidência)

| Tema | Clientes | Produtos | Usuários | Protocolos |
| --- | --- | --- | --- | --- |
| Cabeçalho | `<section class="page-heading">` sem contagem (`clients.component.html:2-9`) | idem (`products.component.html:2-9`) | idem (`users.component.html:2-9`) | idem, título "Protocolos técnicos" (`protocols.component.html:2-9`) |
| Contagem | dentro do rótulo da busca, "N registro(s)" (`clients.component.html:31-34`) | `products.component.html:31-34` | `users.component.html:31-34` | conta a lista filtrada localmente (`protocols.component.html:15`) |
| Estatísticas | 3 cartões; "Com documento" e "Com e-mail" repetem os filtros (`clients.component.html:11-27`, filtros em `:43-60`) | 3 cartões; "Com firmware" repete o filtro (`products.component.html:11-27`) | 3 cartões; "Ativos"/"Administradores" reproduzíveis pelos filtros (`users.component.html:11-27`) | nenhum |
| Busca/filtros | mesma barra `.catalog-toolbar--filters` (`:29`); debounce por `Subject` (`clients.component.ts:96-100`) | igual (`:29`; `products.component.ts:131-135`) | igual (`:29`; `users.component.ts:121-125`) | só busca, local e imediata (`protocols.component.ts:82-84,106-108`) |
| Limpar filtros | inexistente | inexistente | inexistente | inexistente (o Kanban tem: `kanban.component.html:222-226`) |
| Colunas | "Ação" no singular para duas ações (`:100`); "Não informado" repetido (`:111,112,114`); "Sem nome fantasia" (`:108`) | "Ação" (`:102`); versões concatenadas "HW x · FW y" (`products.component.ts:299-316`); "1 meses" (`products.component.html:123`); SKU quebra em qualquer ponto (`products.component.ts:58-62`); texto truncado em TS e completo só no `title` (`products.component.ts:283-297` + `products.component.html:109-119`), embora o CSS já faça reticências (`products.component.ts:64-70`) | "Ação" (`:104`); estado em coluna própria com `.state-dot` (`:116`) | "Ação" (`:53`); estado como subtítulo do nome (`protocols.component.html:61`) |
| Ações de linha | `title` nativo + `.sr-only` "Editar"/"Excluir" sem identificar o registro (`clients.component.html:118-135`); wrapper local `.client-actions` (`clients.component.ts:37`) | idem (`products.component.html:127-144`; `.product-actions` em `products.component.ts:53-56`) | `title="Excluir"` estático (`users.component.html:133`) sobrescrito por `[attr.title]` que vale `null` para os outros usuários (`:136`): o botão perde o tooltip; na própria conta o botão fica `disabled` (`:135`), não recebe foco e o motivo fica inacessível ao teclado; `.user-actions` local (`users.component.ts:40`) | botão de texto "Nova versão" (`protocols.component.html:69`), correto por ser ação de negócio |
| Classe global ociosa | `.row-actions` existe e não é usada (`styles.css:1975-1979`) | | | |
| Tooltip | `title` nativo não aparece no foco por teclado (contrato: hover **e** foco, `estudo-ui-ux.md:309`); `.table-wrap` tem `overflow-x: auto` (`styles.css:1469-1471`) e recortaria um tooltip absoluto | idem | idem | — |
| Formulário | grade plana de 7 campos (`clients.component.html:176-231`); subtítulo genérico (`:163`) | grade plana (`products.component.html:185-259`); subtítulo genérico (`:172`) | grade plana (`users.component.html:180-234`); subtítulo fala em "permissões" que não existem (`:167`); ajustes locais de modal, `.user-form .field-group { grid-template-rows: auto }` e `.field-hint` (`users.component.ts:42-64`) contra a regra global de três linhas (`styles.css:1182-1185`) | só as etapas bloqueadas em `fieldset.field-group` (`protocols.component.html:125-135`; reset em `styles.css:1522-1527`); nenhum `field-error` (`:100-177`), só banner (`protocols.component.ts:156`); categoria obrigatória sem produto validada à mão (`:154`) |
| Diálogo de formulário | sem `role="dialog"`/`aria-modal`/`aria-labelledby` (`clients.component.html:159`) | `products.component.html:168` | `users.component.html:163` | `protocols.component.html:82`; fecha durante o envio: `closeModal` sem guarda (`protocols.component.ts:128-131`) e fechar sem `[disabled]` (`protocols.component.html:88`), ao contrário dos outros (`clients.component.ts:168-174`). O sucesso chama `closeModal()` dentro de `next`, antes do `finalize` liberar `submitting` (`protocols.component.ts:166-169`) |
| Falha de carga | `PagedList` não guarda falha: `catchError` chama `onError` e devolve `of(null)` sem tocar em `result` (`paged-list.ts:27-31`); só `apply` grava `result` (`:59-67`). Falha inicial mostra "Nenhum cliente cadastrado." com CTA (`clients.component.html:78-84`) junto do banner (`:63-67`); falha depois de um sucesso mantém a lista anterior | mesmo problema (`products.component.html:63-84`) | mesmo problema; texto da busca vazia ignora a busca: "Ajuste os filtros" (`users.component.html:92`) | um único estado para vazio, busca sem resultado e falha, sem CTA (`protocols.component.html:36-41`); `errorMessage` é limpo ao abrir o formulário (`protocols.component.ts:116,217-221`) |
| Títulos de estado | com ponto final ("Nenhum resultado encontrado.", `clients.component.html:88`), diferente do Kanban ("Nenhuma OS encontrada", `kanban.component.html:224`) | idem | idem | idem |
| Banners | erro/sucesso da página sem `role` (`clients.component.html:63-73`); erro do modal com `role="alert"` (`:171`) | idem | idem | idem |
| Rodapés | Cancelar à esquerda no formulário e na exclusão (`:224-231`, `:285-302`) | idem (`:251-258`, `:310-327`) | idem (`:226-233`, `:285-302`) | idem (`:194-197`) |
| Confirmação de exclusão | nome + documento quando existe (`:272-283`) | nome + SKU (`:299-308`) | avatar + nome + usuário (`:274-283`) | não há exclusão |

### Specs existentes afetados

| Spec | Linha | Hoje espera | Ação |
| --- | --- | --- | --- |
| `clients.component.spec.ts` | `:55` | "45 registro(s)" | Continua passando pelo resumo da paginação ("1–2 de 45 registro(s)"); manter |
| `clients.component.spec.ts` | `:98-99` | "Nenhum resultado encontrado." e "0 registro(s)" | Trocar para "Nenhum cliente encontrado" e "0 de 45 clientes" (Tarefa 3) |
| `clients.component.spec.ts` | `:58,112` | `getClientSummary` chamado | Manter (resumo continua) |
| `clients.component.pending.spec.ts` | `:37` | `.client-actions button` | `.row-actions button` (Tarefa 3) |
| `products.component.spec.ts` | `:75` | "45 registro(s)" | Manter (paginação) |
| `products.component.spec.ts` | `:77` | "18 meses" (vem só do cartão Garantia média; os produtos da montagem têm 12) | Remover essa expectativa e acrescentar que não existe `.stat-card`; manter a verificação de `getProductSummary` (Tarefa 4) |
| `products.component.spec.ts` | `:173-176` | `.product-actions button` | `.row-actions button` (Tarefa 4) |
| `products.component.spec.ts` | `:222-248` | categoria livre e `datalist` | **Não alterar**; preservação |
| `products.component.errors.spec.ts` | `:57` | `.page-heading button` | Continua válido (o cabeçalho compartilhado mantém `.page-heading` e projeta o botão) |
| `users.component.spec.ts` | `:49` | "45 registro(s)" | Manter (paginação) |
| `users.component.pending.spec.ts` | `:39` | `.user-actions button` | `.row-actions button` (Tarefa 5) |
| `users.component.password.spec.ts` | todo | senha obrigatória na criação, opcional na edição | **Não alterar**; preservação |
| Specs de salvamento (`*.pending.spec.ts`, `products.component.errors.spec.ts`) | vários | `querySelector('[role="alert"]')` sem escopo | Continuam válidos: começam com carga bem-sucedida, e `role="alert"` só entra no estado de falha de carga, nunca no vazio normal |
| `protocols.component.spec.ts` | `:30-35` | Cancelar à esquerda | Manter; a montagem ganha fábrica de modelos (Tarefas 6 e 7) |

## Decisão de indicadores (decisão 3 aplicada)

| Tela | Indicador | Destino | Motivo |
| --- | --- | --- | --- |
| Clientes | Com telefone, Com documento, Com e-mail | Saem | Dois repetem filtros existentes; nenhum orienta ação |
| Produtos | Com firmware | Sai | Repete o filtro Firmware |
| Produtos | Categorias | Sai | O número de categorias não orienta ação; as categorias seguem no filtro e nas sugestões |
| Produtos | Garantia média | Sai da tela; **candidato ao dashboard** (etapa 6) | Métrica de gestão |
| Usuários | Ativos, Administradores | Saem; Administradores **candidato ao dashboard** | Reproduzíveis por Status e Perfil, com a contagem no título |
| Usuários | Perfis em uso | Sai | Não orienta ação |
| Todas | Total | Contagem no título | "45 clientes"; com filtro ativo, "12 de 45 clientes" (regra da contagem) |

## Extrações propostas (no máximo duas)

1. **`app-page-header`** — o mesmo bloco cabeçalho + ação aparece nas quatro telas e passa a ter regra própria (singular/plural, "X de Y", ocultar sem resultado atual). Copiar essa lógica quatro vezes geraria divergência no primeiro ajuste. Não absorve barra de busca nem estados, que variam por tela.
2. **`button[appRowAction]`** — seis botões de linha repetem ícone, `title`, `.sr-only` e classes; o defeito de `users.component.html:133,136` mostra o custo da cópia. O componente centraliza nome acessível com o registro, tooltip em hover e foco fora do recorte da tabela, `aria-disabled` com motivo e Escape para dispensar.

**Não extrair:** o diálogo de exclusão (três cópias já consistentes depois da fase 1, com ícone/avatar e fluxo de erro diferentes; extrair agora aumentaria o risco no erro de vínculo), os estados vazio/falha (texto e CTA variam por tela; ficam como marcação com `.empty-state`) e as seções de formulário (`fieldset.form-section` + `legend`, só CSS).

## Contrato de estados da lista (Tarefas 3 a 6)

Cada página tem um sinal próprio de falha da **última consulta**, independente do cache de `PagedList` e das mensagens de formulário:

- Páginas paginadas: `protected readonly loadFailed = signal(false)`. O callback `onError` do `PagedList` faz `loadFailed.set(true)` além de gravar `errorMessage`; o callback `onLoaded` (terceiro argumento do construtor, `paged-list.ts:19-21`, chamado só em sucesso, `:66`) faz `loadFailed.set(false)`. `clearMessages()` **não** mexe em `loadFailed`.
- Protocolos: o mesmo sinal, `true` no `error` de `loadTemplates`, `false` no `next`.
- `protected readonly hasLoaded = computed(() => <lista>.result() !== null)` (em protocolos: um sinal `loaded` que vira `true` no primeiro `next`).

Precedência no corpo da tabela, nesta ordem:

1. `loadFailed()` → `.empty-state` com `role="alert"`, título "Não foi possível carregar os <itens>.", detalhe `errorMessage()` quando existir, botão "Tentar novamente" (desabilitado e com texto "Carregando..." enquanto `loading()`). **Substitui a tabela e a paginação** mesmo quando havia registros de uma consulta anterior, porque eles podem não corresponder aos filtros atuais.
2. `loading() && !hasLoaded()` → "Carregando <itens>...".
3. Lista vazia sem filtros → "Nenhum <item> cadastrado" + CTA de cadastro.
4. Lista vazia com filtros → "Nenhum <item> encontrado", "Ajuste a busca ou os filtros." e "Limpar busca e filtros" (protocolos: "Limpar busca").
5. Tabela e paginação.

"Tentar novamente" chama `<lista>.reload()` (mesmos filtros, página e tamanho). A contagem do cabeçalho é `null` quando `loadFailed() || !hasLoaded()`. O banner de erro da página sai, porque nas quatro telas `errorMessage` só carrega erro de consulta (`clients.component.ts:66`, `products.component.ts:100`, `users.component.ts:93`, `protocols.component.ts:213`); o banner de sucesso fica, com `role="status"`.

## Contrato da limpeza de filtros (Tarefas 3 a 5)

O debounce atual (`searchChanges.pipe(debounceTime(...))`) manteria agendada uma busca digitada antes da limpeza, gerando uma segunda requisição depois de 300 ms. Trocar o `Subject<void>` por `Subject<'search' | 'cancel'>`:

```ts
this.searchChanges.pipe(
  debounceTime(SEARCH_DEBOUNCE_MS),
  filter((kind) => kind === 'search'),
  takeUntilDestroyed(this.destroyRef)
).subscribe(() => this.<lista>.firstPage());
// updateSearch: this.searchChanges.next('search');
// clearFilters: this.searchChanges.next('cancel'); define os valores padrão; this.<lista>.firstPage();
```

`'cancel'` substitui a emissão pendente dentro da janela do debounce e é descartada pelo `filter`. Valores padrão explícitos: clientes `searchTerm=''`, `documentFilter='all'`, `emailFilter='all'` (`PresenceFilter`, `catalog-ui.ts:8`); produtos `searchTerm=''`, `categoryFilter=''`, `firmwareFilter='all'`; usuários `searchTerm=''`, `roleFilter=''`, `statusFilter='all'`.

## Review Focus

1. **Paginação ao filtrar e ao limpar.** "Limpar busca e filtros" gera **exatamente uma** requisição na página 0 com os valores padrão, inclusive com busca digitada e ainda pendente no debounce; trocar filtro volta à página 0; navegar mantém os filtros. "X de Y" segue a regra da contagem e cai para "X" com o resumo indisponível. Em protocolos a contagem é local e imediata (Tarefas 3–6).
2. **Exclusão da própria conta.** Com `aria-disabled` no lugar de `disabled`, a guarda em `openDeleteModal` (`users.component.ts:225`) é a única barreira: clique ou Enter na própria linha não abre o diálogo nem chama `deleteUser`; a comparação continua sem diferenciar maiúsculas; com exclusão em andamento todos os botões ficam `disabled` (Tarefa 5).
3. **Categoria livre em produtos.** Mover o campo para a seção Identificação não pode tirar `type="text"`, `list` nem o `id` do `datalist`; `getProductSummary` continua sendo pedido sem os cartões, porque alimenta filtro e sugestões (`syncCategoryFilter`, `products.component.ts:340-355`). `products.component.spec.ts:222-248` passa sem alteração (Tarefa 4).
4. **Falha x vazio x busca sem resultado.** Falha da última consulta tem precedência e é rastreada em sinal próprio: falha inicial, falha depois de sucesso vazio, falha depois de sucesso com registros e recuperação por "Tentar novamente" precisam de teste em cada tela. O alerta de carga não pode ser confundido com o alerta do formulário: testes de erro de formulário consultam `[role="alert"]` **dentro** do diálogo (Tarefas 3–6).
5. **Tooltip das ações de linha.** Fica em camada `position: fixed` (padrão de `custom-select.component.ts:50-51,66,93-114`) para escapar do `overflow` de `.table-wrap`, com largura limitada à janela e ajuste às bordas; fecha em rolagem e redimensionamento. Os testes provam texto, nome, ids, abertura/fechamento e posição calculada, **não** a visibilidade real: isso fica para a conferência visual. Seletores dos specs mudam para `.row-actions button` (Tarefas 2–5).

---

### Task 1: Cabeçalho com contagem e seção de formulário

**Files:**
- Create: `frontend/src/app/shared/page-header/page-header.component.ts`
- Create: `frontend/src/app/shared/page-header/page-header.component.spec.ts`
- Modify: `frontend/src/styles.css` (junto de `.page-heading` em `:272-293`, de `.form-grid` em `:1016-1039` e na regra de `max-width: 720px` em `:1756-1767`)

**Interfaces:**
- Consumes: classes `.page-heading`, `.shell-actions`, `.form-grid`, `.field-group`.
- Produces:
  ```ts
  // shared/page-header/page-header.component.ts
  @Component({ selector: 'app-page-header', ... })
  export class PageHeaderComponent {
    readonly heading = input.required<string>();   // não usar "title": viraria atributo title nativo no host
    readonly singular = input.required<string>();  // 'cliente'
    readonly plural = input.required<string>();    // 'clientes'
    readonly count = input<number | null>(null);   // null = sem resultado da consulta atual
    readonly total = input<number | null>(null);   // informado pela página só com filtro/busca ativos
    protected readonly countLabel: Signal<string>;
  }
  ```
  Template: `<header class="page-heading"><div class="page-heading__title"><h1>{{ heading() }}</h1>@if (countLabel()) {<span class="page-heading__count">{{ countLabel() }}</span>}</div><div class="shell-actions"><ng-content /></div></header>`.
  Regra de `countLabel`: `count` nulo → `''`; `total !== null && total > count` → `` `${count} de ${total} ${noun(total)}` ``; senão `` `${count} ${noun(count)}` ``, com `noun(n) = n === 1 ? singular : plural`.
  CSS global: `.page-heading__title` (flex, `align-items: baseline`, `gap: var(--space-3)`, `flex-wrap: wrap`); `.page-heading__count` (mesmo visual de `.kanban-heading__count`: `var(--muted)`, `var(--font-size-md)`, `var(--font-weight-semibold)`); `fieldset.form-section` com reset `min-inline-size: 0; margin: 0; padding: 0; border: 0;`, `grid-column: 1 / -1`, `display: grid`, `grid-template-columns: repeat(2, minmax(0, 1fr))`, `gap` igual ao de `.form-grid` (`0.85rem`), `align-items: start`; `.form-section > legend` (`padding: 0`, `margin-bottom: var(--space-2)`, `font-weight: var(--font-weight-semibold)`, `grid-column: 1 / -1`); `.form-section + .form-section` com `padding-top: var(--space-4)` e `border-top: 1px solid var(--line)`; `.form-section` em coluna única na regra de 720 px. Não alterar `.modal-panel .field-group` (`styles.css:1182-1185`).

- [ ] **Step 1: Escrever os testes (todos de comportamento novo)** em `page-header.component.spec.ts`, com componente host de teste que projeta `<button class="button-primary">Novo</button>`: `renders the heading as h1 inside .page-heading and projects the action`; `hides the count while count is null`; `uses singular for one and plural otherwise` ("1 cliente", "45 clientes", "0 clientes"); `shows "X de Y" only when total is greater than count` ("12 de 45 clientes"; `total` 0, 12 ou `null` → "12 clientes"); `does not set a native title attribute on the host`.
- [ ] **Step 2: Rodar e ver falhar.** `npm --prefix frontend test -- --watch=false --runner-config C:\Users\joseh\AppData\Local\Temp\vitest-runner.config.mjs`. Esperado: o spec novo falha por não resolver o import do componente; dependendo do builder, a execução pode abortar inteira com erro de compilação — isso conta como vermelho e não permite afirmar nada sobre o resto da suíte.
- [ ] **Step 3: Implementar** o componente standalone e as regras CSS de **Interfaces**.
- [ ] **Step 4: Rodar e ver passar.** Mesmo comando. Esperado: PASS em toda a suíte.
- [ ] **Step 5: Commit.** `git add` dos arquivos de **Files**; mensagem: `feat(cadastros): cabeçalho com contagem e seção de formulário compartilhados (NAV-98)`.

### Task 2: Ação de linha com tooltip acessível

**Files:**
- Create: `frontend/src/app/shared/row-action/row-action.component.ts`
- Create: `frontend/src/app/shared/row-action/row-action.component.spec.ts`
- Modify: `frontend/src/styles.css` (junto de `.icon-button`/`.row-actions` em `:1937-1979`)

**Interfaces:**
- Consumes: `IconComponent`, `IconName` (`shared/icon/icon.component.ts:34-51`); `.icon-button`, `.icon-button--danger`, `.row-actions`; o padrão de camada fixa de `custom-select.component.ts` (`:50-51` sinal de posição, `:66` escuta de rolagem em captura, `:93-109` `placeMenu` com `getBoundingClientRect`, `:111-114` fechar em `window:resize`).
- Produces:
  ```ts
  // shared/row-action/row-action.component.ts
  @Component({ selector: 'button[appRowAction]', host: { type: 'button', class: 'icon-button row-action', ... } })
  export class RowActionComponent {
    readonly icon = input.required<IconName>();
    readonly label = input.required<string>();              // 'Editar', 'Excluir', 'Excluindo...'
    readonly target = input('');                            // nome do registro
    readonly tone = input<'default' | 'danger'>('default');
    readonly blockedReason = input<string | null>(null);
    protected readonly tipPosition: WritableSignal<{ top: number; left: number; maxWidth: number } | null>;
  }
  ```
  Host: `[attr.aria-label]` = `target ? label + ' ' + target : label`; `[class.icon-button--danger]` = `tone === 'danger'`; `[attr.aria-disabled]` = `'true'` quando `blockedReason`, senão `null`; `[attr.aria-describedby]` = id do tooltip quando `blockedReason`; `(mouseenter)` e `(focus)` abrem; `(mouseleave)`, `(blur)` e `(keydown.escape)` fecham; rolagem em captura no `document` e `window:resize` fecham (remover a escuta no `DestroyRef`).
  Template: `<app-icon [name]="icon()" /><span class="row-action__tip" role="tooltip" [id]="tipId" [class.is-open]="tipPosition() !== null" [style.top.px]="tipPosition()?.top" [style.left.px]="tipPosition()?.left" [style.max-width.px]="tipPosition()?.maxWidth">{{ blockedReason() ?? label() }}</span>`. `tipId` único por instância (contador de módulo).
  Posição ao abrir: `rect = host.getBoundingClientRect()`; `maxWidth = Math.min(280, window.innerWidth - 16)`; acima do botão (`top = rect.top - 6`, com `transform: translateY(-100%)` no CSS) ou abaixo (`rect.bottom + 6`) quando `rect.top < 48`; `left` alinhado à borda direita do botão e limitado a `[8, window.innerWidth - maxWidth - 8]`.
  CSS: `.row-action__tip { position: fixed; z-index` igual ao do menu do select; `white-space: normal; overflow-wrap: anywhere;` fundo `var(--text)`, texto `var(--surface)`, `border-radius: var(--radius-sm)`, `padding: var(--space-1) var(--space-2)`, `font-size: var(--font-size-md)`; `opacity: 0; pointer-events: none` e `opacity: 1` em `.is-open` }`; `.row-action[aria-disabled="true"]` com o visual de `.icon-button:disabled`.
  **Não intercepta o clique:** a proteção de negócio fica na página; `[disabled]` do consumidor continua funcionando.

- [ ] **Step 1: Escrever os testes (todos de comportamento novo)** em `row-action.component.spec.ts`, com host `<button appRowAction icon="pencil" label="Editar" target="Alfa" (click)="clicked = true">`: `names the button with label and target`; `renders the tooltip text and no title attribute`; `applies the danger class for tone danger`; `marks aria-disabled and describes the reason when blockedReason is set` (tooltip com o motivo, `aria-describedby` apontando para ele, sem `disabled`, `tabIndex` 0); `keeps the consumer click handler and disabled binding`; `generates distinct tooltip ids for two instances`; `opens on focus with a fixed position inside the viewport` (simular `getBoundingClientRect` e `innerWidth` 320: `.is-open`, `left >= 8`, `left + maxWidth <= 312`); `closes on Escape, blur, scroll and resize`.
- [ ] **Step 2: Rodar e ver falhar.** Mesmo comando. Esperado: falha de import/compilação do spec novo (vermelho).
- [ ] **Step 3: Implementar** o componente e o CSS de **Interfaces**.
- [ ] **Step 4: Rodar e ver passar.** Esperado: PASS em toda a suíte.
- [ ] **Step 5: Commit.** `git add` dos arquivos de **Files**; mensagem: `feat(cadastros): ação de linha com tooltip acessível em camada fixa (NAV-98)`.

### Task 3: Clientes

**Files:**
- Modify: `frontend/src/app/pages/clients/clients.component.html` (`:1-155` lista; `:157-235` formulário; `:237-305` exclusão)
- Modify: `frontend/src/app/pages/clients/clients.component.ts` (imports; `styles` em `:34-38`; debounce em `:96-100`; `PagedList` em `:59-67`; novos sinais e métodos)
- Modify: `frontend/src/app/pages/clients/clients.component.spec.ts`
- Modify: `frontend/src/app/pages/clients/clients.component.pending.spec.ts` (seletor em `:37`)

**Interfaces:**
- Consumes: `PageHeaderComponent`, `RowActionComponent`, `PagedList` (`result`, `reload`, `firstPage`, callback `onLoaded`), `summary().total`, `hasActiveFilters` (getter, `clients.component.ts:92-94`), `deleteModalErrorMessage`.
- Produces em `clients.component.ts`: `loadFailed = signal(false)` e `hasLoaded` (contrato de estados); `searchChanges: Subject<'search' | 'cancel'>` (contrato da limpeza); `protected clearFilters(): void` (`searchTerm=''`, `documentFilter='all'`, `emailFilter='all'`, cancelamento do debounce, uma `firstPage()`); `protected retryLoad(): void` (`clientList.reload()`).

- [ ] **Step 1: Escrever os testes.**
  *Comportamento novo (devem falhar antes)*, em `clients.component.spec.ts`:
  - `shows the total next to the title and not in the search label` (`.page-heading__count` = "45 clientes"; `.search-field` sem "registro(s)").
  - `shows "X de Y" while a filter is active` (`updateDocumentFilter('with')` com `totalElements` 12 → "12 de 45 clientes").
  - `shows only the count when the summary is unavailable` (`getClientSummary` com `throwError`, configurado antes de criar o componente, e filtro ativo → "12 clientes").
  - `does not render statistics cards` (sem `.stats-grid` e `.stat-card`).
  - `names row actions with the client and shows tooltips` (`.row-actions button` com `aria-label` "Editar Alfa" e "Excluir Alfa", sem `title`).
  - `shows a dash with an accessible label for missing contact and document` (`tbody` sem "Não informado" e sem "Sem nome fantasia"; `.sr-only` "Telefone não informado", "E-mail não informado", "CPF/CNPJ não informado"; nome fantasia só quando existe).
  - `groups the form into Identificação, Contato and Observações` (três `legend` nessa ordem; `legalName`, `tradeName`, `documentNumber` no primeiro `fieldset`; `phone`, `email`, `address` no segundo; `notes` no terceiro; os sete `formControlName` presentes; sem "Preencha os dados principais"; `role="dialog"`, `aria-modal="true"`, `aria-labelledby` para o título).
  - `shows the failure state on an initial load error` (montagem própria com `listClients` em `throwError` antes de criar: `[role="alert"]` com "Não foi possível carregar os clientes.", sem "Nenhum cliente cadastrado", sem contagem).
  - `shows the failure state when a reload fails after an empty success` e `... after a success with records` (sucesso, depois `mockImplementation(() => throwError(...))` e `goToPage(1)`: falha visível, sem `tbody`, sem paginação, sem contagem).
  - `recovers with Tentar novamente using the same filters and page` (após falha com filtro e página 1, restaurar o mock e clicar: última chamada com os mesmos filtros e página; tabela de volta; contagem de volta).
  - `keeps the failure state after opening and closing the form` (falha, `openCreateModal()`, `closeModal()`: falha continua).
  - `clears search and filters with exactly one request even with a pending search` (`updateSearch('alfa')`, `updateDocumentFilter('with')`, `listClients.mockClear()`, clicar "Limpar busca e filtros" antes de 300 ms, `vi.advanceTimersByTime(400)`: `listClients` chamado uma vez com `{ page: 0, size: 20, query: '', hasDocument: undefined, hasEmail: undefined }`).
  - Ajustar `shows the filtered empty state only when filters are active` (`:93-100`) para "Nenhum cliente encontrado" e "0 de 45 clientes"; em `clients.component.pending.spec.ts:37`, `.client-actions button` → `.row-actions button`.
  *Preservação (passam antes e depois):* `identifies the client in the delete confirmation` (razão social e documento dentro do `[role="alertdialog"]`); `keeps the delete dialog open with the link error` (`deleteClient` com `throwError(() => new HttpErrorResponse({ status: 409, error: { message: 'Cliente possui ordens de serviço vinculadas.' } }))`: diálogo aberto, mensagem em `[role="alertdialog"] [role="alert"]`, lista não recarregada); os testes existentes de paginação, debounce, recuo de página e Cancelar à esquerda.
- [ ] **Step 2: Rodar e ver falhar.** Comando da suíte. Esperado: FAIL nos testes de comportamento novo e no teste ajustado; PASS nos de preservação.
- [ ] **Step 3: Implementar.** `<app-page-header heading="Clientes" singular="cliente" plural="clientes" [count]="loadFailed() || !hasLoaded() ? null : totalElements()" [total]="hasActiveFilters ? summary().total : null">` com "Novo cliente" projetado; remover `:11-27`; tirar a contagem do rótulo da busca (`:31-34`), mantendo "Buscar". Tabela: Cliente (razão social; nome fantasia só se existir), Contato (telefone e e-mail em linhas próprias, prefixo `.sr-only` "Telefone:"/"E-mail:"; ausente → `<span aria-hidden="true">—</span><span class="sr-only">Telefone não informado</span>`), CPF/CNPJ (mesmo tratamento), Atualizado, **Ações**. `<div class="row-actions">` com `<button appRowAction icon="pencil" label="Editar" [target]="client.legalName" (click)="openEditModal(client)" [disabled]="deletingClientId() === client.id">` e `<button appRowAction icon="trash" tone="danger" [label]="deletingClientId() === client.id ? 'Excluindo...' : 'Excluir'" [target]="client.legalName" (click)="openDeleteModal(client)" [disabled]="deletingClientId() !== null">`; remover `.client-actions` de `styles`. Estados pelo contrato; remover o banner de erro da página; banner de sucesso com `role="status"`. Formulário: três `fieldset.form-section`, sem subtítulo genérico, `role="dialog"`; validadores, limites e `limitLegalName` intactos. Exclusão: manter texto, alvo e erro no diálogo.
- [ ] **Step 4: Rodar e ver passar.** Esperado: PASS na suíte inteira, incluindo `clients.component.pending.spec.ts`.
- [ ] **Step 5: Commit.** `git add` dos arquivos de **Files**; mensagem: `feat(clientes): contagem no título, ações por ícone, estados distintos e formulário em seções (NAV-98)`.

### Task 4: Produtos

**Files:**
- Modify: `frontend/src/app/pages/products/products.component.html` (`:1-164`, `:166-262`, `:264-330`)
- Modify: `frontend/src/app/pages/products/products.component.ts` (`styles` em `:48-71`; debounce em `:131-135`; `PagedList` em `:93-101`; prévias e `versionLabel` em `:283-316`; novos sinais e métodos)
- Modify: `frontend/src/app/pages/products/products.component.spec.ts` (`:77` e `:173-176`)

**Interfaces:**
- Consumes: os mesmos da Tarefa 3, `summary().categories`, `categoryFilterOptions`, `syncCategoryFilter`.
- Produces em `products.component.ts`: `loadFailed`, `hasLoaded`, `searchChanges: Subject<'search' | 'cancel'>`, `clearFilters()` (`searchTerm=''`, `categoryFilter=''`, `firmwareFilter='all'`, cancelamento, uma `firstPage()`), `retryLoad()`, `protected warrantyLabel(months: number): string` ("1 mês", "12 meses"). `versionLabel`, `categoryPreview`, `skuPreview`, `technicalNotesPreview` e `previewText` saem se ficarem sem uso.

- [ ] **Step 1: Escrever os testes.**
  *Comportamento novo:*
  - `shows the total next to the title` ("45 produtos"; com categoria filtrada e `totalElements` menor, "X de 45 produtos").
  - `removes statistics cards` (sem `.stat-card`); no teste existente `:72-78`, remover a expectativa "18 meses" (Garantia média) e manter as de `getProductSummary` e opções de categoria.
  - `shows hardware and firmware as separate labeled values` (rótulos "Hardware" e "Firmware"; sem "HW ", "FW " e " · "; sem as duas versões, "—" com `.sr-only` "Versões não informadas").
  - `renders full category and notes text and leaves truncation to CSS` (categoria de 80 caracteres completa no texto, sem "…"; sem "Não informada" e sem "Sem observação técnica").
  - `uses singular for one month of warranty` ("1 mês", "12 meses").
  - `names row actions with the product` ("Editar <nome>", "Excluir <nome>", sem `title`).
  - `groups the form into Identificação, Versões and Garantia e observações técnicas` (`sku`, `name`, `category`; `hardwareVersion`, `firmwareVersion`; `defaultWarrantyMonths`, `technicalNotes`; categoria continua `input[type="text"][list]` com `datalist` correspondente dentro da primeira seção; rótulos com limites mantidos; sem subtítulo genérico; `role="dialog"`).
  - Estados e limpeza, como na Tarefa 3: falha inicial, falha após sucesso vazio, falha após sucesso com registros, recuperação com mesmos filtros/página, falha mantida após abrir/fechar formulário, limpeza com busca pendente gerando uma chamada `{ page: 0, size: 20, query: '', category: '', hasFirmware: undefined }`, resumo indisponível mostrando só "X produtos".
  - Ajustar `openEditor` (`:173-176`) para `.row-actions button`.
  *Preservação:* `suggests existing categories and saves the typed category` (`:222-248`, **sem alteração**); `clears a category that no longer exists after the summary is refreshed` (`:109`); `identifies name and SKU in the delete confirmation and shows the error in the dialog`; todo `products.component.errors.spec.ts`.
- [ ] **Step 2: Rodar e ver falhar.** Esperado: FAIL nos de comportamento novo; PASS nos de preservação.
- [ ] **Step 3: Implementar.** Cabeçalho compartilhado (`singular="produto"`, `plural="produtos"`, mesma regra de `count`/`total`); remover `:11-27`; contagem fora da busca. Tabela: SKU sem quebra (`white-space: nowrap` em `.product-sku`, remover `overflow-wrap: anywhere` e `max-width`), Produto (nome; observação técnica como subtítulo só se existir, valor completo com reticências via `.product-preview` e `title` com o texto completo), Categoria (completa com reticências; "—" acessível quando ausente), Versões (linhas "Hardware x" e "Firmware y" com o rótulo em `.table-subtitle`, omitindo a ausente), Garantia (`warrantyLabel`), Atualizado, **Ações** (como na Tarefa 3, `[target]="product.name"`; remover `.product-actions`). Estados pelo contrato; banner de sucesso com `role="status"`. Formulário em três `fieldset.form-section`, com o `datalist` junto do campo de categoria. `loadSummary` e `syncCategoryFilter` intactos.
- [ ] **Step 4: Rodar e ver passar.** Esperado: PASS na suíte inteira.
- [ ] **Step 5: Commit.** `git add` dos arquivos de **Files**; mensagem: `feat(produtos): contagem no título, versões separadas, ações por ícone e formulário em seções (NAV-98)`.

### Task 5: Usuários

**Files:**
- Modify: `frontend/src/app/pages/users/users.component.html` (`:1-159`, `:161-237`, `:239-305`)
- Modify: `frontend/src/app/pages/users/users.component.ts` (`styles` em `:37-65`; debounce em `:121-125`; `PagedList` em `:86-94`; novos sinais e métodos)
- Modify: `frontend/src/app/pages/users/users.component.spec.ts`
- Modify: `frontend/src/app/pages/users/users.component.pending.spec.ts` (seletor em `:39`)

**Interfaces:**
- Consumes: `isCurrentUser` (`users.component.ts:268-271`), a guarda de `openDeleteModal` (`:224-231`), `AuthService.currentUser`, `configurePasswordValidation`.
- Produces em `users.component.ts`: `loadFailed`, `hasLoaded`, `searchChanges: Subject<'search' | 'cancel'>`, `clearFilters()` (`searchTerm=''`, `roleFilter=''`, `statusFilter='all'`, cancelamento, uma `firstPage()`), `retryLoad()`, e
  ```ts
  protected deleteBlockedReason(user: UserAccountResponse): string | null {
    return this.isCurrentUser(user) ? 'Você não pode excluir a própria conta.' : null;
  }
  ```

- [ ] **Step 1: Escrever os testes.** Em `users.component.spec.ts`, o `AuthService` falso já retorna `admin`; incluir na lista um usuário com `username` "Admin" e outro "ana".
  *Comportamento novo:*
  - `shows the total next to the title and removes statistics cards` ("45 usuários"; sem `.stat-card`).
  - `keeps the own-account delete focusable, explains why and never opens the dialog` (linha "Admin": `aria-disabled="true"`, sem `disabled`, `aria-describedby` apontando para o tooltip "Você não pode excluir a própria conta."; `click()` e `keydown` Enter não criam `[role="alertdialog"]` e não chamam `deleteUser`).
  - `keeps a tooltip and an accessible name on other users' delete` ("Excluir ana", tooltip "Excluir", sem `title`), cobrindo `users.component.html:133,136`.
  - `groups the form into Identidade, Acesso and Senha` (`fullName`, `username`; `role`, `active`; `password`); `does not mention permissions in the dialog` (sem "permissões").
  - Estados e limpeza como na Tarefa 3; busca vazia com "Nenhum usuário encontrado" e "Ajuste a busca ou os filtros."; limpeza com busca pendente gerando uma chamada `{ page: 0, size: 20, query: '', role: undefined, active: undefined }`.
  - Ajustar `users.component.pending.spec.ts:39` para `.row-actions button`.
  *Preservação:* `disables every delete while a deletion is pending` (`deleteUser` com `Subject` não emitido; já passa hoje); dica "Deixe em branco para manter a senha atual." só na edição; `users.component.password.spec.ts` inteiro; paginação e debounce existentes.
- [ ] **Step 2: Rodar e ver falhar.** Esperado: FAIL nos de comportamento novo; PASS nos de preservação.
- [ ] **Step 3: Implementar.** Cabeçalho compartilhado (`singular="usuário"`, `plural="usuários"`); remover `:11-27`; contagem fora da busca. Tabela mantém Nome (avatar `aria-hidden` + nome), Usuário, Perfil, Status (`.state-dot`), Atualizado, **Ações**. Editar: `<button appRowAction icon="pencil" label="Editar" [target]="user.fullName" (click)="openEditModal(user)" [disabled]="deletingUserId() === user.id">`. Excluir:
  ```html
  <button appRowAction icon="trash" tone="danger"
    [label]="deletingUserId() === user.id ? 'Excluindo...' : 'Excluir'"
    [target]="user.fullName"
    [blockedReason]="deleteBlockedReason(user)"
    [disabled]="deletingUserId() !== null"
    (click)="openDeleteModal(user)"></button>
  ```
  **Remover** `isCurrentUser(user)` do `[disabled]` e os dois `title`; **manter** a guarda em `openDeleteModal`; remover `.user-actions`. Formulário em três `fieldset.form-section`; **manter** `.user-form .field-group { grid-template-rows: auto }` (`users.component.ts:55-57`), porque a regra global `.modal-panel .field-group` (`styles.css:1182-1185`) continua impondo três linhas, e manter a largura de 780 px e `.field-hint`; ajustar `.user-form` gap só se a conferência visual pedir. Subtítulo do diálogo removido. Estados pelo contrato.
- [ ] **Step 4: Rodar e ver passar.** Esperado: PASS na suíte inteira.
- [ ] **Step 5: Commit.** `git add` dos arquivos de **Files**; mensagem: `feat(usuarios): contagem no título, proteção da própria conta acessível e formulário em seções (NAV-98)`.

### Task 6: Catálogo de protocolos (lista)

**Files:**
- Modify: `frontend/src/app/pages/protocols/protocols.component.html` (`:1-78`)
- Modify: `frontend/src/app/pages/protocols/protocols.component.ts` (`loadTemplates` em `:208-215`; novos sinais e métodos)
- Modify: `frontend/src/app/pages/protocols/protocols.component.spec.ts`

**Interfaces:**
- Consumes: `templates()`, `filteredTemplates()`, `loading`, `errorMessage`, `searchTerm`, `openCreateModal`, `openEditModal`, `ProtocolService.listTemplates` (`core/services/protocol.service.ts:15`).
- Produces em `protocols.component.ts`: `loadFailed = signal(false)` e `loaded = signal(false)` (contrato de estados; `true`/`false` em `loadTemplates`, sem relação com `clearMessages`); `protected clearSearch(): void` (`searchTerm.set('')`); `protected retryLoad(): void` (`loadTemplates()`).

- [ ] **Step 1: Escrever os testes.** Fábrica de `ProtocolTemplateResponse` (`core/models.ts:645-656`) com dois modelos: um ativo por produto e um inativo por categoria; `listTemplates` como `vi.fn`.
  *Comportamento novo:*
  - `shows the count next to the title and "X de Y" while searching` ("2 protocolos"; `updateSearch` com o nome de um → "1 de 2 protocolos", sem debounce).
  - `shows state in its own column` (cabeçalho "Estado", `.state-dot` "Ativo"/"Inativo"; célula do nome sem o subtítulo de estado; colunas "Etapas bloqueadas" e "Ações" presentes).
  - `names the Nova versão action with the protocol` (texto "Nova versão" e `aria-label` "Nova versão de <nome>").
  - `shows the empty catalog with a create action` ("Nenhum protocolo cadastrado"; "Cadastrar protocolo" abre o formulário).
  - `shows search without results with a clear action` ("Nenhum protocolo encontrado"; "Limpar busca" restaura os dois).
  - `shows the failure state on load error` (mock em erro antes de criar: `[role="alert"]` "Não foi possível carregar os protocolos.", "Tentar novamente", sem "Nenhum protocolo cadastrado", sem contagem), `keeps the failure after opening and closing the form`, `shows the failure when a reload fails after a success` e `recovers with Tentar novamente`.
  *Preservação:* `shows Cancelar before the primary action in the form dialog` (`:30-35`).
- [ ] **Step 2: Rodar e ver falhar.** Esperado: FAIL nos de comportamento novo; PASS no de preservação.
- [ ] **Step 3: Implementar.** `<app-page-header heading="Protocolos técnicos" singular="protocolo" plural="protocolos" [count]="loadFailed() || !loaded() ? null : filteredTemplates().length" [total]="searchTerm().trim() ? templates().length : null">` com "Novo protocolo"; contagem fora da busca. Tabela: Protocolo, Aplicação, Versão, Itens, Etapas bloqueadas (mantida), **Estado**, Atualizado, **Ações** ("Nova versão" como texto, com `aria-label`). Estados pelo contrato; banner de erro da página sai; sucesso com `role="status"`. Sem paginação.
- [ ] **Step 4: Rodar e ver passar.** Esperado: PASS na suíte inteira, incluindo `shared/rma-protocols` (execução na OS intocada).
- [ ] **Step 5: Commit.** `git add` dos arquivos de **Files**; mensagem: `feat(protocolos): catálogo com contagem, estado e estados distintos (NAV-98)`.

### Task 7: Formulário de protocolo e ciclo de salvamento (criação e nova versão)

**Files:**
- Modify: `frontend/src/app/pages/protocols/protocols.component.html` (`:80-201`)
- Modify: `frontend/src/app/pages/protocols/protocols.component.ts` (`closeModal` em `:128-131`; `saveTemplate` em `:152-174`; novos sinais e métodos)
- Modify: `frontend/src/app/pages/protocols/protocols.component.spec.ts`

**Interfaces:**
- Consumes: `form`, `items`, `itemGroup` e `buildTemplatePayload` (inalterados), `DECIMAL_PATTERN` (`protocols.component.ts:14`: até 13 dígitos inteiros e até 6 decimais, vírgula ou ponto, sinal opcional), a validação manual de produto/categoria (`:154`), os limites de `decimalPlaces` (`:200`: 0 a 6), `ProtocolService.createTemplate/updateTemplate` (`protocol.service.ts:19-26`).
- Produces em `protocols.component.ts`:
  - `protected closeModal(): void` — retorna sem efeito enquanto `submitting()`; senão chama `resetModal()`. Usado por Cancelar, fechar e overlay.
  - `private resetModal(): void` — sem guarda: `modalOpen.set(false)`, `modalErrorMessage.set('')`, `submitAttempted.set(false)`. Chamado no `next` de `saveTemplate` no lugar de `closeModal()`, porque ali `submitting` ainda é `true` (o `finalize` roda depois).
  - `protected readonly submitAttempted = signal(false)` — `true` ao enviar inválido; `openCreateModal`/`openEditModal` voltam a `false`.
  - `protected hasError(control: AbstractControl): boolean` — inválido e (tocado ou alterado).
  - `protected categoryMissing(): boolean` — método (o formulário não é sinal, então `computed` não reagiria): `submitAttempted() && form.controls.productId.value === null && !normalizeOptionalText(form.controls.category.value)`.
  Mensagens por erro existente (sem validador novo):

  | Controle | Erro | Mensagem |
  | --- | --- | --- |
  | `name` | `required` | "Informe o nome do protocolo." |
  | `name` | `maxlength` | "Use até 120 caracteres." |
  | `category` (sem produto) | validação manual | "Informe a categoria ou selecione um produto." |
  | `stepName` | `required` | "Informe a etapa." |
  | `title` | `required` | "Informe o item." |
  | `decimalPlaces` | `min`/`max` | "Use de 0 a 6 casas decimais." |
  | `minValue`, `maxValue` | `pattern` | "Use um número com até 13 dígitos inteiros e até 6 casas decimais, separadas por vírgula ou ponto." |

  `unit`, `expectedResult`, `instructions` e o `maxlength` de `stepName`/`title` já são contidos pelo atributo `maxlength` do campo; não ganham mensagem. O banner atual (`:156`) continua.

- [ ] **Step 1: Escrever os testes.** `createTemplate` e `updateTemplate` como `vi.fn` retornando `Subject` (para controlar pendência) ou `of(...)`.
  *Comportamento novo:*
  - `groups the form into Configuração geral, Etapas bloqueadas and Itens` (`name`, `productId`, `category` quando sem produto, `active` no primeiro `fieldset.form-section`; checkboxes de etapas no segundo, com a frase de consequência; itens no terceiro, cada um com título "Item N" e "Remover item" com `aria-label` "Remover item N"; `role="dialog"`, `aria-modal`, `aria-labelledby`).
  - `shows field errors after an invalid submit` (nome vazio, sem produto e sem categoria, etapa e item vazios: as mensagens da tabela junto dos campos e o banner atual; `createTemplate` não chamado).
  - `shows decimal and decimal places errors for measurement items` (tipo `MEASUREMENT`, `decimalPlaces` 7, `minValue` "1,1234567": mensagens correspondentes).
  - `stays open while publishing and closes on success` — para criação e para nova versão: com o `Subject` pendente, `.modal-close` `disabled`, `closeModal()` e clique no overlay mantêm o diálogo; emitir sucesso e completar: diálogo fechado, banner de sucesso ("Protocolo X cadastrado." / "Protocolo X publicado na versão N."), `listTemplates` chamado de novo.
  - `keeps values and reopens closing after a failure` (erro do serviço: diálogo aberto, valores preservados, `[role="dialog"] [role="alert"]` com a mensagem, fechar habilitado e funcional).
  *Preservação (passam antes e depois):* `opens a new version with the original rule and publishes through updateTemplate` (título "Nova versão do protocolo", texto "Execuções já iniciadas continuam na versão em que começaram.", botão "Publicar nova versão"; envio chama `updateTemplate(id, payload)` e não `createTemplate`; payload igual ao de `buildTemplatePayload`); categoria só aparece sem produto; Cancelar à esquerda.
- [ ] **Step 2: Rodar e ver falhar.** Esperado: FAIL nos de comportamento novo (em especial "stays open while publishing"); PASS nos de preservação.
- [ ] **Step 3: Implementar.** `closeModal`/`resetModal`/`submitAttempted` como em **Interfaces**; `[disabled]="submitting()"` em `.modal-close`; três `fieldset.form-section` (o `fieldset.field-group` das etapas vira a segunda seção, mantendo a frase como texto de apoio sob a `legend` "Etapas bloqueadas"); `<small class="field-error">` conforme a tabela; "Item N" como título de cada `.protocol-item-card`. **Não alterar** `itemGroup`, `buildTemplatePayload`, validadores nem o tipo dos campos. Resumo por item com edição focada fica fora.
- [ ] **Step 4: Rodar e ver passar.** Esperado: PASS na suíte inteira.
- [ ] **Step 5: Commit.** `git add` dos arquivos de **Files**; mensagem: `feat(protocolos): formulário em seções, mensagens por campo e diálogo estável durante a publicação (NAV-98)`.

### Task 8: Verificação

**Files:** ao final, e só com aprovação do usuário, `docs/ux/2026-11-07-etapa-1-fundacao-visual.md` (linha da etapa 3 no roteiro) e `docs/ux/2026-11-06-estudo-ui-ux.md` (candidatos ao dashboard).

- [ ] **Step 1: Suíte e build.** `npm --prefix frontend test -- --watch=false --runner-config C:\Users\joseh\AppData\Local\Temp\vitest-runner.config.mjs` e `npm --prefix frontend run build`. Esperado: PASS; os dois avisos de orçamento existentes não pioram além do custo dos dois componentes.
- [ ] **Step 2: Buscas de regressão (PowerShell, só componentes, sem specs).**
  ```powershell
  $files = Get-ChildItem -Path frontend/src/app/pages/clients, frontend/src/app/pages/products, frontend/src/app/pages/users, frontend/src/app/pages/protocols -File |
    Where-Object { $_.Name -match '\.component\.(html|ts)$' }
  $files | Select-String -Pattern 'stats-grid', 'stat-card', 'registro\(s\)', 'title="Editar"', 'title="Excluir"', 'client-actions', 'product-actions', 'user-actions'
  ```
  Esperado: nenhuma saída.
  ```powershell
  Select-String -Path frontend/src/app/pages/products/products.component.html -Pattern 'list="product-categories"'
  Select-String -Path frontend/src/app/pages/users/users.component.ts -Pattern 'if \(this\.isCurrentUser\(user\)\)'
  git diff --stat main -- frontend/src/app/app.routes.ts
  ```
  Esperado: uma ocorrência em cada um dos dois primeiros (categoria livre e guarda mantidas) e nenhuma saída no `git diff` (permissões por rota intocadas).
- [ ] **Step 3: Relatar** que a verificação foi por testes e build, que a conferência autenticada não foi feita pelo agente, e entregar o roteiro abaixo ao usuário.
- [ ] **Step 4: Depois da conferência do usuário,** marcar a etapa 3 como entregue no roteiro (com os commits) e registrar no estudo "Garantia média" e "Administradores" como candidatos ao dashboard (etapa 6).

**Roteiro manual (usuário, com backend em `localhost:8080` e `npm --prefix frontend start -- --port 4300`; login feito pelo próprio usuário):**

1. Entrar como **ADMIN**. Em Clientes, Produtos, Usuários e Protocolos, em 1440 px e 320 px: título com contagem, sem cartões de estatística, busca logo abaixo, sem rolagem horizontal da página (a tabela rola sozinha).
2. Clientes, Produtos e Usuários: buscar e filtrar (a contagem vira "X de Y"), ir para a página 2, trocar um filtro e conferir que volta à página 1; esvaziar o resultado e usar "Limpar busca e filtros". Protocolos: a busca filtra na hora, sem paginação, e "Limpar busca" restaura a lista.
3. Ações de linha: passar o mouse e navegar com Tab até lápis e lixeira; o tooltip aparece nos dois casos, inteiro, sem ser cortado na primeira e na última linha, com a tabela rolada na horizontal e com zoom de 200%; Escape o esconde; rolar a página o fecha. Com leitor de tela, o nome inclui o registro.
4. Usuários: na própria linha, a lixeira recebe foco, mostra "Você não pode excluir a própria conta." e não abre o diálogo com clique nem Enter.
5. Formulários: criar e editar um registro de cada tela; seções na ordem prevista, alinhamento dos campos igual ao de antes (inclusive usuários em 320 px), Cancelar à esquerda, mesmas validações; em produtos, digitar uma categoria nova e salvar; em usuários, editar sem senha mantém a atual.
6. Exclusões: o diálogo mostra nome e identificador; excluir um cliente com OS vinculada mostra o erro dentro do diálogo, que continua aberto.
7. Protocolos: enviar vazio mostra as mensagens por campo; "Nova versão" abre com a regra das execuções iniciadas, o diálogo não fecha enquanto publica, fecha ao concluir e a versão sobe.
8. Entrar como **SERVICE_DESK**: Clientes e Produtos acessíveis e iguais; Usuários e Protocolos continuam bloqueados pela rota.
9. Com o backend parado, abrir cada tela e depois religar e usar "Tentar novamente": antes aparece a falha (nunca "Nenhum ... cadastrado"), depois a lista volta.

## Critérios de aceite

1. As quatro telas usam `app-page-header`; com filtro ou busca ativos e denominador disponível maior que a contagem, o título mostra "X de Y"; nos demais casos, "N"; sem resultado da consulta atual, nenhuma contagem. A barra de busca/filtros fica logo abaixo, sem contagem no rótulo.
2. Os cartões de estatística saíram de clientes, produtos e usuários conforme a tabela de decisão; as requisições de resumo continuam e as categorias de produtos seguem no filtro e nas sugestões.
3. Editar e Excluir são `button[appRowAction]` com tooltip em hover e foco em camada fixa, nome acessível com o registro e sem `title` nativo; a coluna se chama "Ações"; "Nova versão" continua com texto.
4. Falha da última consulta, carregando, cadastro vazio e busca sem resultado são estados distintos, com a falha em sinal próprio e precedência sobre os demais, recuperação por "Tentar novamente" e próxima ação pertinente em cada caso.
5. "Limpar busca e filtros" gera exatamente uma requisição, mesmo com busca pendente no debounce.
6. Os formulários estão em seções (`fieldset.form-section` + `legend`), sem subtítulos genéricos, com `role="dialog"`, Cancelar à esquerda e os mesmos campos, validações e payloads; protocolos mostram mensagens por campo, não fecham durante o envio e fecham no sucesso.
7. Paginação, debounce, filtros, categoria livre, proteção da própria conta, regra de versões e erro de vínculo no diálogo estão cobertos por testes; as permissões por rota ficam preservadas porque `app.routes.ts` não muda.
8. Testes e build passam; a conferência no navegador, inclusive a visibilidade do tooltip, é feita pelo usuário com o roteiro acima.

## Registro da revisão independente

Os dez pontos da revisão foram conferidos no código e aceitos. Evidências: `protocols.component.ts:166-169` (sucesso fecha antes do `finalize`); `paged-list.ts:27-31,59-67` e `protocols.component.ts:116,217-221` (falha não registrada, mensagem limpa ao abrir formulário); `clients.component.ts:96-100`, `products.component.ts:131-135`, `users.component.ts:121-125` (debounce pendente) e `catalog-ui.ts:8` (`PresenceFilter`); `label` obrigatório no contrato da ação de linha; `products.component.spec.ts:77` ("18 meses"); `styles.css:1469-1471` e `custom-select.component.ts:50-51,66,93-114` (camada fixa); `styles.css:1182-1185,1522-1527` (linhas dos campos e reset de `fieldset`); `protocols.component.ts:14,154,200` (padrão decimal, categoria manual, casas decimais); busca de regressão restrita a `*.component.(html|ts)`; `users.component.html:133,136`; `guards.spec.ts:43-52` (não cobre a matriz de rotas). A divisão recomendada foi aplicada (Tarefas 1/2 e 6/7).

Decisão própria, sem discordância da revisão: na falha depois de um sucesso com registros, o estado de falha **substitui** a tabela em vez de mantê-la com aviso, porque as linhas anteriores podem não corresponder aos filtros atuais.

## Fora deste plano

Editor de protocolo com resumo por item e edição focada, execução de protocolo na OS (`shared/rma-protocols`), ícones auxiliares de contato (exigem ícones novos), migração do cabeçalho do Kanban para `app-page-header`, extração do diálogo de exclusão, teste da matriz de rotas por perfil, mudança de densidade (36 px), indicadores no dashboard (etapa 6), peças/estoque (etapa 5) e qualquer gestão de permissões ou recuperação de senha.
