# Etapa 7 — Conferência global: plano de implementação (NAV-98)

**Não entram:** mudanças de permissões, envio/configuração de e-mails, relatórios (serão refeitos depois), backend, infraestrutura, dependências novas ou redesenho das telas. Preservar os acessos e contratos existentes; testes de preservação de perfil não autorizam mudar permissões.

> **Para quem executa:** seguir as tarefas numeradas com superpowers:executing-plans. Esta solicitação produz **somente este plano**; não autoriza executar as tarefas nem Git. Os commits abaixo são previstos para a implementação futura, um por tarefa ou subtarefa, sem trailer de coautoria nem menção a IA.

**Objetivo:** resolver F1, fechar diferenças comprovadas nas dez telas e atualizar a conferência manual, preservando os ajustes visuais de 9 de novembro.

**Arquitetura:** o [carregamento global](../superpowers/plans/2026-11-09-global-loading.md) é base obrigatória, integrada antes da Tarefa 1: `core/services/loading.service.ts`, `core/interceptors/loading.interceptor.ts`, `shared/loading-overlay/` e `app.ts`/`app.html`; `#content` recebe `inert` e `aria-busy`; `app-loading-overlay` fica dentro do `<dialog class="global-loading-dialog">` irmão de `#content`, aberto com `showModal()` para que a camada superior do navegador cubra também diálogos nativos abertos. Uma diretiva standalone coordena foco/pilha, sem biblioteca de modais; controles e cores ficam em `frontend/src/styles.css`. Angular 21, signals/reactive forms e Vitest. Executar **0a → 0b → 0c → 1 → 2 → 3a → 3b → 4 → 5 → 6a → 6b → 6c → 7 → 8a → 8b → 9**, sem editar os mesmos arquivos em paralelo. A Tarefa 7 depende explicitamente da integração do carregamento global.

**Referências lidas:** [estudo global](2026-11-06-estudo-ui-ux.md), [roteiro manual](2026-11-07-roteiro-conferencia-manual.md), [etapa 5](2026-11-07-plano-etapa-5-operacoes.md), [revisão da etapa 5](2026-11-08-revisao-plano-etapa-5.md) e [etapa 6](2026-11-08-plano-etapa-6-comunicacao-analise.md), além do [plano de carregamento global](../superpowers/plans/2026-11-09-global-loading.md). Base: arquivos locais em 9/11/2026, sem consultar Git. Âncoras devem ser reconferidas ao executar; os planos anteriores descrevem estados já superados pelo código atual.

## Inventário real de diálogos — F1

Busca em todos os templates de `frontend/src/app`, incluindo `alertdialog`, overlays sem papel e `<dialog>`; specs não entram na contagem. Caminhos desta seção relativos a `frontend/src/app/`.

```powershell
$templates = Get-ChildItem frontend/src/app -Recurse -File -Filter '*.html'
$templates | Select-String -Pattern 'role="dialog"','aria-modal','role="alertdialog"','modal-overlay','<dialog'
```

**Resultado: 19 estruturas de diálogo:** 10 `role="dialog"`, 3 `role="alertdialog"` (13 `aria-modal="true"`), 5 overlays sem semântica e 1 diálogo nativo. Criar/editar no mesmo template conta uma vez; o mesmo vale para as três ações do lote. O bloqueador global é um `<dialog>` nativo (`global-loading-dialog`, `app.html`) aberto com `showModal()`, com um único `role="status"` interno, sem classes de modal, `role="dialog"` ou `aria-modal`: fica fora destas 19 estruturas e da pilha de diálogos da diretiva. Preservar essa separação também na contagem de `.modal-overlay` de `rma-detail-modal.component.ts:119`.

| Template e âncora | Estruturas / situação atual | Migração e foco inicial | Tarefa |
| --- | --- | --- | --- |
| `pages/clients/clients.component.html:164,261` | Cadastro + exclusão; `dialog`/`alertdialog` | Diretiva nos dois; Nome/Razão social e Cancelar, respectivamente | 2 |
| `pages/products/products.component.html:172,287` | Cadastro + exclusão; `dialog`/`alertdialog` | Diretiva nos dois; SKU e Cancelar | 2 |
| `pages/users/users.component.html:152,247` | Cadastro + exclusão; `dialog`/`alertdialog` | Diretiva nos dois; Nome completo e Cancelar | 2 |
| `pages/protocols/protocols.component.html:101` | Criar/publicar versão; `dialog` | Diretiva; nome do protocolo; seleção do item inválido continua posterior à validação | 2 |
| `pages/rmas/rmas.component.html:152,316,548` | Detalhe, abertura e diagnóstico; `dialog` | Diretiva nos três; painel do detalhe, seletor Cliente, primeiro campo do diagnóstico | 3a |
| `pages/kanban/kanban.component.html:288,353` | Salvar/renomear visualização e status; sem papel | Adicionar `dialog`, `aria-modal`, títulos com IDs; diretiva; Nome e Novo status | 3b |
| `shared/rma-detail-modal/rma-detail-modal.component.html:2` | Detalhe do Kanban; `dialog`, foco próprio parcial | Substituir foco/trap/Escape/retorno locais pela diretiva; foco no painel | 3b |
| `shared/kanban-bulk-actions/kanban-bulk-actions.component.html:33` | Confirmação de status/prioridade/responsável; `dialog` | Diretiva; Cancelar; preservar escopo e resultado parcial | 3b |
| `shared/rma-block-panel/rma-block-panel.component.html:1` | Impedimentos; `<dialog>` + `showModal()` | Manter nativo com leituras `SKIP_GLOBAL_LOADING` e indicador local, conforme decisão na 0a; integrar à diretiva sem segundo trap; foco no título, inclusive durante carga/falha | 0a/3b |
| `pages/parts/parts.component.html:192,274,345` | Cadastro, movimento e histórico; sem papel | Adicionar `dialog`, `aria-modal`, títulos com IDs; diretiva; Código, Tipo e título do histórico | 4 |
| `pages/notifications/notifications.component.html:279` | Editor de regra; `dialog` | Diretiva; título da regra | 4 |

**Correção do diagnóstico antigo:** o detalhe do Kanban já captura `previousFocus`, usa `afterNextRender`, `trapFocus` e Escape (`rma-detail-modal.component.ts:109-132`). Falta coordenar a pilha, zero focáveis, alvos removidos e fundo. Impedimentos já tem modalização nativa (`rma-block-panel.component.ts:39`, `showModal()`): o painel está dentro de `#content`, que fica inerte na carga global, e o bloqueador global (também nativo, aberto depois) o cobre na camada superior. **Decisão anterior à execução:** manter o nativo, marcar as leituras do painel com `SKIP_GLOBAL_LOADING` e manter indicador local sem texto solto nem `role="status"`; implementar/conferir essa exceção na 0a antes da limpeza da 0b, preservá-la na 3b e validar no navegador. Não instalar um segundo trap nele. Login e dashboard não têm diálogos próprios.

## Conferência entre telas — diferenças comprovadas

Caminhos relativos a `frontend/src/app/`; CSS global = `frontend/src/styles.css`. “Preservar” significa conferir o que já existe, sem reapresentar como entrega nova.

| Tela | Evidência concreta e destino |
| --- | --- |
| Login | `pages/login/login.component.css:99-106,130-131,199-203`: input 42 px, mostrar senha 30×30, Acessar 32 px, fundo de campo lilás `rgba(248,245,252,.92)` e botão ciano próprio. Alinhar controles/tokens na 6a; preservar marca até a decisão da logo, fundo de acesso, rótulos e mensagens de autenticação. |
| Kanban | HTML `:3-4` ainda põe `X de Y ordens de serviço` no título: remover `.kanban-heading__count` e levar o total ao primeiro indicador de `heroStats`/`.kanban-summary`, sem `app-result-count`. CSS `.kanban-chip__remove` mede 22×22. TS `removeFilter:361-363` não limpa `activeViewId`; `loadKanban:632-650` usa erro de página compartilhado, sem retry, e continua mostrando o quadro. Tarefa 5 e alvos na 6a. |
| Ordens de serviço | `pages/rmas/rmas.component.html`, `tab-list` do detalhe: seis botões sem roving tabindex/setas, diferente de notificações. TS `:155-156,247,248,251` contém gaps/paddings 1,25/0,85/0,9 rem e branco literal. Na 0c, retirar `rma-summary` do painel de filtros (`HTML:27-29`, CSS no TS `:137-145`), criar indicadores logo abaixo de `app-page-header` e remover o `app-result-count` duplicado da paginação (`HTML:140`). Foco na 3a; acabamento na 6a e abas na 6c. Preservar contratos dos estados da lista, ajustando o ramo de carga na 0b. |
| Clientes | HTML `:151,164,261`: remover `app-result-count` junto da paginação na 0c; cadastro/exclusão sem coordenação de foco. `button[appRowAction]` herda `.icon-button` de 34×34 no CSS global. Tarefas 2/6a; preservar carga/falha/vazio e limpeza única, com carga sem texto solto na 0b. |
| Produtos | Mesmos desvios de foco/alvo (`HTML:159,172,287`). Remover `app-result-count` junto da paginação na 0c; preservar categoria livre, hardware/firmware separados, singular da garantia e estados. O total fica somente na paginação; tarefas 2/6a. |
| Usuários | Mesmos desvios de foco/alvo (`HTML:139,152,247`); TS `:53` usa `gap: .85rem 1rem`. Remover `app-result-count` junto da paginação na 0c; tarefas 2/6a; preservar senha inicial/opcional e exclusão própria focável com motivo. |
| Protocolos | HTML `:77,183`: Nova versão/Remover item usam botões pequenos de 34 px; editor sem foco compartilhado (`:101`). Tarefas 2/6a. Preservar título “Protocolos técnicos”, editor focado, versão e `app-result-count` no rodapé (`:88`), pois não há paginação. |
| Peças | Três overlays sem semântica; Estornar em botão pequeno (`HTML:407`). Tarefas 4/6a. Manter `app-result-count`, pois não há paginação. Carga independente do histórico, Cancelar estorno, unidades e três saldos já existem. O valor em estoque também já está na linha `stock-summary:11`: preservar, sem migrá-lo ao dashboard. |
| Dashboard | `pages/dashboard/dashboard.component.ts:98-100`: tons locais `#1f8fbf/#2f8a5b/#6d55c9`, já repetidos nas classes globais `.tone-*`. Reutilizar fonte comum na 6a. Carga/falha/retry, escopo, links e exclusão dos encerrados da fila já entregues: preservação. |
| Notificações | TS `:119,122,126`: padding .85 rem, branco literal e fundo não lido `#f5f9fd`; botões pequenos no HTML `:37,101,153`. Serviço de resumo absorve falha e conserva número (`core/services/notification.service.ts:35-42`); `recipientsSummary:430` só diz “Nenhum destinatário”. O serviço já importa e usa `SKIP_GLOBAL_LOADING` (`:4,37,41`): preservar em `refreshSummary` na 7, após integrar a base global. Tarefas 6a/7. Estados das quatro fontes já existem; na regra, alterar somente o texto do resumo/editor, sem mudar destinatários, canais, envio ou falhas de entrega. |

**Resíduos compartilhados:** `shared/pagination/pagination.component.ts:11` usa “registro(s)”; `shared/kanban-bulk-actions/kanban-bulk-actions.component.html` usa “ordens de serviço”, “selecionado(s)” e “atualizado(s)”. No CSS global, `.icon-button`, `.link-button`, seletores de status/responsável e botões pequenos usam 28/34 px. Calendário usa 32/34 px (`shared/form-controls/date-picker/date-picker.component.css:99,130`). A 0c resolve o plural e os rótulos por entidade da paginação; a 6c resolve os plurais de lote; a 6a resolve alvos clicáveis de **pelo menos 40×40 px** (calendário na 6b); ícones, avatares e chips informativos não precisam medir 40 px.

**Cores que divergem da fonte comum:** `shared/rma-kanban-board/rma-kanban-board.component.css:67,69-71` usa Triagem `#4ea8ff`, Peças `#d7a230`, Reparo `#f06767`, Testes `#8667e8`; `[data-status]` global usa `#3b8fe0/#c98d16/#e05a5a/#7a5fd8`. Detalhe usa amarelos próprios em `.rma-detail__section--failure`/`.rma-detail__callout` e roxo `#8667e8` na atribuição. `rma-sla-badge.component.css:4,11-13` também redefine tons. Fonte única na 6a, preservando significado e contraste. Literais iguais à paleta são repetição, não uma cor proibida. As cores recentes de contraste dos cards (`#e3eaf3`, `#c3d1e0`, `#4a5d72`) devem virar tokens com os mesmos valores, sem voltar ao cinza que perdia contraste.

## Destino das pendências dos planos 5/6

| Pendência | Decisão nesta etapa e justificativa |
| --- | --- |
| F1 | **Entra, tarefas 1, 2, 3a, 3b e 4, após 0a–0c.** Dívida de interação compartilhada, com teste de pilha e navegador. |
| Visualização ativa após remover chip | **Entra, 5.** Não pode indicar filtros salvos diferentes dos aplicados. Corrigir também edição manual. |
| N1 — limite/paginação de notificações | **Fora.** Exige produto/API; manter aviso do limite de 100. |
| N2 — desfazer silenciamento de obrigatório | **Fora.** Comportamento novo de preferência; preservar precedência atual. |
| N3 — disponibilidade do resumo não lido | **Entra, 7, após integrar o carregamento global.** Pequeno estado de leitura compartilhado; evita apresentar número antigo como atual no sino e na aba, sem endpoint novo. |
| N4 — regra sem destinatários | **Entra, 7.** Somente aviso factual no texto do resumo/editor; sem validação, bloqueio de salvamento ou alteração de destinatários, canais, envio ou falhas de entrega. |
| D1 — remover Últimas Ordens de serviço | **Fora.** Retira informação; não há evidência de uso para decidir a remoção. |
| D2 — indicadores no servidor | **Fora.** Exige backend e definição de recorte. |
| D3 — instante/Atualizar dashboard | **Fora.** Nova ação e ciclo de recarga, desnecessários para uniformizar a apresentação existente. |
| D4 — garantia média/administradores/valor em estoque | **Fora.** Não criar indicadores. O valor já preservado em Peças não será duplicado nem movido. |
| R1 — filtros alterados / R2 — exportação | **Fora, ambos.** Relatórios serão refeitos; não revisar seus templates, specs ou fluxos nesta etapa. |

## Logo — pendência bloqueada por decisão do usuário

O pedido de logo em SVG permanece **bloqueado pela decisão do usuário** sobre símbolo, versões clara/escura e opções com/sem nome. Preservar a marca atual até essa decisão; não é dependência para executar as demais tarefas.

**Arquivos atuais:** `frontend/public/navitas-assist-logo.png` (`pages/login/login.component.html:7`), `frontend/public/navitas-assist-logo-cropped.png` (`layout/app-shell.component.html:6`), regras `.brand-lockup*` em `frontend/src/styles.css:489-495` e `frontend/public/favicon.ico`.

**Após aprovação, em tarefa própria:** criar `frontend/public/brand/*.svg`, trocar os dois `src`, ajustar `alt` e dimensões; favicon opcional. Conferir visualmente login e lateral expandida/em 320 px. Não gerar/substituir assets nesta revisão do plano nem incluir a logo no aceite como entregue.

## Contrato de execução e testes

- **Novo:** assertiva que falha na base atual por comportamento; escrever e observar o vermelho antes da correção. **Preservação:** comportamento já existente, deve passar antes/depois. Não classificar erro de mock/compilação como vermelho comportamental.
- Cada tarefa: escrever os testes novos indicados → executar o comando → implementar → repetir e obter zero falhas → conferir aceite → commit previsto por tarefa/subtarefa, limitado aos arquivos listados. A 8 tem dois commits separados: rotas sob demanda (8a) e consolidação de CSS (8b). Estilo/documentação sem comportamento novo recebe conferência visual/documental, sem teste que apenas copie CSS.
- Comandos abaixo partem da **raiz** e usam `npm --prefix frontend`; os `--include` são relativos a `frontend/`. O runner externo limita workers; não criá-lo nem alterá-lo nesta entrega. **Se `C:\Users\joseh\AppData\Local\Temp\vitest-runner.config.mjs` não existir, executar todos os comandos abaixo sem `--runner-config` e sem o caminho que acompanha essa opção.**
- Conferência visual futura: 1440 px, 320 px e zoom 200%, teclado e perfis reais, respeitando o acesso atual. Happy DOM não prova geometria, comportamento nativo de `<dialog>` ou bloqueio real do fundo.
- Foco da revisão: overlay global acessível com diálogo aberto, fechamento durante carga e dono único do retorno; select aberto no trap; diálogo filho sobre pai; fechamento durante escrita; gatilho removido após recarga; respostas fora de ordem; alvo de 40 px sem cortar calendário/popover em 320 px. Os testes abaixo atribuem dono a cada caso.

### Tarefa 0a — Integrar e conferir o carregamento global obrigatório

**Base:** [plano de carregamento global](../superpowers/plans/2026-11-09-global-loading.md). Reutilizar a implementação existente e fechar sua integração antes da 0b e da Tarefa 1, sem duplicar serviço/interceptor/overlay.

**Conferir/ajustar na execução futura:** `frontend/src/app/core/services/loading.service.ts`, `frontend/src/app/core/services/loading.service.spec.ts`, `frontend/src/app/core/interceptors/loading.interceptor.ts`, `frontend/src/app/core/interceptors/loading.interceptor.spec.ts`, `frontend/src/app/shared/loading-overlay/loading-overlay.component.ts`, `frontend/src/app/shared/loading-overlay/loading-overlay.component.css`, `frontend/src/app/shared/loading-overlay/loading-overlay.component.spec.ts`, `frontend/src/app/app.config.ts`, `frontend/src/app/app.ts`, `frontend/src/app/app.html`, `frontend/src/app/app.spec.ts`; `frontend/src/app/core/services/rma.service.ts`, `frontend/src/app/core/services/rma.service.spec.ts` e `frontend/src/app/shared/rma-block-panel/rma-block-panel.component.ts`/`.html`/`.spec.ts`.

- [ ] Confirmar o singleton `LoadingService`, o interceptor com `SKIP_GLOBAL_LOADING`, os tempos de 200 ms para mostrar/400 ms mínimos visíveis e o balanceamento em sucesso, falha e cancelamento. `#content` recebe `aria-busy` e fica `inert` durante `visible()`; `app-loading-overlay` fica como irmão, com um único `role="status"`, sem classes de modal, `role="dialog"` ou `aria-modal`. O bloqueador global é um `<dialog>` nativo aberto com `showModal()` (decisão mantida: a camada superior cobre outros diálogos, inclusive nativos), com `cancel` ignorado; não incluí-lo na pilha/inventário de F1.
- [ ] Resolver antes da 0b a exceção da camada superior de impedimentos: **manter o painel nativo e usar carga local nas leituras**. Permitir `RmaService.getById(id: number, context?: HttpContext): Observable<RmaResponse>`, preservando o comportamento dos chamadores que não passam contexto; no painel, passar contexto com `SKIP_GLOBAL_LOADING = true` em carga inicial/retry. Manter indicador visual local e `aria-busy`, sem texto solto ou segundo `role="status"` (limpeza na 0b); não estender a exceção aos demais aplicadores do serviço.
- [ ] Preservar as exclusões existentes do resumo/poll de notificações e restauração silenciosa de sessão. Conferir no navegador o painel nativo em carga/retry e a exposição do status global nos fluxos que o usam; não aceitar o pop-up global coberto pela camada superior ou o painel de leitura preso dentro de `#content` inerte. A coordenação de foco com a pilha entra na Tarefa 1.

**Novos/preservação:** serviço/interceptor/overlay mantêm contagem e tempos; leitura e retry de impedimentos carregam com indicador local sem acionar o overlay global, enquanto `getById` dos outros aplicadores continua global. Conferência real de camada superior no navegador é obrigatória, sem aprovação baseada só no DOM simulado.

**Comando:** `npm --prefix frontend test -- --watch=false --runner-config 'C:\Users\joseh\AppData\Local\Temp\vitest-runner.config.mjs' --include 'src/app/core/services/loading.service.spec.ts' --include 'src/app/core/interceptors/loading.interceptor.spec.ts' --include 'src/app/shared/loading-overlay/*.spec.ts' --include 'src/app/app.spec.ts' --include 'src/app/core/services/rma.service.spec.ts' --include 'src/app/shared/rma-block-panel/*.spec.ts'`

**Aceite:** base global integrada e decisão de impedimentos implementada/conferida antes de continuar. **Commit previsto, se houver ajustes:** `fix(carregamento): integrar base global e leitura local de impedimentos (NAV-98)`.

### Tarefa 0b — Remover textos soltos de carregamento

**Depende:** 0a, inclusive a exceção de impedimentos. Relatórios ficam fora.

**Modificar na execução futura, âncoras relativas a `frontend/src/app/`:**
- Templates `pages/clients/clients.component.html:58`, `pages/products/products.component.html:58`, `pages/users/users.component.html:61`, `pages/protocols/protocols.component.html:34`, `pages/rmas/rmas.component.html:57,273,280`, `pages/dashboard/dashboard.component.html:10`, `pages/parts/parts.component.html:42,362`, `pages/notifications/notifications.component.html:52,124,181,234`.
- Templates `shared/rma-parts-panel/rma-parts-panel.component.html:10`, `shared/rma-protocols/rma-protocols.component.html:14,146`, `shared/rma-kanban-board/rma-kanban-board.component.html:31` e `shared/rma-block-panel/rma-block-panel.component.html:6`.
- `docs/superpowers/plans/2026-11-09-global-loading.md:14` e seus trechos correlatos que mandam preservar mensagens/roles locais; `frontend/src/app/app.spec.ts:7,43` e os specs abaixo. Esses arquivos só serão editados na implementação futura; nesta solicitação muda somente este plano.

- [ ] Remover os parágrafos/`article` com “Carregando X...” e respectivos status locais. O ramo de carga renderiza **contêiner vazio com `aria-busy="true"`**, sem estado vazio e sem tabela/lista/quadro antigos; evitar o flash de “Nenhuma OS registrada”. Impedimentos mantém apenas o indicador visual local decidido na 0a e o contêiner ocupado, sem texto solto nem `role="status"`.
- [ ] Em retry, manter o rótulo **“Tentar novamente”** e desabilitar o botão durante a requisição, conservando o erro até sucesso onde já previsto. Preservar o placeholder **“Carregando opções...”** do select e os rótulos de submissão; o pop-up global é a fonte de texto/status de carregamento em primeiro plano.
- [ ] Atualizar o plano de loading para esse novo contrato, removendo a exigência antiga de manter a cópia de carga no DOM, e ajustar a fixture/assertiva de `app.spec.ts:43`. Revisar as **~37 ocorrências em 17 specs**, reconferindo o número na execução: `app.spec.ts`; `pages/clients/clients.component.spec.ts`; `pages/products/products.component.spec.ts`; `pages/users/users.component.spec.ts`; `pages/protocols/protocols.component.spec.ts`; `pages/rmas/rmas.component.list.spec.ts`; `pages/dashboard/dashboard.component.states.spec.ts`; `pages/parts/parts.component.load.spec.ts` e `parts.component.history.spec.ts`; `pages/notifications/notifications.component.inbox.spec.ts`, `notifications.component.preferences.spec.ts` e `notifications.component.rules.spec.ts`; `shared/rma-parts-panel/rma-parts-panel.component.load.spec.ts`; `shared/rma-protocols/rma-protocols.component.load.spec.ts`; `shared/rma-block-panel/rma-block-panel.component.spec.ts`; `shared/rma-kanban-board/rma-kanban-board.component.spec.ts`; `shared/loading-overlay/loading-overlay.component.spec.ts`. Ajustar expectativas de texto/retry e manter as do status global; não alterar specs de relatórios.

**Novos:** requisição pendente em carga inicial, troca de filtro e retry não mostra texto solto, estado vazio ou dados antigos; há contêiner ocupado; retry desabilitado mantém rótulo; placeholder do select permanece. Com overlay visível, ele é o único `role="status"`, inclusive com diálogo aberto; impedimentos usa sua exceção sem outro status. Sucesso vazio só mostra o vazio após resposta. **Preservação:** falha/retry, cancelamento e descarte de resposta antiga.

**Comando:** `npm --prefix frontend test -- --watch=false --runner-config 'C:\Users\joseh\AppData\Local\Temp\vitest-runner.config.mjs' --include 'src/app/app.spec.ts' --include 'src/app/pages/clients/*.spec.ts' --include 'src/app/pages/products/*.spec.ts' --include 'src/app/pages/users/*.spec.ts' --include 'src/app/pages/protocols/*.spec.ts' --include 'src/app/pages/rmas/*.spec.ts' --include 'src/app/pages/dashboard/*.spec.ts' --include 'src/app/pages/parts/*.spec.ts' --include 'src/app/pages/notifications/*.spec.ts' --include 'src/app/shared/rma-parts-panel/*.spec.ts' --include 'src/app/shared/rma-protocols/*.spec.ts' --include 'src/app/shared/rma-kanban-board/*.spec.ts' --include 'src/app/shared/rma-block-panel/*.spec.ts' --include 'src/app/shared/loading-overlay/*.spec.ts'`

**Aceite:** páginas abrangidas sem textos soltos de carga nem flash de vazio; um status global e exceção local explícita. **Commit:** `fix(ui): concentrar mensagens de carga no overlay global (NAV-98)`.

### Tarefa 0c — Unificar totais paginados e indicadores de ordens de serviço

**Modificar:** `frontend/src/app/pages/clients/clients.component.html:151`, `frontend/src/app/pages/products/products.component.html:159`, `frontend/src/app/pages/users/users.component.html:139`, `frontend/src/app/pages/rmas/rmas.component.html:27-29,140`, `frontend/src/app/pages/rmas/rmas.component.ts:137-145`, `frontend/src/styles.css`; `frontend/src/app/shared/pagination/pagination.component.ts:11`; `frontend/src/app/pages/clients/clients.component.spec.ts:201`, `frontend/src/app/pages/products/products.component.spec.ts`, `frontend/src/app/pages/users/users.component.spec.ts:144`, `frontend/src/app/pages/rmas/rmas.component.list.spec.ts`. **Criar:** `frontend/src/app/shared/pagination/pagination.component.spec.ts`.

- [ ] Remover `app-result-count` em Clientes, Produtos, Usuários e ordens de serviço onde já há `app-pagination`. A paginação passa a ser o único total no rodapé; Protocolos e Peças mantêm `app-result-count`, pois não têm paginação. Não adicionar esse componente ao Kanban.
- [ ] Antecipar da antiga Tarefa 6 o plural da paginação: inputs `singular`/`plural` com rótulos da entidade (`cliente/clientes`, `produto/produtos`, `usuário/usuários`, `OS/ordens de serviço`); escolher singular apenas para `totalElements === 1`, sem “registro(s)”. Preservar intervalo, página, eventos e demais aplicadores com defaults `registro/registros`.
- [ ] Retirar `<p class="rma-summary">` do painel de filtros e suas regras locais. Criar linha própria de indicadores **logo abaixo de `app-page-header`**, com o mesmo visual de `.kanban-summary`, extraído para a classe global reutilizável `.page-summary` em `styles.css`. Usar “X de Y ordens de serviço” com filtro, “Y ordens de serviço” sem filtro e singular real conforme o total. Ocultar indicadores antes do primeiro sucesso e após falha, sem transformar indisponibilidade em zero; o Kanban reutiliza essa classe na 5.

**Novos:** apenas um total no rodapé das quatro listas paginadas, sem `app-result-count` duplicado; rótulos por entidade e 0/1/2 totais na paginação. `rmas.component.list.spec.ts`: indicadores fora dos filtros, abaixo do cabeçalho, com/sem filtro, singular, ocultos antes do sucesso/depois da falha; ramo de carga sem flash de vazio da 0b. **Preservação:** contagens e paginação corretas; Protocolos e Peças mantêm seus totais.

**Comando:** `npm --prefix frontend test -- --watch=false --runner-config 'C:\Users\joseh\AppData\Local\Temp\vitest-runner.config.mjs' --include 'src/app/shared/pagination/*.spec.ts' --include 'src/app/pages/clients/*.spec.ts' --include 'src/app/pages/products/*.spec.ts' --include 'src/app/pages/users/*.spec.ts' --include 'src/app/pages/rmas/*.spec.ts' --include 'src/app/pages/protocols/*.spec.ts' --include 'src/app/pages/parts/*.spec.ts'`

**Aceite:** total único na paginação, indicadores de ordens de serviço em linha própria e plurais por entidade. **Commit:** `fix(listas): unificar totais e reposicionar indicadores de rmas (NAV-98)`.

### Tarefa 1 — Uma diretiva para foco e pilha modal

**Depende:** carregamento global integrado (0a), limpeza de carga (0b) e totais/indicadores (0c).

**Arquivos novos:** `frontend/src/app/shared/modal-focus/modal-focus.directive.ts`, `frontend/src/app/shared/modal-focus/modal-focus.directive.spec.ts`. **Modificar:** `frontend/src/app/app.ts`, `frontend/src/app/app.spec.ts` para coordenar o retorno com a raiz.

**Interface:** `ModalFocusDirective`, seletor `[appModalFocus]`, `exportAs: 'appModalFocus'`; inputs `modalCloseBlocked: boolean`, `modalInitialFocus: string | null` (seletor dentro do painel), `modalFallbackFocus: HTMLElement | null`; output `modalCloseRequested: void`; métodos `openNative(): void` e `closeNative(): void` apenas para o host `<dialog>`.

- [ ] Registrar overlay na montagem; capturar acionador antes do foco inicial após render. Painel ou título estático recebe `tabindex="-1"`. Somente o topo processa Tab/Shift+Tab, `focusin` externo e Escape em propagação, respeitando `defaultPrevented`, popover aberto e bloqueio de fechamento. Recalcular focáveis visíveis/habilitados a cada Tab: excluir `[tabindex='-1']`, `[inert]`, `[hidden]`, `aria-hidden="true"` e descendentes desses ramos, campos/fieldset disabled e opções de listbox. O título/painel com `tabindex="-1"` é alvo programático, não item do ciclo. As opções do custom-select são `button tabindex="-1"` (`custom-select.component.html:31-34`): não entram no trap. Tab vindo do menu continua tratado pelo select com `stopPropagation` (`custom-select.component.ts:141-142,239-246`); a diretiva não intercepta antes nem reaplica o ciclo ao evento aplicado. Zero focáveis mantém foco no painel.
- [ ] Uma pilha privada no mesmo módulo coordena os participantes. Aplicar `inert` aos ramos de fundo, nunca aos ancestrais do diálogo superior, a `app-loading-overlay`/`.global-loading-dialog` ou aos ancestrais de `#content`; não aplicar `aria-hidden` a esses elementos. Guardar/restaurar valores preexistentes e preservar a posse do `inert` de `#content` pela raiz enquanto a carga global estiver visível. Bloquear rolagem do documento até sair o último modal. Na troca do topo, atualizar os ramos antes de focar. Ao fechar, restaurar fundo e depois acionador conectado/habilitado; senão painel pai ou fallback conectado da página. Não devolver foco a elemento removido ou inerte.
- [ ] Enquanto `LoadingService.visible()` for `true`, ignorar Tab/Escape e não reconduzir `focusin` ao conteúdo inerte; adiar foco inicial/retorno até o overlay sair. Fechamento por sucesso pode desmontar o diálogo durante a carga, mas enfileira a devolução. **Dono único:** a diretiva restaura o foco quando há diálogo ou retorno de diálogo pendente; a raiz só restaura quando não há diálogo nem retorno pendente. Quando o overlay some, restaurar o fundo antes do acionador conectado/habilitado ou fallback, sem dupla restauração e sem focar o status global.
- [ ] No nativo, `openNative()` captura acionador/registra antes de chamar `showModal()`; `close`/destroy desfaz registro. Usar Tab e fundo nativos, sem trap adicional; `cancel` pede fechamento com a mesma guarda. Fechar filho não fecha pai nem libera o fundo do pai.

**Testes novos:** fixture anexada ao `document.body`: overlay global visível com diálogo aberto mantém o status sem `inert`/`aria-hidden` no overlay/ancestrais; Escape ignorado enquanto `visible()`; fechamento por sucesso durante a carga só devolve foco ao acionador depois que o overlay some, com um único dono (e fallback se removido). Select aberto dentro do diálogo: Tab continua sob o controle do select, não escapa do diálogo por interferência do trap e opções não entram no ciclo. Foco inicial; ida/volta circular; campo oculto/desabilitado/fieldset disabled excluído; zero focáveis; foco externo reconduzido; Escape aplicado por popover; Escape durante escrita pendente; dois overlays; nativo sobre overlay; fechamento fora de ordem/destroy; acionador removido com fallback; restauração de `inert` e `overflow` preexistentes. **Preservação:** base global da 0a, requisições rápidas sem bloqueio visível e retorno da raiz sem diálogo, inclusive com alvo removido; os diálogos aplicadores ainda não são migrados nesta tarefa. Comportamento nativo real exige a conferência da 9.

**Comando:** `npm --prefix frontend test -- --watch=false --runner-config 'C:\Users\joseh\AppData\Local\Temp\vitest-runner.config.mjs' --include 'src/app/shared/modal-focus/*.spec.ts' --include 'src/app/shared/form-controls/popover-keyboard.spec.ts' --include 'src/app/app.spec.ts'`

**Aceite:** um único dono da coordenação modal, com teardown completo e sem dependência nova. **Commit:** `fix(acessibilidade): compartilhar foco e pilha dos dialogos (NAV-98)`.

### Tarefa 2 — Migrar os sete diálogos dos cadastros

**Modificar:**
- `frontend/src/app/pages/clients/clients.component.ts`, `frontend/src/app/pages/clients/clients.component.html`, `frontend/src/app/pages/clients/clients.component.spec.ts`, `frontend/src/app/pages/clients/clients.component.pending.spec.ts`.
- `frontend/src/app/pages/products/products.component.ts`, `frontend/src/app/pages/products/products.component.html`, `frontend/src/app/pages/products/products.component.spec.ts`.
- `frontend/src/app/pages/users/users.component.ts`, `frontend/src/app/pages/users/users.component.html`, `frontend/src/app/pages/users/users.component.spec.ts`, `frontend/src/app/pages/users/users.component.pending.spec.ts`.
- `frontend/src/app/pages/protocols/protocols.component.ts`, `frontend/src/app/pages/protocols/protocols.component.html`, `frontend/src/app/pages/protocols/protocols.component.spec.ts`.

- [ ] Importar/aplicar a diretiva conforme inventário; ligar fechamento aos métodos atuais e aos sinais de submissão/exclusão. Manter `alertdialog` e descrições das exclusões; fornecer fallback da página para quando a linha sumir.

**Novos, em cada spec:** abrir pelo acionador real e verificar foco inicial; Escape fecha/retorna, mas é ignorado durante submissão/exclusão pendente; sucesso/exclusão com acionador removido usa fallback e retorno aguarda o overlay global sair. **Preservação:** bloqueio pelo fundo/botão Fechar durante submissão já coberto em `clients.component.pending.spec.ts`, `users.component.pending.spec.ts`, `products.component.spec.ts:557` e `protocols.component.spec.ts:409,436`; erro conserva campos/foco. Cancelar à esquerda, Enter, payloads, estados/paginação, categoria livre, senha, exclusão própria bloqueada, publicação e revelação do item inválido. Não repetir toda a suíte do trap em cada aplicador.

**Comando:** `npm --prefix frontend test -- --watch=false --runner-config 'C:\Users\joseh\AppData\Local\Temp\vitest-runner.config.mjs' --include 'src/app/pages/clients/*.spec.ts' --include 'src/app/pages/products/*.spec.ts' --include 'src/app/pages/users/*.spec.ts' --include 'src/app/pages/protocols/*.spec.ts'`

**Aceite:** sete estruturas migradas, sem alteração de regras. **Commit:** `fix(cadastros): integrar foco dos formularios e exclusoes (NAV-98)`.

### Tarefa 3a — Coordenar os três diálogos de ordens de serviço

**Modificar:** `frontend/src/app/pages/rmas/rmas.component.ts`, `frontend/src/app/pages/rmas/rmas.component.html`, `frontend/src/app/pages/rmas/rmas.component.spec.ts` (helpers `.modal-overlay` em `:222-363`), `frontend/src/app/pages/rmas/rmas.component.detail.spec.ts`, `frontend/src/app/pages/rmas/rmas.component.create.spec.ts`, `frontend/src/app/pages/rmas/rmas.component.diagnosis.spec.ts`.

- [ ] Migrar detalhe, abertura e diagnóstico conforme o inventário; integrar fechamento por botão, fundo e Escape à mesma guarda de escrita. Ajustar os helpers do spec principal sem contar o overlay global como modal.

**Novos:** foco inicial/retorno/fallback nos três, Escape durante pendente e retorno adiado durante o overlay global. Transição detalhe → diagnóstico retorna à página quando o acionador foi desmontado. **Preservação:** impedimento de fechar por fundo/botão durante escrita, dados em falha, abertura com vários itens, compra desconhecida e diagnóstico; não converter o detalhe da lista para o layout do Kanban.

**Comando:** `npm --prefix frontend test -- --watch=false --runner-config 'C:\Users\joseh\AppData\Local\Temp\vitest-runner.config.mjs' --include 'src/app/pages/rmas/*.spec.ts'`

**Aceite:** três estruturas da lista integradas, sem perda de dados nem regressão nos helpers. **Commit:** `fix(rmas): integrar foco de detalhe abertura e diagnostico (NAV-98)`.

### Tarefa 3b — Coordenar Kanban, detalhe, lote e impedimentos

**Depende:** 3a e decisão de impedimentos implementada na 0a, com limpeza na 0b.

**Modificar:**
- `frontend/src/app/pages/kanban/kanban.component.ts`, `frontend/src/app/pages/kanban/kanban.component.html`, `frontend/src/app/pages/kanban/kanban.component.spec.ts`.
- `frontend/src/app/shared/rma-detail-modal/rma-detail-modal.component.ts`, `frontend/src/app/shared/rma-detail-modal/rma-detail-modal.component.html`, `frontend/src/app/shared/rma-detail-modal/rma-detail-modal.component.spec.ts`.
- `frontend/src/app/shared/kanban-bulk-actions/kanban-bulk-actions.component.ts`, `frontend/src/app/shared/kanban-bulk-actions/kanban-bulk-actions.component.html`, `frontend/src/app/shared/kanban-bulk-actions/kanban-bulk-actions.component.spec.ts`.
- `frontend/src/app/shared/rma-block-panel/rma-block-panel.component.ts`, `frontend/src/app/shared/rma-block-panel/rma-block-panel.component.html`, `frontend/src/app/shared/rma-block-panel/rma-block-panel.component.spec.ts`.

- [ ] Migrar as cinco estruturas restantes desse grupo; nomear `kanban-view-title`/`kanban-status-title`. Remover o foco/trap/Escape/retorno locais do detalhe somente ao conectá-lo à diretiva. A contagem de `.modal-overlay` (`rma-detail-modal.component.ts:119`) exclui o carregamento global. Fechar por botão, fundo ou Escape respeita a mesma guarda de escrita.
- [ ] Em impedimentos, delegar `showModal`/`close` ao adaptador nativo da diretiva e retirar o `cancel` duplicado, sem segundo trap. **Preservar a decisão da 0a:** leituras com `SKIP_GLOBAL_LOADING`, indicador local/`aria-busy`, sem texto solto nem status concorrente. Preservar formulário, leitura/retry, conflitos, Cancelar e `updated`; reconferir a camada superior no navegador antes de aceitar.

**Novos:** detalhe → seletor de status → confirmação: Escape do select fecha só o select; o seguinte fecha só a confirmação e retorna ao seletor do detalhe. Select aberto não inclui opções no ciclo de Tab. Detalhe → impedimentos → fechar retorna a Ver impedimentos, mantendo pai/fundo; leitura local não inativa `#content` nem cobre/oculta status global. Escape durante lote pendente não fecha; sucesso durante carga global adia retorno. **Preservação:** foco inicial/retorno simples do detalhe; seletores e atribuição de 9/11, arraste, sucesso parcial, seleção fora dos filtros e bloqueio de fundo/fechar durante escrita; cargas/validações das etapas 4/5.

**Comando:** `npm --prefix frontend test -- --watch=false --runner-config 'C:\Users\joseh\AppData\Local\Temp\vitest-runner.config.mjs' --include 'src/app/pages/kanban/*.spec.ts' --include 'src/app/shared/rma-detail-modal/*.spec.ts' --include 'src/app/shared/kanban-bulk-actions/*.spec.ts' --include 'src/app/shared/rma-block-panel/*.spec.ts' --include 'src/app/shared/form-controls/popover-keyboard.spec.ts'`

**Aceite:** oito estruturas cobertas por 3a+3b; somente o topo reage, sem fechamento duplo, status global inerte ou perda de dados. **Commit:** `fix(kanban): coordenar foco de detalhe lote e impedimentos (NAV-98)`.

### Tarefa 4 — Migrar peças e editor de regra

**Modificar:** `frontend/src/app/pages/parts/parts.component.ts`, `frontend/src/app/pages/parts/parts.component.html`, `frontend/src/app/pages/parts/parts.component.form.spec.ts`, `frontend/src/app/pages/parts/parts.component.movement.spec.ts`, `frontend/src/app/pages/parts/parts.component.history.spec.ts`; `frontend/src/app/pages/notifications/notifications.component.ts`, `frontend/src/app/pages/notifications/notifications.component.html`, `frontend/src/app/pages/notifications/notifications.component.rules.spec.ts`.

- [ ] Aplicar a diretiva às quatro estruturas; IDs `part-form-title`, `part-movement-title`, `part-history-title` e `rule-form-title` (já existente). Estorno continua inline dentro do histórico, sem criar um vigésimo diálogo.

**Novos:** abertura/foco/Escape/retorno/fallback nos quatro; Escape durante `submitting`/`ruleSubmitting` não fecha e retorno após sucesso aguarda o overlay global. **Preservação de escrita:** bloqueio de fechar por fundo/botão durante submissão; falha mantém motivo/dados. Iniciar e cancelar estorno mantém histórico e foco no seu contexto, sem desmontar modal. **Preservação:** ações de negócio textuais, saldos/unidades/custos, motivo do estorno, cargas independentes, seis campos da regra e envio único.

**Comando:** `npm --prefix frontend test -- --watch=false --runner-config 'C:\Users\joseh\AppData\Local\Temp\vitest-runner.config.mjs' --include 'src/app/pages/parts/*.spec.ts' --include 'src/app/pages/notifications/*.spec.ts'`

**Aceite:** inventário inteiro coberto: 18 overlays com coordenação e 1 nativo integrado. **Commit:** `fix(operacoes): integrar foco de pecas e regras (NAV-98)`.

### Tarefa 5 — Fechar estado, contagem e filtros do Kanban

**Modificar:** `frontend/src/app/pages/kanban/kanban.component.ts`, `frontend/src/app/pages/kanban/kanban.component.html`, `frontend/src/app/pages/kanban/kanban.component.css`, `frontend/src/app/pages/kanban/kanban.component.spec.ts`. **Criar:** `frontend/src/app/pages/kanban/kanban.component.states.spec.ts`.

- [ ] Na mudança dos filtros, comparar os onze valores com `fromPersistedFilters(activeView.filters)`; ao divergir, limpar `activeViewId`, sem gravar/excluir a visualização. `applyView` continua selecionando o ID depois de aplicar os filtros; sincronização de resposta de salvar/renomear não pode desmarcá-lo indevidamente.
- [ ] Reutilizar `app-page-header` com título “Kanban de ordens de serviço”; remover `.kanban-heading__count` (`HTML:4`) e colocar o total como **primeiro item de `heroStats`/`.kanban-summary`**, usando a classe global `.page-summary` compartilhada com ordens de serviço na 0c. Mostrar “X de Y ordens de serviço” com filtro e “Y ordens de serviço” sem filtro, com singular real; ocultar antes do primeiro sucesso e após falha. **Sem `app-result-count` ou total no rodapé do Kanban.** Criar estado de leitura próprio (`hasLoaded`, `loadFailed`, `loadErrorMessage`, `retryLoad`), separado de erro de ação. Cancelar leitura anterior e no destroy; falha não apresenta zeros, indicadores, vazio ou cards antigos. Retry guarda falha até sucesso, com botão desabilitado e rótulo fixo “Tentar novamente”; ramo de carga vazio com `aria-busy="true"`, sem texto solto, conforme 0b; vazio real “Nenhuma OS cadastrada”, filtro vazio “Nenhuma OS encontrada” com Limpar filtros. Sem CTA de criação novo.

**Novos:** substituir deliberadamente `keeps the active view selected when a chip is removed` por expectativa `activeViewId() === null`; cobrir edição manual, reaplicar/salvar/renomear e foco no próximo chip/botão Filtros. `Subject` pendente, erro de cada fonte, retry, sucesso vazio, filtro sem resultado e resposta antiga descartada; primeiro indicador com contagem ausente antes de sucesso/depois de falha, “1 OS” sem filtro e “X de Y ordens de serviço” com filtro, com singular real; ausência de `.kanban-heading__count` e `app-result-count`. **Preservação:** filtros, nove etapas, arraste, lote, visualização padrão, seletores e foco de remoção já existentes.

**Comando:** `npm --prefix frontend test -- --watch=false --runner-config 'C:\Users\joseh\AppData\Local\Temp\vitest-runner.config.mjs' --include 'src/app/pages/kanban/*.spec.ts' --include 'src/app/shared/rma-kanban-board/*.spec.ts' --include 'src/app/shared/result-count/*.spec.ts' --include 'src/app/shared/page-header/*.spec.ts'`

**Aceite:** visualização marcada corresponde aos filtros; leitura não se confunde com falha de ação; total ocupa o primeiro indicador, com singular/filtro/carga/falha conforme o pedido revisado. **Commit:** `fix(kanban): alinhar filtros contagem e estados de leitura (NAV-98)`.

### Tarefa 6a — Uniformizar alvos, tokens, cores e espaçamento

**Modificar:** `frontend/src/styles.css`; `frontend/src/app/pages/login/login.component.css`, `frontend/src/app/pages/kanban/kanban.component.css`, `frontend/src/app/pages/rmas/rmas.component.ts`, `frontend/src/app/pages/users/users.component.ts`, `frontend/src/app/pages/dashboard/dashboard.component.ts`, `frontend/src/app/pages/notifications/notifications.component.ts`; `frontend/src/app/shared/form-controls/custom-select/custom-select.component.css`, `frontend/src/app/shared/rma-kanban-board/rma-kanban-board.component.css`, `frontend/src/app/shared/rma-detail-modal/rma-detail-modal.component.css`, `frontend/src/app/shared/rma-sla-badge/rma-sla-badge.component.css`, `frontend/src/app/shared/rma-block-panel/rma-block-panel.component.ts`.

- [ ] Corrigir os desvios de alvos/tokens/cores/espaçamento inventariados. Alvos interativos compactos passam a **pelo menos 40×40 px**; preservar chips/avatares informativos e tons dos botões de 9/11. O calendário é tratado separadamente na 6b.
- [ ] Centralizar os nove tons de status já existentes em tokens no `:root`, aplicados por `[data-status]` e colunas. Reusar classes `.tone-*` no dashboard, tokens de superfície/alerta/SLA e backdrop único; preservar em tokens `#e3eaf3`, `#c3d1e0`, `#4a5d72` dos cards. Nos blocos tocados, usar escala 4/8/12/16/24/32; não arredondar medidas estruturais de largura ou redesenhar o login. Preservar marca até a decisão da logo.

**Novos manuais:** alvos reais sem sobreposição, contraste de texto ≥4,5:1, hover/foco/desabilitado e indicadores/totais conforme 0c/5 em 1440/320 px e 200%. **Preservação:** suítes das dez páginas e compartilhados. Sem snapshots de CSS, testes que copiem declarações ou promessa de medir layout por DOM simulado.

**Comando:** `npm --prefix frontend test -- --watch=false --runner-config 'C:\Users\joseh\AppData\Local\Temp\vitest-runner.config.mjs' --include 'src/app/pages/login/*.spec.ts' --include 'src/app/pages/kanban/*.spec.ts' --include 'src/app/pages/rmas/*.spec.ts' --include 'src/app/pages/clients/*.spec.ts' --include 'src/app/pages/products/*.spec.ts' --include 'src/app/pages/users/*.spec.ts' --include 'src/app/pages/protocols/*.spec.ts' --include 'src/app/pages/parts/*.spec.ts' --include 'src/app/pages/dashboard/*.spec.ts' --include 'src/app/pages/notifications/*.spec.ts' --include 'src/app/shared/**/*.spec.ts'`

**Aceite:** alvos/tokens/espaçamento conferidos nas dez telas, sem tom arbitrário novo e com exceções intencionais de acesso/indicadores documentadas. **Commit:** `style(ui): uniformizar alvos cores e espacamentos (NAV-98)`.

### Tarefa 6b — Posicionar o calendário e ampliar seus alvos

**Modificar:** `frontend/src/app/shared/form-controls/date-picker/date-picker.component.css`, `frontend/src/app/shared/form-controls/date-picker/date-picker.component.ts`, `frontend/src/app/shared/form-controls/date-picker/date-picker.component.html`, `frontend/src/app/shared/form-controls/date-picker/date-picker.component.spec.ts`.

- [ ] Usar sete colunas de 40 px, padding de 8 px, largura de 298 px limitada a `calc(100vw - 16px)`. Seguir o posicionamento do select: `placeCalendar(): void` atualiza signal `calendarPosition` com top/left/width/maxHeight/above, vinculado ao painel; limitar às margens de 8 px e abrir acima quando faltar espaço abaixo.
- [ ] Fechar no resize/scroll externo; não restringir à largura do campo nem mover o DOM para fora do diálogo. Preservar integração com teclado, popover e trap da Tarefa 1.

**Novos:** retângulos simulados em viewport de 320 px, campo estreito junto à borda direita e falta de espaço abaixo; coordenadas dentro das margens, abertura acima e fechamento no scroll externo/resize. **Preservação:** datas, min/max, seleção e Escape. **Manual:** geometria e alvos de 40 px em 320 px/200%, inclusive dentro de diálogo, sem corte nem sobreposição.

**Comando:** `npm --prefix frontend test -- --watch=false --runner-config 'C:\Users\joseh\AppData\Local\Temp\vitest-runner.config.mjs' --include 'src/app/shared/form-controls/date-picker/*.spec.ts' --include 'src/app/shared/form-controls/popover-keyboard.spec.ts' --include 'src/app/shared/modal-focus/*.spec.ts'`

**Aceite:** calendário posicionado dentro das margens com alvos de 40 px, sem escapar do contexto do diálogo. **Commit:** `fix(calendario): posicionar painel e ampliar alvos de toque (NAV-98)`.

### Tarefa 6c — Alinhar abas e plurais de lote

**Modificar:** `frontend/src/app/pages/rmas/rmas.component.ts`, `frontend/src/app/pages/rmas/rmas.component.html`, `frontend/src/app/pages/rmas/rmas.component.detail.spec.ts`; `frontend/src/app/shared/kanban-bulk-actions/kanban-bulk-actions.component.html`, `frontend/src/app/shared/kanban-bulk-actions/kanban-bulk-actions.component.ts`, `frontend/src/app/shared/kanban-bulk-actions/kanban-bulk-actions.component.spec.ts`.

- [ ] No detalhe de ordens de serviço, igualar o contrato de abas de notificações: setas circulares, Home/End, foco/seleção e somente aba ativa no Tab.
- [ ] Trocar plurais de lote por OS/ordens de serviço, selecionado/selecionados e atualizado/atualizados, sem mudar contagens. **A paginação e seus inputs por entidade já foram antecipados para a 0c**; não reintroduzir “registro(s)” ou duplicar totais.

**Novos:** `rmas.component.detail.spec.ts`: teclado/roving/painel; `kanban-bulk-actions.component.spec.ts`: 1/2 selecionados e 0/1/2 sucessos. **Preservação:** seleção, resultado parcial, payloads e contagens, além dos totais por entidade da 0c.

**Comando:** `npm --prefix frontend test -- --watch=false --runner-config 'C:\Users\joseh\AppData\Local\Temp\vitest-runner.config.mjs' --include 'src/app/pages/rmas/*.spec.ts' --include 'src/app/shared/kanban-bulk-actions/*.spec.ts' --include 'src/app/shared/pagination/*.spec.ts'`

**Aceite:** abas acessíveis pelo mesmo contrato existente e plurais reais no lote. **Commit:** `fix(ui): alinhar teclado das abas e plurais de lote (NAV-98)`.

### Tarefa 7 — Encerrar N3 e N4

**Depende:** carregamento global da 0a integrado; não executar esta tarefa antes dele. **Escopo de N4:** somente texto do resumo/editor; não alterar destinatários, canais, envio nem falhas de entrega. E-mails continuam fora de escopo.

**Modificar:** `frontend/src/app/core/services/notification.service.ts`, `frontend/src/app/core/services/notification.service.spec.ts`; `frontend/src/app/layout/app-shell.component.ts`, `frontend/src/app/layout/app-shell.component.html`, `frontend/src/app/layout/app-shell.component.spec.ts`; `frontend/src/app/pages/notifications/notifications.component.ts`, `frontend/src/app/pages/notifications/notifications.component.html`, `frontend/src/app/pages/notifications/notifications.component.spec.ts`, `frontend/src/app/pages/notifications/notifications.component.inbox.spec.ts`, `frontend/src/app/pages/notifications/notifications.component.preferences.spec.ts`, `frontend/src/app/pages/notifications/notifications.component.rules.spec.ts`.

- [ ] Serviço expõe signals readonly `summaryLoaded` e `summaryLoadFailed`; conservar `unreadCount` e assinatura `refreshSummary(): Observable<number>`. Só a requisição iniciada mais recentemente altera resumo/estado. Antes do primeiro sucesso, sino/aba sem número; na falha, esconder número antigo e informar “Contagem de não lidas indisponível”. Durante atualização após sucesso, manter último número até resposta; recuperação restaura ambos os aplicadores. Não usar a lista de até 100 como total nem `inboxHasLoaded` como prova da carga do resumo. Preservar `SKIP_GLOBAL_LOADING` em `refreshSummary` (já existente), polling de 60 s e catchError compatível; resumo/poll não abrem o pop-up global.
- [ ] Regra com `recipientRoles.length === 0 && !notifyAssignee`: manter “Nenhum destinatário” e acrescentar “Esta regra não entrega notificações a ninguém.” no resumo/editor. Sem validação nova; regra desativada continua identificada como tal.

**Novos:** serviço com `HttpTestingController`: primeira falha, sucesso → falha → recuperação, resposta fora de ordem; sino/aba sem zero inventado nem número antigo, rótulo acessível e número atualizado juntos. Regras com/sem responsável e perfis: aviso só sem destinatário; salvar segue permitido, sem alterar destinatários/canais/envio/falhas de entrega. Testar que `refreshSummary` mantém o contexto `SKIP_GLOBAL_LOADING` e não ativa o overlay global. **Preservação:** endpoints, retorno numérico do serviço, marcação/adiamento, seis campos da regra e perfis. Atualizar mocks nos quatro specs da página para os dois signals.

**Comando:** `npm --prefix frontend test -- --watch=false --runner-config 'C:\Users\joseh\AppData\Local\Temp\vitest-runner.config.mjs' --include 'src/app/core/services/notification.service.spec.ts' --include 'src/app/layout/*.spec.ts' --include 'src/app/pages/notifications/*.spec.ts'`

**Aceite:** ausência de resumo não significa zero; N4 explica consequência sem bloquear regra. **Commit:** `fix(notificacoes): explicitar resumo indisponivel e regra sem destinatarios (NAV-98)`.

### Tarefa 8a — Carregar rotas sob demanda

**Modificar:** `frontend/src/app/app.routes.ts`. **Criar:** `frontend/src/app/app.routes.spec.ts`. Primeiro dos **dois commits separados** da antiga Tarefa 8; a consolidação de CSS fica na 8b.

**Decisão:** vale reduzir agora, com intervenção limitada. **626 kB contra 510 kB** significa excedente de 116 kB (~23%); é a referência recebida, não uma medição feita nesta elaboração. `frontend/angular.json` confirma warning inicial 510 kB/error 1 MB e CSS por componente 4/8 kB; manter esses valores em 8a/8b.

- [ ] Antes/depois de 8a, executar `npm --prefix frontend run build -- --stats-json` e registrar bundle inicial bruto, maior chunk e CSS compilado de ordens de serviço/detalhe como base para 8b. Não comparar bytes do fonte com orçamento do build nem tamanho transferido com tamanho bruto.
- [ ] `app.routes.ts:5-11` importa antecipadamente dashboard, Kanban, ordens de serviço, clientes, produtos e usuários. Converter essas seis rotas para `loadComponent`, removendo imports estáticos; manter login/shell, guards, `data.roles`, títulos, redirects e query params. Notificações/peças/protocolos já são lazy. Rota de relatórios permanece intocada.

**Novos:** `app.routes.spec.ts` verifica as seis resoluções lazy e preservação de guards/roles/títulos/redirects, sem import estático das páginas na fixture; abertura direta `/rmas?rma=<id>` conferida no navegador. **Preservação:** suítes das seis páginas.

**Comando:** `npm --prefix frontend test -- --watch=false --runner-config 'C:\Users\joseh\AppData\Local\Temp\vitest-runner.config.mjs' --include 'src/app/app.routes.spec.ts' --include 'src/app/pages/dashboard/*.spec.ts' --include 'src/app/pages/kanban/*.spec.ts' --include 'src/app/pages/rmas/*.spec.ts' --include 'src/app/pages/clients/*.spec.ts' --include 'src/app/pages/products/*.spec.ts' --include 'src/app/pages/users/*.spec.ts'`

**Aceite:** build com código 0 e bundle inicial menor; buscar ≤510 kB sem elevar limites, registrar valor/excedente real e manter dívida explícita se persistir warning. **Commit:** `perf(frontend): carregar paginas sob demanda (NAV-98)`.

### Tarefa 8b — Consolidar CSS dos detalhes

**Depende:** 8a e sua medição registrada. Segundo commit da antiga Tarefa 8.

**Modificar:** `frontend/src/app/pages/rmas/rmas.component.ts`, `frontend/src/app/pages/rmas/rmas.component.html`, `frontend/src/app/shared/rma-detail-modal/rma-detail-modal.component.css`, `frontend/src/styles.css`.

- [ ] Reaproveitar `.detail-surface`, `.detail-card` e `.detail-facts` já existentes no CSS global quando a regra for comum aos dois detalhes. Em ordens de serviço há sobrescrita de `.rma-items-editor` e regras de cards/pares paralelas; consolidar as aplicáveis ao markup final. No detalhe do Kanban remover overrides redundantes após o reaproveitamento.
- [ ] Não apenas mover todo CSS para o global, fragmentar componentes por limite, minificar manualmente, apagar estilos responsivos ou converter o detalhe da lista para o layout do Kanban.
- [ ] Repetir `npm --prefix frontend run build -- --stats-json`; comparar CSS compilado de ordens de serviço/detalhe, bundle inicial bruto e maior chunk com antes/depois de 8a. Preservar os limites 510 kB/1 MB e 4/8 kB.

**Preservação:** suítes de ordens de serviço e detalhe; geometria e CSS pela conferência visual da 9, sem teste duplicando declarações.

**Comando:** `npm --prefix frontend test -- --watch=false --runner-config 'C:\Users\joseh\AppData\Local\Temp\vitest-runner.config.mjs' --include 'src/app/pages/rmas/*.spec.ts' --include 'src/app/shared/rma-detail-modal/*.spec.ts'`

**Aceite:** build com código 0, CSS dos dois componentes não cresce e redução de 8a é preservada; buscar ≤4 kB por componente e registrar valores reais. Se a redução limitada de 8a/8b não atingir os warnings, manter a dívida com tamanho/excedente e proposta posterior; não declarar orçamento resolvido nem ampliar limites. **Commit:** `perf(frontend): consolidar css compartilhado dos detalhes (NAV-98)`.

### Tarefa 9 — Conferência autenticada e fechamento documental

**Modificar na execução futura:** `docs/ux/2026-11-07-roteiro-conferencia-manual.md`. **Incluir no commit documental:** os arquivos de `docs/ux/` discriminados abaixo, inclusive este plano, preservando conteúdo histórico.

- [ ] Rodar a regressão inteira no frontend: `npm --prefix frontend test -- --watch=false --runner-config 'C:\Users\joseh\AppData\Local\Temp\vitest-runner.config.mjs'`; depois `npm --prefix frontend run build -- --stats-json`. **Backend:** nenhum teste a escrever/comando obrigatório, pois seus arquivos/contratos não mudam. Relatórios não recebem testes novos nem revisão; a suíte global apenas conserva a regressão existente.
- [ ] Atualizar o roteiro, preservando etapas 1–3 e corrigindo o que ficou obsoleto: total no título, aviso antigo de 604 kB, F1 e chip não podem continuar descritos como estado atual se resolvidos. Acrescentar passos reproduzíveis de **etapa 4** (lista/histórico, abertura com vários produtos/compra desconhecida, diagnóstico e dois detalhes), **5** (estoque/reposição, movimento, original+estorno, reservas, impedimentos, versão/execução), **6** (dashboard, caixa/preferências/regras/falhas; relatórios explicitamente adiados) e **7** (carregamento global e exceção local de impedimentos, ausência de textos soltos/flash de vazio, totais/indicadores revisados, os 19 diálogos, teclado, pilha, fundo, retorno, N3/N4 e recuperação de falhas). N4 altera somente o texto do resumo/editor; destinatários, canais, envio e falhas de entrega não recebem mudanças.
- [ ] Acrescentar bloco **“Ajustes visuais de 9/11 — preservação”**: títulos destacados; **paginação como único total no rodapé** de Clientes/Produtos/Usuários/ordens de serviço, com rótulos por entidade; `app-result-count` preservado só onde não há paginação (Protocolos/Peças); total do Kanban como primeiro indicador de `heroStats`/`.kanban-summary`, sem contagem no título ou `app-result-count`; ordens de serviço com linha de indicadores logo abaixo de `app-page-header`, fora dos filtros, no mesmo visual global; singular/filtro e ocultação antes do primeiro sucesso/após falha; botões preenchidos por tom e estados; cards do Kanban com contraste/cliente/prioridade/avatar/exceções de SLA e sem falha/SLA saudável; detalhe com seletores de status e responsável, responsável atual inelegível identificado, seleção igual sem envio, falha local e confirmação de status. Não converter o detalhe da lista para o layout do Kanban.
- [ ] Executar no navegador com backend disponível e login do próprio usuário: 1440/320 px, 200%, Tab/Shift+Tab/Escape/Enter; abrir cada estrutura da tabela. Testar filho sobre pai, popover antes do modal e select aberto com Tab sem incluir opções no ciclo; salvar pendente preserva bloqueio de fundo/Fechar e ignora Escape; falha e sucesso com acionador removido usam fallback. Com diálogo aberto e overlay global visível, status acessível sem `inert`/`aria-hidden`, Escape ignorado e fechamento por sucesso devolve foco só depois que o overlay sai, com dono único. Conferir leituras/retry de impedimentos na camada superior com `SKIP_GLOBAL_LOADING` e indicador local, sem status concorrente; carga sem texto solto/flash de vazio, retry com rótulo fixo, totais/indicadores revisados, calendário de 40 px e alvos sem sobreposição. O overlay global não conta entre os 19 diálogos. Perfis ADMIN/SERVICE_DESK/TECHNICIAN/VIEWER conforme acesso já existente. Registrar resultado/data/perfil por cenário; sem acesso, marcar **pendente**, nunca aprovado por Vitest.
- [ ] **Decisão sobre documentos:** versionar `docs/ux/` como registro compartilhado da NAV-98. Arquivos exatos: `docs/ux/2026-11-06-estudo-ui-ux.md`, `docs/ux/2026-11-07-etapa-1-fundacao-visual.md`, `docs/ux/2026-11-07-galeria-telas.md`, `docs/ux/2026-11-07-plano-etapa-2-kanban.md`, `docs/ux/2026-11-07-plano-etapa-3-cadastros.md`, `docs/ux/2026-11-07-plano-etapa-4-ciclo-rma.md`, `docs/ux/2026-11-07-plano-etapa-5-operacoes.md`, `docs/ux/2026-11-07-plano-fase-1-fundacao.md`, `docs/ux/2026-11-07-roteiro-conferencia-manual.md`, `docs/ux/2026-11-08-plano-etapa-6-comunicacao-analise.md`, `docs/ux/2026-11-08-revisao-plano-etapa-5.md`, `docs/ux/2026-11-09-plano-etapa-7-conferencia-global.md`, `docs/ux/visuals/navitas-componentes.html`, `docs/ux/visuals/navitas-operacao.html`, `docs/ux/visuals/navitas-projeto-completo.html`. Incluir somente versões revisadas, sem alterar os planos históricos para fingir que são o código atual. Conferir links; capturas em `output/` são evidência local e links ausentes devem ser identificados como tal no roteiro.
- [ ] **Decisão sobre `.claude/launch.json`: não commitar.** O arquivo contém apenas lançamento local do frontend na porta 4300; `frontend/package.json` já oferece o comando. Não apagar o arquivo, alterar `.gitignore`, nem incluir `.claude/`, `.playwright-cli/`, `output/`, stats ou artefatos de build no commit. Esta decisão é documental, não autorização para executar Git agora.

**Testes novos:** nenhum teste automatizado para documentação; conferência manual nova de foco/alvos/estados acima. **Preservação:** suíte completa e ajustes de 9/11. **Aceite:** comandos/resultados/orçamentos reais registrados; dez telas e 19 diálogos com resultado ou pendência explícita; F1 só encerrado após navegador, incluindo overlay/impedimentos/retorno; relatórios excluídos da aprovação e logo registrada como bloqueada pela decisão do usuário. **Commit:** `docs(ux): registrar conferencia global e criterios de fechamento (NAV-98)`.

## Aceite da etapa

1. Carregamento global integrado antes da Tarefa 1; sem textos soltos, vazio prematuro ou status concorrente nas telas abrangidas. Impedimentos usa a exceção local definida no plano. Foco compartilhado nas 19 estruturas, sem contar o overlay global; filho/popover não fecha pai, select respeita seu Tab, fundo inacessível e retorno único adiado até o fim do overlay, confirmados em navegador.
2. Desvios inventariados tratados ou exceções justificadas: paginação como único total no rodapé onde existe, totais de Protocolos/Peças mantidos, Kanban com primeiro indicador e ordens de serviço com linha sob o cabeçalho. Preservados os demais ajustes visuais de 9/11 e contratos anteriores; logo permanece bloqueada pela decisão do usuário, sem impedir as demais tarefas.
3. Chip/visualização, N3 e N4 resolvidos; `SKIP_GLOBAL_LOADING` preservado no resumo/poll e N4 limitado ao texto, sem alterar destinatários, canais, envio ou falhas de entrega. N1/N2/D1–D4/R1–R2 continuam registrados com o recorte acima.
4. Testes/build executados na implementação, orçamentos reais comparados sem elevar limites, roteiro atualizado e um commit previsto por tarefa/subtarefa, incluindo os dois commits de 8a/8b. Esta elaboração não executou testes, build, Git ou conferência autenticada.
