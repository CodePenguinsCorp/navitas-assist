# Etapa 6 — Comunicação e análise: plano de implementação

> **Para quem executa:** use superpowers:executing-plans ou superpowers:subagent-driven-development e siga as tarefas na ordem. Os passos usam caixas (`- [ ]`). **A implementação e um commit por tarefa ou subtarefa estão autorizados**, dentro das restrições globais abaixo.

**Objetivo:** alinhar o dashboard, a central de notificações (caixa de entrada, preferências, regras administrativas e falhas de processamento) e os quatro relatórios (laudo técnico, tempo por etapa, garantia por produto, devoluções) à base das etapas 1 a 5. Cada número precisa dizer o que conta e sobre qual conjunto. Carga, falha e vazio ficam distintos. As ações de notificação passam a ter destaque proporcional. Os relatórios mostram o período e os filtros aplicados e o instante de geração. Contratos, regras e permissões continuam como estão.

**Exceção comportamental declarada:** na edição de regras administrativas (Tarefa 4b), as várias gravações imediatas de hoje, uma por checkbox ou select, passam a ser **um único envio confirmado** por “Salvar regra”. O payload e o endpoint continuam os mesmos.

**Arquitetura:** só mudanças locais nos três componentes de página. Reutilizar:

- `app-page-header` (`shared/page-header/page-header.component.ts:22-41`) e `button[appRowAction]` (`shared/row-action/row-action.component.ts:28-60`).
- `fieldset.form-section` (`styles.css:1041-1070`), `.form-actions` (`styles.css:1072-1085`), `.meta-list` (`styles.css:1586-1620`), `.link-button` (`styles.css:1626-1650`), `.table-wrap`, `.alert-banner` e `.empty-state`.
- Os tokens `--control-height`, `--control-height-sm`, `--space-*` e `--radius-*` (`styles.css:35-47`).

Os estados seguem `loadFailed`/`hasLoaded`/`retryLoad` e o descarte de respostas antigas de `pages/parts/parts.component.ts:105-107,175-177,383-405`, com `takeUntilDestroyed(this.destroyRef)` como em `:389`. As mensagens por campo usam `aria-describedby`/`aria-invalid`, como em `shared/rma-block-panel/rma-block-panel.component.html:19-22`. Os seletores compartilhados já aceitam `ariaDescribedBy` e `ariaInvalid` (`date-picker.component.ts:47-49`, `custom-select.component.ts:42-44`). Nenhum serviço, modelo, rota, CSS global ou backend muda.

**Tech stack:** Angular 21 (standalone, signals, reactive forms, `@if/@for`), RxJS, Vitest pelo runner do Angular, CSS com os tokens atuais.

**Spec:** `docs/ux/2026-11-06-estudo-ui-ux.md`, nas seções:

- “Dashboard” (`:125-127`), “Notificações: entrada, preferências e regras” (`:175-179`) e “Relatórios: quatro composições” (`:181-188`).
- “Decisões que valem para qualquer tela” (`:103-111`) e “Perfis e estados transversais” (`:196-207`).
- “Contrato dos componentes” (`:302-317`, inclusive teclado nas abas, `:312`) e “Escrita” (`:321-335`).

Também `docs/ux/2026-11-07-etapa-1-fundacao-visual.md` e `docs/ux/2026-11-07-roteiro-conferencia-manual.md`. O modelo de formato são os planos das etapas 3, 4 e 5, com as correções de `docs/ux/2026-11-08-revisao-plano-etapa-5.md`. Isso significa: plano que autoriza a execução, momentos de recarga explícitos, gatilho definido para cada falha, nenhum teste “novo” que já passa hoje e nenhum escopo ou cálculo inventado. Esta versão incorpora a revisão do próprio plano (itens 1–13 e destino das 14 decisões).

**Base inspecionada:** `main` em `ec2f939`, 8 de novembro de 2026. A árvore tem diretórios não rastreados (`.claude/`, `.playwright-cli/`, `docs/ux/`, `output/`). Eles não pertencem a esta etapa e não entram em nenhum commit. Reconfirmar as âncoras de linha antes de cada tarefa.

**Ordem e dependências:**

- 1a → 1b (dashboard).
- 2a → 2b → 3 → 4a → 4b → 5 (mesmos arquivos de notificações).
- 6 → 7 → 8 → 9 (mesmos arquivos de relatórios).
- 10 (conferência final, sem commit).

Os três grupos podem ser executados em qualquer ordem entre si. Dentro de um grupo, a ordem é obrigatória. Há um commit por tarefa ou subtarefa implementável.

## Global Constraints

- **Escrita na execução:** somente os **Files** de cada tarefa. Não alterar outros documentos, o estado das etapas nem este plano. Testes e build devem ser executados de fato e relatados com a saída real.
- **Decisões do usuário:**
  - Paleta atual e controles de 40 px (`styles.css:35`), com a exceção de 34 px para ações pequenas (`:36`). Cancelar fica à esquerda.
  - Indicadores avaliados por tela: contexto e escopo explícitos, sem tendências, percentuais ou metas **sem dados**. Um percentual existente, com dados e fórmula definidos, permanece quando seu escopo é explicado.
  - Nenhuma funcionalidade nova. A exportação continua indisponível, então não desenhar botão de exportar. O texto final dos relatórios continua `Consulta em tela.` (`reports.component.html:142`, spec `:167-175`).
  - Não criar tokens, cores, ícones nem bibliotecas. Estilos locais novos usam tokens.
  - Não fazer limpeza global de CSS. `.stat-card`, `.stats-grid` e `.meter` continuam em `styles.css`: specs de outras telas citam os dois primeiros, e `parts.component.html:101` usa `.meter`.
- **API e contratos:**
  - Manter sem alteração `RmaService`, `CatalogService`, `NotificationService`, `ReportService`, `core/models.ts`, `core/utils/notification-ui.ts`, `core/utils/date.ts`, `app.routes.ts` e o backend.
  - Reutilizar `rma-detail.ts` (`warrantyTermLabel`, que devolve texto; `warrantyExpiryLabel` e `purchaseFact`, que devolvem `RmaFact` e são usados por `.value`) e `rma-ui.ts` (`compareRmasForQueue`), sem modificar esses arquivos.
  - Os indicadores do dashboard e as agregações de tempo por etapa continuam calculados como hoje, no cliente, sobre as mesmas respostas. Não criar cálculo que deveria vir do servidor.
- **Regras a preservar:**
  - *Relatórios:* período padrão de 90 dias e máximo de 366 (`reports.component.ts:15-16`, `RmaReportService.java:27-28`). A validação local continua (`:83-90`), assim como os parâmetros HTTP (`report.service.ts:10-17`). A consulta anterior é cancelada (`:79`). A falha não mostra dados antigos (`:80`). O seletor de clientes falha de forma independente (`:69-76`).
  - *Tempo por etapa:* média e máximo por etapa sobre `sla.elapsedSeconds`, excluindo `sla.status === 'CLOSED'` (`:54-62`), com a mesma formatação de duração (`:104-108`). Não confundir com a duração histórica de todas as etapas.
  - *Garantia:* o cálculo vem do servidor (`ItemWarranty.java:7-17`). Compra desconhecida ou ausente mantém `PENDING` e vencimento nulo.
  - *Devoluções:* recorte `status === 'RETURNED'` (`:55`). O período filtra `entryDate`, não a expedição (`RmaRecordRepository.java:46-53`).
  - *Notificações:* `list({ unreadOnly, includeSnoozed })` (`notification.service.ts:22-32`), `markRead`, `markAllRead`, `snooze(id, minutes)` com as opções 60/240/1440 (`notification-ui.ts:26-30`) e `refreshSummary` (`:34-40`). `internalRoute` continua recusando URL externa (`notification-ui.ts:57-65`). Ficam iguais `updatePreference(eventType, muted)` e os seis campos de `NotificationRuleRequest` (`notifications.component.ts:263-270`, `NotificationRuleRequest.java:8-15`). Adiar continua disponível para qualquer notificação, inclusive de alertas obrigatórios (`NotificationService.java:77-80`).
- **Permissões atuais:**
  - O dashboard é aberto a todos, e só ADMIN pede `getUserSummary` (`dashboard.component.ts:188-190`, `SecurityConfig.java:83`).
  - Todos os perfis veem notificações e preferências, inclusive VIEWER (`SecurityConfig.java:81`; estudo `:205`).
  - A aba Regras, a edição de regras e as falhas são só de ADMIN (`notifications.component.ts:190,205`; `SecurityConfig.java:82`).
  - Relatórios ficam com ADMIN, TECHNICIAN e VIEWER pela rota (`app.routes.ts:95-103`) e pelo servidor (`SecurityConfig.java:84`).
  - Os testes de perfil usam `hasAnyRole: (roles) => roles.includes(role)`, nunca um mock que sempre devolve `true`.
- **Fuso e formato:** datas civis com `formatDateOnly` e instantes em America/Sao_Paulo (`formatBusinessDateTime`, `formatNotificationDateTime` e `formatInstant` dos relatórios). Os testes usam instantes UTC de conversão conhecida (`…T16:00:00Z` → `13:00`). Rótulos de status vêm de `RMA_STATUS_LABELS` (por exemplo `IN_DIAGNOSIS` → `Diagnóstico`, `core/mock-data.ts:38`).
- **Abas:** as abas de notificações (2b) e de relatórios (6) seguem o contrato de teclado do estudo (`:312`). Setas esquerda e direita movem o foco e a seleção entre abas, com volta circular. Home e End vão para a primeira e a última. Só a aba ativa tem `tabindex="0"`; as outras têm `tabindex="-1"`. Cada aba tem `id` e `aria-controls`, e o painel ativo tem `role="tabpanel"` e `aria-labelledby`. A implementação é local a cada componente, sem novo componente compartilhado.
- **Commits:** um por tarefa ou subtarefa implementável, apenas com seus **Files**, no padrão `tipo(escopo): descrição (NAV-98)`, sem trailer de coautoria e sem menção a ferramenta ou agente. Não usar `git add .`. A Tarefa 10 não cria commit.
- **Conferência autenticada não é possível nesta execução.** Ela depende do backend em `localhost:8080` e do login do próprio usuário. A verificação é por testes e build, e o roteiro manual deste arquivo fica para o usuário. Testes de DOM não comprovam geometria, recorte, foco real, 320 px nem o uso autenticado.

## Inventário de inconsistências, com evidência

Os caminhos são relativos a `frontend/src/app/`. Cada linha aponta uma tarefa ou o backlog.

| Tema | Evidência | Destino |
| --- | --- | --- |
| Dashboard com cabeçalho manual | `pages/dashboard/dashboard.component.html:2-6` | 1b |
| Indicadores visíveis antes da resposta e depois da falha, com zeros e `0%` | HTML `:14-26` sem guarda de `loading`/erro. Os sinais começam vazios (TS `:72-75`), e `metrics` calcula `0`, `0%` e `meter: 0` (`:88,103,108`) | 1a |
| Falha sem nova tentativa e vista como vazio | TS `:206-208` só grava a mensagem. HTML `:33,69,94` mostra “Nenhum RMA na fila.”, “Sem alterações recentes.” e “Nenhum RMA registrado.” depois do erro | 1a |
| Barras decorativas | TS `:99` (barra = ativos ÷ todos) e `:108` (barra repetindo o percentual de garantia). O percentual de garantia (`:88,103`) tem dados e fórmula definidos, mas o escopo, “todos os RMAs registrados, inclusive encerrados”, não aparece | 1b (barras saem; percentual fica com escopo) |
| Total somado de entidades diferentes | TS `:89,121`: o valor exibido é clientes + produtos + usuários. Os três totais componentes já estão no detalhe (`:122`). É uma decisão de apresentação, não um defeito matemático | 1b |
| Escopo implícito: `listBoard()` devolve todos os RMAs, de todo o período | `RmaController.java:57-63` → `RmaService.search(null, null)` sem filtro de status | 1b (texto do escopo) e backlog D2 |
| “Fila” inclui RMAs encerrados | TS `:131-134` ordena `rmasSignal()` inteiro antes de limitar a cinco. Um RMA `COMPLETED` de prioridade alta e entrada antiga fica no topo. O indicador “Fila inicial” (`:84`) usa outro recorte com o mesmo nome | 1b |
| Fila sem caminho até o RMA | HTML `:49-58` sem link. A rota `/rmas?rma=<id>` já existe (`pages/rmas/rmas.component.ts:951-960`; `shared/rma-detail-modal/rma-detail-modal.component.html:26`) | 1b |
| Auditoria troca o autor pela nota | TS `:161` `detail: note || changedBy`. O detalhe do RMA usa “Status registrado: X”, “Alterado por” e a nota em bloco (`core/utils/rma-detail.ts:119-128`; `pages/rmas/rmas.component.html:321-333`) | 1b |
| Tabelas do dashboard sem rolagem interna | HTML `:39,100`: `<table>` direto no painel | 1b |
| Código duplicado e morto | TS `:217-224` duplica `compareRmasForQueue` (`core/utils/rma-ui.ts:131-138`). `latestStatusUpdate` (`:253-259`) não é usado | 1b |
| Notificações com cabeçalho manual, abas sem painel associado e sem teclado | `pages/notifications/notifications.component.html:2-6,8-16`. A referência parcial com `aria-controls`/`tabpanel` está em `rmas.component.html:223-229` | 2b |
| Contador da aba ambíguo | HTML `:10`: “Caixa de entrada (1)” mostra o resumo de **não lidas** (`notification.service.ts:34-40`), sem dizer isso. O resumo começa em zero e, quando falha, conserva o último valor (`:17-20,34-38`). A página não consegue saber se ele carregou | 2b (rótulo) e backlog N3 (disponibilidade) |
| Um único `loading`/`errorMessage` para três recursos | TS `:162-164,288-318`. A falha da caixa mostra o estado vazio (HTML `:37-44`). Uma falha depois de um sucesso mantém a lista antiga (`:293-294`). `clearMessages()` (`:343-346`) apaga o erro de leitura ao trocar de aba ou executar uma ação | 2a, 3, 4a |
| Filtros da caixa sem cancelar a leitura anterior | TS `:210-218,288-297`: cada alternância assina outra vez, e uma resposta antiga pode sobrescrever a nova | 2a |
| Vazio com filtro igual ao vazio real | HTML `:39-44`: com “Somente não lidas” marcado, mostra o mesmo “Nenhuma notificação.” | 2a |
| Limite da caixa não informado | O servidor devolve até 100 notificações (`NotificationService.java:38,49-51`), enquanto o resumo conta todas as não lidas visíveis e não adiadas (`:58-61`; `NotificationRepository.java:35-43`) | 2a |
| Uma ação primária por linha | HTML `:64`: “Abrir RMA” em `button-primary` em todas as notificações. O estudo pede título acionável (`:327`) e destaque menor para marcar como lida e adiar (`:177`) | 2b |
| Link mostrado para destino recusado | HTML `:63` testa só `actionPath`. Com URL externa, `open()` não navega (TS `:221-227`), mas o botão aparece | 2b |
| Adiamento vencido aparece como ativo | HTML `:55-57` mostra “adiada até X” sempre que `snoozedUntil` existe. O servidor devolve como visível a notificação com `snoozedUntil <= now` (`NotificationRepository.java:24`) | 2b |
| Sucesso de adiar sem o fim do adiamento | TS `:251` “Notificação adiada.”, embora a resposta traga `snoozedUntil` (`models.ts:345`) | 2b |
| “Marcar todas” não diz que inclui as adiadas | O servidor marca todas, sem filtro de adiamento (`NotificationRepository.java:47-49`). TS `:239` não informa | 2b |
| Preferência mostra “Silenciado” para alerta não silenciável | HTML `:96` ignora `userMutable`. Quando a regra não é silenciável, o servidor ignora o silenciamento antigo de quem for destinatário de uma regra ativa (`NotificationDispatcher.java:95`; os destinatários vêm de `:88-92` e da política em `:96`) | 3 |
| “Obrigatório” fica na coluna Ação, não na situação | HTML `:98-102`. O estudo pede quatro situações separadas (`:179`) | 3 |
| Preferências sem carga, falha ou vazio | HTML `:78-110`: a tabela aparece vazia durante a carga e depois da falha | 3 |
| Ação de preferência sem nome do alerta e sem retorno | HTML `:99` “Silenciar”/“Reativar” sem o alerta no nome acessível. TS `:257-259` sem mensagem de status | 3 |
| Regras sem carga, falha ou vazio | HTML `:112-151`, TS `:309-316` | 4a |
| Regras editadas por controles soltos na tabela | HTML `:129-147`: sete colunas, e cada checkbox e select grava na hora (TS `:262-286`). Os checkboxes de perfil não citam o alerta (`:139`). O estudo pede resumo por evento e edição focada (`:179`) | 4a (resumo) e 4b (formulário) |
| Texto de implantação na rotina | HTML `:114` “sem nova implantação… domínio corporativo configurado no servidor” (estudo `:179`) | 4a |
| Falha ao listar falhas vira “Nenhuma falha registrada.” | TS `:317` `error: () => this.failures.set([])`. HTML `:155-156` mostra o mesmo texto também durante a carga | 5 |
| Origem e limite das falhas pouco explícitos | HTML `:174`: “E-mail” / “Evento”. O servidor traz até 50 falhas de eventos e até 50 de e-mail, combinadas e ordenadas (`NotificationRuleService.java:33,58-63`) | 5 |
| Relatórios com cabeçalho manual e contagem com “(s)” | `pages/reports/reports.component.html:2,37` “RMA(s) consultado(s)” | 6 |
| Período aplicado, status e cliente da consulta não aparecem | O servidor devolve `entryFrom`/`entryTo` normalizados (`RmaReportService.java:38-44`; `models.ts:517-522`), e o template não os usa. Depois de alterar o formulário sem consultar, nada diz a quais filtros os dados correspondem | 6 |
| Tipo de relatório misturado aos filtros | HTML `:4-6`: o select está no formulário, mas `loadReports` não o usa (TS `:82`) e a troca é imediata. A dica `:20` (“Altere os filtros e clique em Consultar”) não vale para ele | 6 |
| Erro de validação tratado como falha, com “Tentar novamente” | TS `:83-89` grava `errorMessage`. HTML `:31-35` mostra o mesmo alerta com nova tentativa, que repete a mesma validação | 6 |
| Laudo em quatro colunas estreitas e dados concatenados | HTML `:45-77`: produtos “SKU · Série · Lote” (`:54`), técnico e data juntos (`:64`). Rótulos diferentes dos do detalhe: “Causa”, “Observações” e “Peças” contra “Causa provável”, “Notas” e “Peças trocadas” (`rma-detail.ts:87,93,101`). O estudo pede resumo ou documento estruturado (`:183`) | 7 |
| Garantia com compra e entrada na mesma célula e “1 meses” | HTML `:115` “Compra / Entrada” e `{{ warrantyMonths }} meses`. Com compra desconhecida mostra “Não informado” (`formatDateOnly(null)`, `date.ts:15-18`), e não “Desconhecida”. Vencimento nulo também aparece como “Não informado” | 8 |
| Tempo por etapa: nome “Aging” e escopo da exclusão sem números | HTML `:82-83` (“Aging por etapa atual”), seletor TS `:42` (“Aging por etapa”). A exclusão de encerrados é só texto (`:83`), sem dizer quantos ficaram fora | 9 |
| Devoluções não explicam o período junto do recorte | HTML `:124`: o período só aparece na dica do formulário (`:20`) | 9 |

### Specs existentes e o que continua valendo

- `pages/dashboard/dashboard.component.spec.ts:10-46` confere o fuso da auditoria (`.timeline-entry time`), a entrada civil (`tables[0] … td:nth-child(3)`) e o instante de “Últimos RMAs” (`tables[1] … td:last-child`). Ele continua passando se a Tarefa 1b mantiver três coisas: `li.timeline-entry` com `<time>`; a fila como primeira `<table>`, com Entrada na 3.ª coluna; e “Últimos RMAs” como segunda `<table>`, com Atualizado na última. O `.table-wrap` em volta não altera esses seletores. Mudança deliberada na 1b: incluir `provideRouter([])` nos providers, porque o template passa a usar `RouterLink`.
- `pages/notifications/notifications.component.spec.ts`:
  - `:66-78` (lista, rótulo do evento, abertura) continua valendo. A asserção `not.toContain('Regras')` para TECHNICIAN obriga a caixa de entrada a não usar a palavra “Regras”.
  - `:80-84` (adiar 240) e `:86-96` (Silenciar/Obrigatório e payload) continuam valendo.
  - `:98-107` chama `toggleRole`, que grava na hora. **Mudança deliberada na Tarefa 4b:** reescrever o teste para editar pelo formulário e enviar, com o mesmo conjunto esperado de campos e destinatários.
- `pages/reports/reports.component.spec.ts:55-190`: período padrão e máximo; detalhes técnicos e fuso (`'22:00'`); itens de garantia e “sem override manual”; tempo por etapa com `[data-stage]` e exclusão de encerrados; devoluções; filtros combinados; falha depois de dados, com nova tentativa; cancelamento da consulta antiga; “Consulta em tela.”; falha só do seletor de clientes. Todos continuam valendo. As tarefas de relatório não removem `data-stage`, o texto “sem override manual”, a mensagem “A data inicial deve ser anterior ou igual à data final.” nem o botão “Recarregar clientes”.
- `core/utils/rma-detail.spec.ts:51-65` já testa os helpers de garantia. A Tarefa 8 não recria esses testes. `core/utils/rma-detail` e `rma-ui` não são alterados.

## Decisão de indicadores e informação

| Área | Decisão | Escopo declarado na tela |
| --- | --- | --- |
| Dashboard: RMAs em andamento | `RMAs em andamento: X de Y registrados`. A barra sai | `Y` = todos os RMAs devolvidos por `listBoard()`. Em andamento = status fora de `CLOSED_RMA_STATUSES` (cálculo atual `:83`) |
| Dashboard: fila inicial | `Fila inicial (Recebido e Triagem): X · Y com prioridade alta` | Mesmo cálculo de `:84,113` |
| Dashboard: garantia | Mantém o percentual atual (`P%`, mesma fórmula de `:88`) com o detalhe `X de Y itens · Z pendentes` e o escopo `em todos os RMAs registrados`. A barra sai | Itens de todos os RMAs registrados, inclusive encerrados, mesmo cálculo de `:85-88` |
| Dashboard: cadastros | `Cadastros: X clientes · Y produtos` e, só para ADMIN, `· Z usuários`. Sem total somado | Totais dos endpoints de resumo atuais |
| Dashboard: fila prioritária | Até 5 RMAs **em andamento**, ordenados por prioridade e entrada mais antiga (`compareRmasForQueue`), com link para `/rmas?rma=<id>` e a legenda `N primeiros de M RMAs em andamento` quando M > 5 | Corrige a inclusão de encerrados. Não muda a ordem nem o tamanho |
| Dashboard: auditoria e últimos RMAs | Mantidos, com os mesmos 4 itens e a mesma ordenação. Códigos com link. A auditoria usa a linguagem do detalhe | Status registrados de todos os RMAs carregados |
| Caixa de entrada | Aba `Caixa de entrada (N não lida[s])`, ou só `Caixa de entrada` com zero. Na lista: `Mostra até 100 notificações, das mais recentes, nos filtros selecionados.` | O contador é `unreadCount` do serviço, que exclui adiadas (`NotificationRepository.java:35-43`) e conserva o último valor conhecido (ver contrato de carga). O limite é `NotificationService.java:38` |
| Falhas de processamento | `Até 50 falhas de eventos e até 50 falhas de envio de e-mail, da mais recente para a mais antiga.` | `NotificationRuleService.java:33,58-63` |
| Relatórios | Cabeçalho com `N RMAs` consultados. O resumo da consulta traz período (do servidor), status, cliente e “Gerado em” | Resposta e valores submetidos, não o estado atual do formulário |
| Tempo por etapa | Linha `X RMAs em andamento considerados · Y encerrados fora do cálculo` | `activeRmas().length` e `rmas().length - activeRmas().length`, sem fórmula nova |
| Devoluções | `N RMAs devolvidos`, mais o texto do recorte e do período | `returns().length` |

## Quando recarregar dados

| Recurso | Carrega | Não recarrega |
| --- | --- | --- |
| Dashboard (`forkJoin` de board, clientes, produtos, usuários) | Na construção. `retryLoad()` só depois de falha | Não há recarga depois de sucesso, então não existe cenário “falha após sucesso” no dashboard |
| Caixa de entrada | Na construção. Ao selecionar a aba Caixa. Ao alternar “Somente não lidas” ou “Mostrar adiadas”. Em `clearInboxFilters()`. Depois de `markAllRead` e de `snooze` com sucesso. Em `retryInbox()`. Toda leitura chama `refreshSummary()`, como hoje (`:296`) | `markRead` substitui o item localmente e só chama `refreshSummary()` (`:230-235`). `open()` chama `markRead` e navega |
| Preferências | Cada vez que a aba é selecionada. `retryPreferences()` | `toggleMute` substitui a linha com a resposta (`:257-259`) |
| Regras | Cada vez que a aba Regras é selecionada (só ADMIN). `retryRules()` | Salvar uma regra substitui a linha com a resposta e não relê falhas |
| Falhas | Junto com as regras, na seleção da aba. `retryFailures()` relê só as falhas | Não recarregam depois de salvar uma regra |
| Relatórios | Na construção. Em Consultar (`ngSubmit`). Em “Tentar novamente” (só falha de servidor). Clientes: na construção e em “Recarregar clientes” | A troca do tipo de relatório não faz HTTP (filtra a mesma resposta, como hoje) |

### Contrato de carga

1. Antes de ativar o novo estado de carga, cancelar a assinatura anterior do mesmo recurso. Usar `takeUntilDestroyed(this.destroyRef)` também nas leituras disparadas por clique.
2. A falha da leitura principal substitui os dados e a contagem antigos. A primeira carga mostra “Carregando…”, sem zeros.
3. A **nova tentativa com os mesmos filtros** mantém o estado de falha visível e o botão desabilitado (`Carregando...`) até o sucesso.
4. A **troca de filtro na caixa** limpa a falha e o resultado do filtro anterior (`inboxLoadFailed = false`, `inboxHasLoaded = false`, lista vazia) e começa uma primeira carga. A lista antiga corresponde a outro filtro.
5. Uma recarga com os **mesmos filtros** depois de um sucesso (seleção da aba, depois de adiar ou de marcar todas) mantém a lista e mostra `Atualizando notificações...` com `role="status"`.
6. Os erros de ação (marcar, adiar, silenciar, salvar regra) usam `errorMessage`/`successMessage` ou `ruleErrorMessage`. Eles não viram falha de carga e não apagam dados válidos. `clearMessages()` limpa só mensagens de ação, nunca os sinais `*LoadFailed`/`*LoadErrorMessage`.
7. Os indicadores do dashboard e a contagem dos relatórios ficam ocultos sem resultado válido. O contador da caixa conserva o último resumo conhecido do serviço, porque a disponibilidade desse resumo não é detectável pelo contrato atual (`notification.service.ts:17-20,34-38`). Não usar `inboxHasLoaded` como prova de que o resumo carregou (backlog N3).

## Contrato de testes e comandos

1. **Preparação:** fábricas e `setup({ role, ...sources })` com os mocks configurados **antes** de `TestBed.createComponent`, como em `parts.component.load.spec.ts:46-60`.
   - Respostas em ordem controlada: um `Subject` por requisição (`vi.fn().mockReturnValueOnce(a).mockReturnValueOnce(b)`).
   - Falha HTTP: `throwError(() => new HttpErrorResponse({ status: 500 }))`. Nos relatórios, que usam `HttpTestingController`, `flush({}, { status: 500, statusText: 'Server error' })`.
   - Instante controlado nas notificações: `const clock = signal(Date.parse('2026-10-24T13:00:00Z'))`, com `{ provide: SlaClockService, useValue: { now: clock.asReadonly() } }`, avançando com `clock.set(...)` e `fixture.detectChanges()`.
   - Teclado nas abas: `tab.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }))` e, depois de `fixture.detectChanges()`, ler `document.activeElement`.
2. **Novo × preservação:** cada teste novo traz no spec um comentário de uma linha com a asserção que reprova hoje. Teste de preservação passa antes e depois. Quando parte de um teste já passa hoje, essa parte está marcada como preservação. Se o vermelho vier de compilação (método ou propriedade ainda inexistente), registrar isso separadamente, sem afirmar que as asserções rodaram.
3. **Asserções:** `text` normaliza espaços, inclusive o NBSP. Ler células pelo cabeçalho da coluna. Não comparar snapshots inteiros nem depender só da ausência de uma classe. Nas ocultações, afirmar a ausência do valor antigo e a presença do substituto.
4. **Comandos:** no **Git Bash**, a partir da raiz, com o runner entre aspas simples. `--include` é relativo a `frontend`.

   ```bash
   npm --prefix frontend test -- --watch=false --runner-config 'C:\Users\joseh\AppData\Local\Temp\vitest-runner.config.mjs' --include 'src/app/pages/dashboard/*.spec.ts'
   npm --prefix frontend test -- --watch=false --runner-config 'C:\Users\joseh\AppData\Local\Temp\vitest-runner.config.mjs' --include 'src/app/pages/notifications/*.spec.ts'
   npm --prefix frontend test -- --watch=false --runner-config 'C:\Users\joseh\AppData\Local\Temp\vitest-runner.config.mjs' --include 'src/app/pages/reports/*.spec.ts'
   npm --prefix frontend run build
   ```

## Review Focus

1. **Zero que parece dado:** nenhum indicador nem contagem do cabeçalho aparece antes do primeiro sucesso ou depois de uma falha (Tarefas 1a, 2a, 3, 4a, 6). O contador da caixa é a exceção declarada (contrato de carga, item 7).
2. **Lista de outro filtro:** a resposta antiga da caixa não substitui a atual, e a troca de filtro não mostra itens nem a falha do filtro anterior (Tarefa 2a). O resumo do relatório descreve a consulta que gerou os dados, não o formulário editado depois (Tarefa 6).
3. **Situação da preferência:** “Obrigatório” significa que o usuário não pode silenciar esse alerta, e um silenciamento antigo é ignorado quando ele for destinatário de uma regra ativa. “Desativado” tem precedência. As situações descrevem configuração e preferência, não garantem entrega (Tarefa 3).
4. **Regra salva com o mesmo contrato:** o formulário envia os mesmos seis campos e o mesmo conjunto de destinatários, numa única gravação confirmada. Cancelar não grava. A gravação pendente não duplica nem fecha. Abrir outra regra não herda valores da anterior (Tarefa 4b).
5. **Regras de relatório:** média e máximo, encerrados fora do cálculo, compra desconhecida pendente e devolução pelo status atual não mudam (Tarefas 7–9).

---

### Task 1a: Dashboard — carga, falha e nova tentativa

**Files:**
- Modify: `frontend/src/app/pages/dashboard/dashboard.component.ts` (sinais `:69-75`, `loadDashboard :184-210`).
- Modify: `frontend/src/app/pages/dashboard/dashboard.component.html` (precedência de estados em volta de `:8-121`).
- Create: `frontend/src/app/pages/dashboard/dashboard.component.states.spec.ts`.

**Interfaces:**
- Consumes: `RmaService.listBoard()`, `CatalogService.getClientSummary/getProductSummary/getUserSummary` e `AuthService.hasAnyRole`.
- Produces:
  - Os signals `loadFailed`, `hasLoaded` e `loadErrorMessage`, que substituem `errorMessage`.
  - `protected retryLoad(): void`, que só age se `!loading()`.
  - `private loadDashboard()`, que guarda a assinatura, cancela a anterior e usa `takeUntilDestroyed(this.destroyRef)`.
  - Os indicadores continuam com o cálculo e os rótulos atuais nesta subtarefa. Só a visibilidade muda.

- [ ] **Step 1: Escrever os testes novos**, com `setup({ role, board, clients, products, users })`:
  - `shows no indicators or empty sections before the first response`: `board = new Subject()`. Esperar `text` com `'Carregando dashboard...'` e sem `'0%'`. **Reprova hoje:** `metrics` mostra `0%` (`:103`) durante a carga. Preservação dentro do teste: “Nenhum RMA na fila.” já não aparece durante a carga.
  - `replaces the dashboard with a retryable failure`: parametrizar a falha em `listBoard`, `getClientSummary`, `getProductSummary` e, com `role: 'ADMIN'`, em `getUserSummary`, usando `throwError`. Esperar `'Não foi possível carregar o dashboard.'` e `'Tentar novamente'`, sem `'Nenhum RMA na fila.'`, `'Sem alterações recentes.'` ou `'0%'`. **Reprova hoje:** sem botão de nova tentativa, e os vazios aparecem (`html:33,69,94`). A mensagem de erro em si já existe (preservação).
  - `retries the complete snapshot`: `listBoard` com `mockReturnValueOnce(throwError(...)).mockReturnValueOnce(subject)`. Clicar em “Tentar novamente”: `expect(retry.disabled).toBe(true)`, com o texto `Carregando...` e a falha ainda visível. Depois `subject.next([RMA_OPEN]); subject.complete()`: o alerta some, `RMA-OPEN` aparece, `listBoard` é chamado 2 vezes e `getClientSummary` também. **Reprova hoje:** não há nova tentativa.

  **Preservação:** o spec existente de fuso e datas civis passa sem alteração. `listBoard()` é chamado uma vez, sem filtros. `getUserSummary` não é chamado para TECHNICIAN, SERVICE_DESK e VIEWER (já passa hoje).
- [ ] **Step 2: Rodar e ver falhar** (comando do dashboard). Esperado: FAIL nas asserções marcadas.
- [ ] **Step 3: Implementar** a precedência: falha (`alert-banner--error` com “Tentar novamente”/“Carregando...”) → primeira carga (`<article class="panel" role="status">Carregando dashboard...</article>`) → indicadores e seções. Os textos de vazio só aparecem depois de sucesso.
- [ ] **Step 4: Repetir o comando.** Esperado: todos PASS.
- [ ] **Step 5: Commit.** `git add` dos três **Files**. `git commit -m "fix(dashboard): distinguir carga, falha e vazio com nova tentativa (NAV-98)"`.

### Task 1b: Dashboard — composição, indicadores com escopo e navegação

**Files:**
- Modify: `frontend/src/app/pages/dashboard/dashboard.component.ts` (`metrics :77-129`, `queue :131-144`, `auditEvents :146-164`, `recentRmas :166-178`, funções `:213-259`, imports).
- Modify: `frontend/src/app/pages/dashboard/dashboard.component.html`.
- Modify: `frontend/src/app/pages/dashboard/dashboard.component.spec.ts` (somente `provideRouter([])` nos providers).
- Modify: `frontend/src/app/pages/dashboard/dashboard.component.states.spec.ts` (novo `describe` de composição).

**Interfaces:**
- Consumes: os estados da 1a, `PageHeaderComponent`, `RouterLink` e `compareRmasForQueue` de `core/utils/rma-ui.ts`.
- Produces:
  - `indicators` (computed), que devolve `{ label: string; value: string; detail: string; icon: IconName }[]` com os textos da tabela de decisões.
  - `QueueRow` e `RecentRmaRow` recebem `id: number`. `AuditRow` conserva `id: string` como chave do evento (`:157`, `track event.id`) e recebe `rmaId: number` para a navegação. O link da auditoria usa `rmaId`. `AuditRow` troca `detail` por `label` (“Status registrado: X”), `by`, `note: string | null` e `time`.
  - Remover o **import** de `MetricCard` (a definição em `core/models.ts:537` fica), a interface local `DashboardMetric`, a função local `compareRmasForQueue` e `latestStatusUpdate`, que não é usada.

- [ ] **Step 1: Escrever os testes novos:**
  - `keeps closed RMAs out of the priority queue and links each code`: `RMA_CLOSED` (`COMPLETED`, `HIGH`, entrada `2026-01-01`, id 9) e `RMA_OPEN` (`RECEIVED`, `MEDIUM`, id 2). Na primeira tabela: não contém `'RMA-CLOSED'`, o primeiro `a` tem `href="/rmas?rma=2"` e o título contém `'Fila prioritária'`. Com 7 RMAs ativos: `'5 primeiros de 7 RMAs em andamento'`. Só com encerrados: `'Nenhum RMA em andamento.'`. **Reprova hoje:** `queue` ordena todos os registros (`:131-134`), e não há link.
  - `states indicator scope and keeps the warranty percentage`: ADMIN; um RMA ativo e um encerrado, com dois itens (`IN_WARRANTY`, `PENDING`); resumos `clients.total=3`, `products.total=4`, `users.total=2`. Ler cada `li` da lista `aria-label="Indicadores do dashboard"`:
    - `RMAs em andamento` → `1 de 2 registrados`;
    - `Itens em garantia` → `50%`, `1 de 2 itens · 1 pendente` e `em todos os RMAs registrados`;
    - `Cadastros` → `3 clientes · 4 produtos · 2 usuários`.

    Também `root.querySelector('.meter')` é nulo. **Reprova hoje:** os rótulos “RMAs em andamento” e “Itens em garantia”, o escopo e o detalhe `1 de 2 itens · 1 pendente` não existem (`:93,102-104`), o valor de Cadastros é a soma `9` (`:121`) e há barras (`html:21`). O próprio `50%` já existe hoje (preservação).
  - `describes audit events like the RMA history`: evento `{ status: 'TRIAGE', changedBy: 'ana', note: 'Aguardando peça' }`. A entrada tem `'Status registrado: Triagem'`, o par `Alterado por` → `ana`, a nota em `blockquote` e o código com `href="/rmas?rma=1"`. **Reprova hoje:** com nota, o autor desaparece (`:161`), e não há link.
  - `keeps distinct audit entries for the same RMA`: dois eventos do RMA 1 (`RECEIVED` e `TRIAGE`, instantes diferentes). Esperar duas `li.timeline-entry`, ambas com `href="/rmas?rma=1"`. **Reprova hoje:** não há link. A presença das duas entradas já passa hoje (preservação, com chave por evento).
  - `links recent RMAs`: em “Últimos RMAs”, `a[href="/rmas?rma=1"]` tem o código. **Reprova hoje:** sem link.

  **Preservação:** ordem da fila por prioridade e entrada; auditoria com os 4 eventos mais recentes; últimos RMAs com os 4 de `updatedAt` mais recente, encerrados incluídos como hoje; responsável vazio como “Sem responsável” com avatar `–`; sem “usuários” na linha de cadastros para perfis que não são ADMIN; spec existente com `provideRouter([])`.
- [ ] **Step 2: Rodar e ver falhar.** Esperado: FAIL nas asserções marcadas.
- [ ] **Step 3: Implementar.**
  - Cabeçalho `<app-page-header heading="Dashboard" singular="RMA" plural="RMAs" />`, sem contagem, porque o dashboard não é uma coleção.
  - Indicadores em `<ul class="dashboard-summary" aria-label="Indicadores do dashboard">`: uma linha com ícone, rótulo, valor e detalhe. CSS local com tokens, sem `.stat-card` nem `.meter`.
  - Fila prioritária: filtrar `!CLOSED_RMA_STATUSES.includes(status)` antes de `sort(compareRmasForQueue)` e manter `slice(0, 5)` e as colunas RMA, Cliente, Entrada, Status. A legenda de escopo fica abaixo do título.
  - Auditoria: manter `li.timeline-entry` com `track event.id` e `<time>`. Título “Status registrado: X”, par `Alterado por` em `.meta-list` e nota em `blockquote` quando existir.
  - Links: `<a class="code-text" routerLink="/rmas" [queryParams]="{ rma: id }">` (ou `rmaId`).
  - Envolver as duas tabelas em `.table-wrap` e dar `min-width: 0` aos painéis da grade, preservando a rolagem interna.
- [ ] **Step 4: Repetir o comando.** Esperado: todos PASS.
- [ ] **Step 5: Commit.** `git add` dos quatro **Files**. `git commit -m "feat(dashboard): indicadores com escopo, fila em andamento e navegacao ao RMA (NAV-98)"`.

### Task 2a: Caixa de entrada — carga, falha, cancelamento e vazios

**Files:**
- Modify: `frontend/src/app/pages/notifications/notifications.component.ts` (sinais `:161-171`, toggles `:210-218`, `loadInbox :288-297`, `clearMessages :343-346`).
- Modify: `frontend/src/app/pages/notifications/notifications.component.html` (estados da caixa, `:37-74`).
- Create: `frontend/src/app/pages/notifications/notifications.component.inbox.spec.ts`.

**Interfaces:**
- Consumes: `NotificationService.list/refreshSummary`.
- Produces:
  - Os signals `inboxLoading`, `inboxLoadFailed`, `inboxHasLoaded` e `inboxLoadErrorMessage`.
  - `protected retryInbox(): void`.
  - `protected clearInboxFilters(): void`, que desmarca `unreadOnly` e recarrega.
  - `private inboxRequest?: Subscription`, cancelada antes de cada leitura, com `takeUntilDestroyed(this.destroyRef)`.
  - Os toggles aplicam o item 4 do contrato de carga. `clearMessages()` não toca nos sinais de carga.
  - `loading` é substituído por sinais por recurso. Até as Tarefas 3 e 4a, preferências e regras usam `preferencesLoading` e `rulesLoading` provisórios, com o template atual.

- [ ] **Step 1: Escrever os testes novos:**
  - `replaces the inbox with a retryable failure instead of an empty state`: `list` com `throwError`. Esperar `'Não foi possível carregar as notificações.'` e `'Tentar novamente'`, sem `'Nenhuma notificação.'`. **Reprova hoje:** o estado vazio aparece junto com o banner (`html:39-44`).
  - `hides the previous list when a filter reload fails`: primeiro `of([NOTIFICATION])`, depois `throwError`. Marcar “Somente não lidas”: o título `'RMA RMA-2026-000007 atribuído a Técnico'` não aparece. Clicar em “Tentar novamente”: `list` foi chamado por último com `{ unreadOnly: true, includeSnoozed: false }`. **Reprova hoje:** a lista antiga continua (`:293-294`).
  - `starts a first load after a filter change, even after a failure`: o primeiro `list` falha. Configurar `Subject` pendente e marcar “Mostrar adiadas”. Esperar `'Carregando notificações...'`, sem `'Não foi possível carregar as notificações.'`. Repetir com um sucesso anterior: o título antigo não aparece. **Reprova hoje:** a condição `loading() && notifications().length === 0` (`html:37`) mantém a lista antiga, e o banner de erro continua.
  - `keeps the failure while retrying the same filters`: com falha inicial e `Subject` na nova tentativa, o botão fica desabilitado com `Carregando...` e a mensagem de falha continua. **Reprova hoje:** não há nova tentativa.
  - `keeps only the latest inbox response`: `list` devolve `first` (construção) e depois `second` (toggle). `expect(first.observed).toBe(false)`. Emitir `second` com `NEW` e depois tentar `first` com `OLD`: `NEW` aparece e `OLD` não. **Reprova hoje:** a assinatura anterior não é cancelada (`:288-297`).
  - `distinguishes an empty filtered inbox`: com “Somente não lidas” e `of([])`, aparecem `'Nenhuma notificação não lida.'` e o botão `Mostrar todas`, cujo clique chama `list({ unreadOnly: false, includeSnoozed: false })`. Sem filtro e com `[]`, aparece `'Nenhuma notificação.'`. **Reprova hoje:** o texto vazio é sempre o mesmo, e não há como limpar o filtro.
  - `states the inbox limit`: com dados, a lista mostra `'Mostra até 100 notificações, das mais recentes, nos filtros selecionados.'`. **Reprova hoje:** sem texto.
  - `keeps a load failure after an action error`: com a caixa falha, chamar `markAllRead()` com erro e trocar de aba ida e volta com `list` ainda em erro: a falha de carga continua, com nova tentativa. **Reprova hoje:** `clearMessages()` e `run()` apagam ou trocam a única mensagem (`:326,343-346`).

  **Preservação:** o spec existente `:66-84`. Na recarga com os mesmos filtros depois de adiar, a lista fica visível com `Atualizando notificações...` (a recarga já acontece hoje, `:250-252`). `markRead` substitui o item sem recarregar (`list` 1 vez) e chama `refreshSummary`. O erro de `markRead` ou `snooze` mantém a lista e mostra `'Não foi possível concluir a ação agora.'` (já passa hoje).
- [ ] **Step 2: Rodar e ver falhar** (comando de notificações). Esperado: FAIL nas asserções marcadas e PASS no spec existente.
- [ ] **Step 3: Implementar** a precedência falha → primeira carga → vazio (com filtro ou real) → lista. `Atualizando notificações...` aparece só numa recarga com os mesmos filtros. O texto do limite fica abaixo da barra de filtros quando há dados. Não usar a palavra “Regras” na caixa.
- [ ] **Step 4: Repetir o comando.** Esperado: todos PASS.
- [ ] **Step 5: Commit.** `git add` dos três **Files**. `git commit -m "fix(notificacoes): estados e cancelamento da caixa de entrada (NAV-98)"`.

### Task 2b: Caixa de entrada — cabeçalho, abas, título acionável e adiamento

**Files:**
- Modify: `frontend/src/app/pages/notifications/notifications.component.ts` (`selectTab :198-208`, `open :220-228`, `markAllRead :237-242`, `snooze :244-254`, estilos inline `:35-154`).
- Modify: `frontend/src/app/pages/notifications/notifications.component.html` (`:1-16`, itens `:46-73`).
- Modify: `frontend/src/app/pages/notifications/notifications.component.inbox.spec.ts` (novo `describe` de apresentação).

**Interfaces:**
- Consumes: `markRead/markAllRead/snooze/unreadCount`, `internalRoute`, `formatNotificationDateTime`, `SlaClockService.now` e `PageHeaderComponent`.
- Produces:
  - `protected canOpen(n): boolean`, igual a `internalRoute(n.actionPath) !== null`.
  - `protected isSnoozed(n): boolean`, igual a `n.snoozedUntil !== null && Date.parse(n.snoozedUntil) > clock.now()`.
  - `protected unreadTabLabel(): string`.
  - `protected onTabKeydown(event: KeyboardEvent): void`, conforme o contrato de abas nas restrições globais.

- [ ] **Step 1: Escrever os testes novos:**
  - `opens the RMA from the notification title`: com `actionPath: '/rmas?rma=7'`, o título é um `button.link-button` com o texto do título. O clique chama `markRead(5)` e `navigate(['/rmas'], { queryParams: { rma: '7' } })`. Nenhum `.button-primary` no item. Com `actionPath: 'https://externo'`, nenhum botão de abertura aparece e o título é texto. **Reprova hoje:** existe “Abrir RMA” primário em cada linha, inclusive para URL externa (`html:63-64`). Preservação: `open()` marca como lida e navega por rota interna (`:220-228`).
  - `marks only active snoozes`: com `clock` em `2026-10-24T13:00:00Z` e `snoozedUntil: '2026-10-24T16:00:00Z'`, aparece `'Adiada até 24/10/2026, 13:00'`. Com `clock.set(Date.parse('2026-10-24T16:00:00Z'))` (o instante exato do vencimento) e `detectChanges()`, o texto `/adiada até/i` desaparece. Com `snoozedUntil: '2026-10-24T12:30:00Z'`, ele não aparece. **Reprova hoje:** o adiamento vencido aparece (`html:55-57`).
  - `confirms when the snooze ends`: `snooze` devolve `{ ...NOTIFICATION, snoozedUntil: '2026-10-24T16:00:00Z' }`. Aparece `role="status"` com `'Notificação adiada até 24/10/2026, 13:00.'`. **Reprova hoje:** a mensagem é “Notificação adiada.” (`:251`). A recarga depois de adiar é preservação.
  - `states that marking all includes snoozed`: o sucesso mostra `'Todas as notificações, inclusive as adiadas, foram marcadas como lidas.'`. **Reprova hoje:** `:239`.
  - `names the unread count and links tabs to their panel`: com `unreadCount = signal(2)`, o texto da aba é `'Caixa de entrada (2 não lidas)'`; com `1`, `(1 não lida)`; com `0`, `'Caixa de entrada'`. `aria-controls` aponta para um elemento `role="tabpanel"` cujo `aria-labelledby` é o id da aba. **Reprova hoje:** o texto é `(2)`, e não há `tabpanel` (`html:8-16`).
  - `moves between tabs with the keyboard`: ADMIN. ArrowRight na Caixa seleciona e foca Preferências e chama `listPreferences`. End vai para Regras. Home volta para a Caixa. ArrowLeft na Caixa vai para Regras. Só a aba ativa tem `tabindex="0"`. Para TECHNICIAN, End vai para Preferências. **Reprova hoje:** sem tratamento de teclado e sem `tabindex`.

  **Preservação:** as ações secundárias “Marcar como lida” e “Adiar”, com 60/240/1440; `busy` desabilita as ações; “Marcar todas como lidas” fica desabilitado sem não lidas carregadas; TECHNICIAN não vê a aba Regras.
- [ ] **Step 2: Rodar e ver falhar.** Esperado: FAIL nas asserções marcadas.
- [ ] **Step 3: Implementar.**
  - `<app-page-header heading="Notificações" singular="notificação" plural="notificações" />`, sem contagem.
  - Abas conforme o contrato.
  - Em cada item: ícone de severidade com o rótulo em `sr-only`, como hoje, mas sem `[title]`; na meta, evento, `rmaCode` quando existir e instante; título acionável só quando `canOpen`; mensagem.
  - O botão do título mantém `.link-button`, com altura mínima local `var(--control-height-sm)` e texto alinhado à esquerda.
  - O erro de ação fica num `alert-banner` dentro do painel da caixa.
- [ ] **Step 4: Repetir o comando.** Esperado: todos PASS.
- [ ] **Step 5: Commit.** `git add` dos três **Files**. `git commit -m "feat(notificacoes): abas com teclado, titulo acionavel e adiamento identificavel (NAV-98)"`.

### Task 3: Preferências com quatro situações e estados de carga

**Files:**
- Modify: `frontend/src/app/pages/notifications/notifications.component.ts` (`toggleMute :256-260`, `loadPreferences :299-307`).
- Modify: `frontend/src/app/pages/notifications/notifications.component.html` (aba Preferências).
- Create: `frontend/src/app/pages/notifications/notifications.component.preferences.spec.ts`.

**Interfaces:**
- Consumes: `listPreferences`, `updatePreference(eventType, muted)` e o `run()` atual.
- Produces:
  - Os signals `preferencesLoading`, `preferencesLoadFailed`, `preferencesHasLoaded` e `preferencesLoadErrorMessage`.
  - `protected retryPreferences(): void`.
  - `private preferencesRequest?: Subscription`, cancelada a cada leitura.
  - `protected preferenceState(p): 'disabled' | 'mandatory' | 'muted' | 'receiving'`, com precedência `!enabled` → `disabled`, depois `!userMutable` → `mandatory`, depois `muted` → `muted`, senão `receiving`. Rótulos: `Desativado pela administração`, `Obrigatório`, `Silenciado` e `Recebendo`.
  - “Obrigatório” significa que o usuário não pode silenciar esse alerta. Um silenciamento antigo é ignorado quando ele for destinatário de uma regra ativa. Não promete entrega: os destinatários dependem da regra e da política de recebimento (`NotificationDispatcher.java:88-96`).
  - No sucesso de `toggleMute`, `successMessage` recebe `'<Alerta> silenciado.'` ou `'<Alerta> reativado.'`.

- [ ] **Step 1: Escrever os testes novos:**
  - `labels each preference with one of four states`: cinco preferências (recebendo; silenciado; `enabled: false`; `userMutable: false, muted: true`; `userMutable: false, muted: false`). A coluna `Situação` mostra `['Recebendo', 'Silenciado', 'Desativado pela administração', 'Obrigatório', 'Obrigatório']`. **Reprova hoje:** o quarto mostra “Silenciado” e o quinto “Recebendo” (`html:96`), e o rótulo de desativado é “Regra desativada”.
  - `names the preference action with its alert`: o botão da primeira linha tem `aria-label="Silenciar Novo RMA"`, e o da segunda `'Reativar …'`. **Reprova hoje:** o nome acessível é só “Silenciar” (`html:99`). A ausência de botão nas linhas obrigatórias já passa hoje (preservação).
  - `confirms the change in a status message`: depois de `toggleMute`, `role="status"` contém `'Novo RMA silenciado.'`. **Reprova hoje:** não há mensagem (`:257-259`).
  - `does not show an empty table while loading or after failure`: com `Subject` pendente, aparece `'Carregando preferências...'` e nenhuma `table`. Com `throwError`, aparecem `'Não foi possível carregar as preferências.'` e `'Tentar novamente'`, sem `table`. Falha depois de sucesso: abrir Preferências com `of(PREFERENCES)`, voltar para a Caixa, configurar `throwError` e abrir de novo; `'Novo RMA'` não aparece. A nova tentativa chama `listPreferences` mais uma vez. **Reprova hoje:** a tabela aparece durante a carga e mantém as linhas antigas depois da falha (`html:78-110`).
  - `shows an empty preference list`: com `of([])`, aparece `'Nenhuma preferência disponível.'`, sem `table`. **Reprova hoje:** a tabela aparece com cabeçalho e corpo vazio.

  **Preservação:** spec existente `:86-96` (Silenciar, Obrigatório e `updatePreference('RMA_CREATED', true)`). Uma preferência desativada e silenciável continua com o botão, porque o servidor aceita (`NotificationService.java:93-111`). O texto explicativo `:80` continua. O erro de `updatePreference` mantém a linha e mostra o alerta. VIEWER vê e altera as próprias preferências.
- [ ] **Step 2: Rodar e ver falhar.** Esperado: FAIL nas asserções marcadas.
- [ ] **Step 3: Implementar.** A precedência é falha → carga → vazio → tabela. Colunas: Alerta, Severidade, Situação (`state-dot` ligado para `receiving` e `mandatory`) e Ação (botão só quando `userMutable`, com `aria-label` = verbo + alerta), dentro de `.table-wrap`. Não acrescentar “Reativar” para obrigatório silenciado.
- [ ] **Step 4: Repetir o comando.** Esperado: todos PASS.
- [ ] **Step 5: Commit.** `git add` dos três **Files**. `git commit -m "feat(notificacoes): preferencias com quatro situacoes e estados de carga (NAV-98)"`.

### Task 4a: Regras — carga e resumo administrativo

**Files:**
- Modify: `frontend/src/app/pages/notifications/notifications.component.ts` (`loadRules :309-316`, helper de resumo, import de `RowActionComponent`).
- Modify: `frontend/src/app/pages/notifications/notifications.component.html` (aba Regras, `:112-151`).
- Create: `frontend/src/app/pages/notifications/notifications.component.rules.spec.ts`.

**Interfaces:**
- Consumes: `listRules`, `ROLE_OPTIONS`/`ROLE_LABELS` e `NOTIFICATION_SEVERITY_LABELS`.
- Produces:
  - Os signals `rulesLoading`, `rulesLoadFailed`, `rulesHasLoaded` e `rulesLoadErrorMessage`.
  - `protected retryRules(): void`.
  - `protected recipientsSummary(rule): string`, que produz `'Administrador, Atendimento + responsável pelo RMA'` ou, sem perfis nem responsável, `'Nenhum destinatário'` (só o fato, sem aviso nem validação).
  - A edição imediata (`updateRule(rule, change)`, `toggleRole`, `updateSeverity`) sai do template nesta subtarefa. Os métodos ficam no TS até a 4b, que os remove. Por isso, nesta subtarefa não há como editar regras pela tela. A 4a e a 4b devem ser entregues juntas na mesma série de commits, sem publicar entre elas.

- [ ] **Step 1: Escrever os testes novos:**
  - `summarizes each rule without inline controls`: ADMIN, aba Regras. A linha `SLA vencido` tem as colunas:

    | Coluna | Valor |
    | --- | --- |
    | `Alerta` | `SLA vencido` |
    | `Situação` | `Ativa` |
    | `Severidade` | `Crítico` |
    | `Destinatários` | `Administrador + responsável pelo RMA` |
    | `E-mail` | `Não` |
    | `Silenciável` | `Não` |
    | `Atualização` | `24/10/2026, 09:00 por admin` |

    Nenhum `input` nem `app-custom-select` na tabela. O botão `aria-label="Editar regra SLA vencido"` existe. Com `recipientRoles: []` e `notifyAssignee: false`, o resumo é `Nenhum destinatário`. **Reprova hoje:** há checkboxes e selects na tabela (`html:132-145`) e nenhum botão de edição.
  - `separates rule loading, failure and stale rows`: com `Subject` pendente, aparece `'Carregando regras...'` sem `table`. Com `throwError`, aparecem `'Não foi possível carregar as regras.'` e `'Tentar novamente'`. Falha depois de sucesso: abrir Regras com sucesso, ir para Preferências, configurar `throwError` e voltar; `SLA vencido` não aparece. **Reprova hoje:** a tabela aparece vazia ou antiga (`html:112-151`).
  - `shows an empty rule list`: com `of([])`, aparece `'Nenhuma regra disponível.'`, sem `table`. **Reprova hoje:** tabela vazia.
  - O teste `notifications.component.spec.ts:98-107` chama `toggleRole` diretamente e continua passando nesta subtarefa, porque o método ainda existe. A 4b o reescreve.

  **Preservação:** TECHNICIAN, SERVICE_DESK e VIEWER não veem a aba, e `selectTab('rules')` não chama `listRules` (já passa hoje, `:205`).
- [ ] **Step 2: Rodar e ver falhar.** Esperado: FAIL nas asserções marcadas.
- [ ] **Step 3: Implementar** a precedência falha → carga → vazio → tabela-resumo em `.table-wrap`. Cada linha tem `button[appRowAction] icon="pencil" label="Editar regra" [target]="eventLabels[rule.eventType]"`. O clique chama `openRuleEditor(rule)`, que a 4b cria: nesta subtarefa, declarar `openRuleEditor` como método vazio documentado e testar só a presença do botão. Tirar da tabela o parágrafo de implantação (`html:114`).
- [ ] **Step 4: Repetir o comando.** Esperado: todos PASS.
- [ ] **Step 5: Commit.** `git add` dos três **Files**. `git commit -m "feat(notificacoes): regras com estados de carga e resumo por evento (NAV-98)"`.

### Task 4b: Regras — formulário focado e salvamento

**Files:**
- Modify: `frontend/src/app/pages/notifications/notifications.component.ts` (`updateRule/toggleRole/updateSeverity :262-286`, novos métodos de edição, import de `ReactiveFormsModule`).
- Modify: `frontend/src/app/pages/notifications/notifications.component.html` (diálogo de regra).
- Modify: `frontend/src/app/pages/notifications/notifications.component.spec.ts` (`:98-107`, mudança deliberada para o fluxo de formulário).
- Modify: `frontend/src/app/pages/notifications/notifications.component.rules.spec.ts` (novo `describe` do formulário).

**Interfaces:**
- Consumes: `updateRule(eventType, payload)`, `severityOptions` e `CustomSelectComponent` (CVA).
- Produces:
  - Os signals `editingRule` (`NotificationRuleResponse | null`), `ruleSubmitting` e `ruleErrorMessage`.
  - `ruleForm = fb.nonNullable.group({ enabled, severity, notifyAssignee, emailEnabled, userMutable, roles: fb.nonNullable.group({ ADMIN, TECHNICIAN, SERVICE_DESK, VIEWER }) })`.
  - `protected openRuleEditor(rule): void`: com `ruleForm.reset({...})`, redefine **todos** os controles com os valores da regra, inclusive `false` e todos os perfis desmarcados quando ausentes. Também limpa `ruleErrorMessage`.
  - `protected closeRuleEditor(): void` ignora o pedido durante `ruleSubmitting()`. `private resetRuleEditor(): void` limpa sem guarda.
  - `protected saveRule(): void` ignora o envio se `ruleSubmitting()`. Ele monta o payload com `ruleForm.getRawValue()`: `{ enabled, severity, recipientRoles: ROLE_OPTIONS.filter((role) => roles[role]), notifyAssignee, emailEnabled, userMutable }`. São os mesmos seis campos e o mesmo conjunto de destinatários de hoje. A ordem do array segue `ROLE_OPTIONS`, e o servidor recebe um `Set` e normaliza em `EnumSet` (`NotificationRuleService.java:48`).
  - No sucesso de `saveRule`, atualizar a linha com a resposta, gravar `successMessage` `'Regra "<Alerta>" atualizada.'` (mesmo texto de hoje, `:275`) e chamar `resetRuleEditor()` diretamente, sem `closeRuleEditor()` enquanto `ruleSubmitting()` ainda é verdadeiro. No erro, `ruleErrorMessage = extractHttpErrorMessage(error, 'Não foi possível salvar a regra.')`, mantendo o formulário.
  - Remover `updateRule(rule, change)`, `toggleRole` e `updateSeverity`.

- [ ] **Step 1: Escrever os testes novos:**
  - `edits a rule in a focused form and saves the same contract`: abrir a edição de `SLA vencido` e conferir as legendas `['Entrega', 'Destinatários', 'E-mail e silenciamento']`. O checkbox `Atendimento` fica no `fieldset` com a legenda `Destinatários`. Marcar Atendimento e enviar `Salvar regra`: `updateRule` é chamado uma vez com `'SLA_OVERDUE'` e `{ enabled: true, severity: 'CRITICAL', recipientRoles: ['ADMIN', 'SERVICE_DESK'], notifyAssignee: true, emailEnabled: false, userMutable: false }`. O diálogo fecha, a linha mostra a resposta e aparece `'Regra "SLA vencido" atualizada.'`. Também `expectCancelBeforePrimary(dialog)`. **Reprova hoje:** não existe edição focada. Os seis campos e a mensagem de sucesso já existem (preservação).
  - `saves an unchanged rule and all-false booleans`: abrir e salvar sem alterar envia os valores originais da regra. Uma regra com `enabled: false, notifyAssignee: false, emailEnabled: false, userMutable: false, recipientRoles: []` envia exatamente esses valores e `recipientRoles: []`. **Reprova hoje:** sem formulário.
  - `does not carry values between consecutive rules`: abrir A, marcar Técnico e cancelar; abrir B (sem Técnico): o checkbox Técnico está desmarcado e os booleanos são os de B. **Reprova hoje:** sem formulário.
  - `does not save on cancel and keeps the form while saving`: Cancelar não chama `updateRule` nem altera a linha. Com `updateRule` devolvendo um `Subject`, chamar `saveRule()` duas vezes e clicar em Fechar, no overlay e em Cancelar: `updateRule` é chamado 1 vez e o diálogo continua conectado. Quando o `Subject` emite erro, os valores marcados ficam, e aparece `role="alert"` dentro do diálogo com `'Não foi possível salvar a regra.'`. Depois disso, fechar volta a funcionar. **Reprova hoje:** sem formulário.
  - Reescrever `notifications.component.spec.ts:98-107` para abrir a edição, marcar Atendimento e enviar, com o mesmo payload esperado. É mudança deliberada de fluxo, não de contrato.

  **Preservação:** a severidade alterada no select vai no payload; desmarcar Ativa envia `enabled: false`; a regra não ganha validação nova; a explicação do e-mail fica junto do checkbox, `'Somente endereços do domínio corporativo configurado.'`; só ADMIN acessa.
- [ ] **Step 2: Rodar e ver falhar.** Esperado: FAIL nas novas asserções.
- [ ] **Step 3: Implementar** o diálogo com o padrão de `users.component.html:147-235`: `modal-overlay`, `section role="dialog" aria-modal="true" aria-labelledby`, Fechar e overlay desabilitados durante a gravação.
  - Dentro, `form.form-grid` com três `fieldset.form-section`: **Entrega** (Ativa, Severidade), **Destinatários** (perfis e “Notificar o responsável pelo RMA”) e **E-mail e silenciamento** (“Enviar também por e-mail”, “Permitir que cada usuário silencie”).
  - Introdução: `'Vale para os próximos eventos.'`.
  - Rodapé `.form-actions--full`: Cancelar (`type="button"`) à esquerda de “Salvar regra” (`type="submit"`).
  - O foco global continua no backlog F1.
- [ ] **Step 4: Repetir o comando.** Esperado: todos PASS.
- [ ] **Step 5: Commit.** `git add` dos quatro **Files**. `git commit -m "feat(notificacoes): edicao focada de regra com envio confirmado (NAV-98)"`.

### Task 5: Falhas de processamento como seção administrativa própria

**Files:**
- Modify: `frontend/src/app/pages/notifications/notifications.component.ts` (`loadRules :317`, nova `loadFailures`).
- Modify: `frontend/src/app/pages/notifications/notifications.component.html` (`:153-185`).
- Modify: `frontend/src/app/pages/notifications/notifications.component.rules.spec.ts` (novo `describe` de falhas).

**Interfaces:**
- Consumes: `listFailures()`.
- Produces:
  - Os signals `failuresLoading`, `failuresLoadFailed`, `failuresHasLoaded` e `failuresLoadErrorMessage`.
  - `private loadFailures(): void`, chamada por `loadRules`, com assinatura própria cancelável.
  - `protected retryFailures(): void`.
  - `protected failureSource(f): string`, que devolve `'Processamento do evento'` (`EVENT`) ou `'Envio de e-mail'` (`EMAIL`).

- [ ] **Step 1: Escrever os testes novos:**
  - `distinguishes a failure-list error from no failures`: regras com sucesso e `listFailures` com `throwError`. Aparecem `'Não foi possível carregar as falhas de processamento.'` e o botão `Tentar carregar falhas`, sem `'Nenhuma falha registrada.'`. A tabela de regras continua com `SLA vencido`. **Reprova hoje:** o erro vira `[]` (`:317`).
  - `shows loading instead of no failures`: com `Subject` pendente, aparece `'Carregando falhas...'` e não `'Nenhuma falha registrada.'`. **Reprova hoje:** `html:155-156`.
  - `retries only the failures`: o clique no botão leva a `listFailures` 2 vezes e `listRules` 1 vez. **Reprova hoje:** não há botão.
  - `identifies the origin and the limit`: na coluna `Origem`, `EVENT` → `Processamento do evento` e `EMAIL` → `Envio de e-mail`. A seção contém `'Até 50 falhas de eventos e até 50 falhas de envio de e-mail, da mais recente para a mais antiga.'`. **Reprova hoje:** `html:174` e nenhum texto de limite.

  **Preservação:** o texto completo de `error` no DOM; a ordem do servidor (`NotificationRuleService.java:63`); `rmaCode` e destinatário ausentes como `—`; o rótulo do evento; só ADMIN pede falhas. Tudo já passa hoje.
- [ ] **Step 2: Rodar e ver falhar.** Esperado: FAIL nas asserções marcadas.
- [ ] **Step 3: Implementar** `<section aria-labelledby="notification-failures-title">` com `h2` “Falhas de processamento” e o texto do limite. A precedência é falha → carga → vazio → tabela em `.table-wrap`. A célula de erro usa `white-space: pre-wrap; overflow-wrap: anywhere` em CSS local, sem truncar.
- [ ] **Step 4: Repetir o comando.** Esperado: todos PASS.
- [ ] **Step 5: Commit.** `git add` dos três **Files**. `git commit -m "feat(notificacoes): falhas de processamento com carga, origem e limite explicitos (NAV-98)"`.

### Task 6: Moldura comum dos relatórios

**Files:**
- Modify: `frontend/src/app/pages/reports/reports.component.ts` (sinais, `reportOptions :41-44`, `loadReports :78-98`, teclado das abas).
- Modify: `frontend/src/app/pages/reports/reports.component.html` (`:1-38`).
- Modify: `frontend/src/app/pages/reports/reports.component.css` (grade do formulário, resumo).
- Create: `frontend/src/app/pages/reports/reports.component.frame.spec.ts`.

**Interfaces:**
- Consumes: `ReportService.list`, a validação local atual, `clientOptions`, `statusOptions`, `PageHeaderComponent`, `formatDateOnly` e `formatInstant`.
- Produces:
  - `protected readonly periodError = signal('')` para os dois erros locais. Eles saem de `errorMessage`, que fica só para falha do servidor. As mensagens continuam as mesmas (`:84,88`).
  - `protected readonly appliedFilters = signal<{ status: string; client: string } | null>(null)`, gravado com os rótulos dos valores **submetidos** no instante da requisição.
  - O resumo usa `report().entryFrom/entryTo` (servidor), `appliedFilters()` e `report().generatedAt`.
  - O tipo de relatório sai do `<form>` e vira `tab-list` com `role="tablist" aria-label="Relatórios"` acima dos resultados. As abas leem e gravam só `form.controls.report` (`setValue`), sem um segundo estado de tipo. Isso mantém `reportType` e os specs que fazem `patchValue({ report })`.
  - `protected onTabKeydown(event: KeyboardEvent): void` segue o contrato de abas.
  - O rótulo `Aging por etapa` passa a `Tempo por etapa`.
  - Os dois seletores de data recebem `ariaDescribedBy` com o id da ajuda (`report-period-help`) e, quando houver erro, também `report-period-error`, mais `ariaInvalid`.

- [ ] **Step 1: Escrever os testes novos:**
  - `shows the applied period, filters and generation instant`: consultar com `status: 'IN_DIAGNOSIS', clientId: 2` e responder com `entryFrom: '2026-07-24', entryTo: '2026-10-21'`. O `dl` com `aria-label="Consulta aplicada"` mostra:
    - `Período de entrada` → `24/07/2026 a 21/10/2026`;
    - `Status atual` → `Diagnóstico`;
    - `Cliente` → `Cliente Alfa`;
    - `Gerado em` → `20/10/2026, 22:00 (São Paulo)`.

    Depois de `form.patchValue({ status: 'RETURNED' })` sem consultar, o resumo continua em `Diagnóstico`. **Reprova hoje:** o template não mostra período nem filtros (`html:37`). O instante de geração já aparece hoje (preservação).
  - `shows period validation beside the dates without a retry`: `entryFrom > entryTo` e `loadReports()`. `#report-period-error` contém `'A data inicial deve ser anterior ou igual à data final.'`. Nos gatilhos `[aria-label="Data inicial de entrada"]` e `[aria-label="Data final de entrada"]`, a lista de ids em `aria-describedby` (separada por espaço) contém `report-period-help` e `report-period-error`, os dois existem no DOM, e `aria-invalid="true"`. Nenhum botão `Tentar novamente`. Repetir com 367 dias. **Reprova hoje:** a validação aparece como falha com nova tentativa (`html:31-35`), e os seletores não têm descrição. O texto da mensagem e o `expectNone` já passam hoje (preservação).
  - `switches report type in tabs without a new query`: existem as abas `['Laudo técnico', 'Tempo por etapa', 'Garantia por produto', 'Devoluções']`. Clicar em `Garantia por produto` dá `aria-selected="true"`, o painel `role="tabpanel"` mostra `Garantia por produto` e `http.expectNone(...)` vale. O formulário não contém `Tipo de relatório`. **Reprova hoje:** é um select dentro do formulário. A troca programática sem HTTP já existe (preservação).
  - `moves between report tabs with the keyboard`: ArrowRight no Laudo seleciona e foca Tempo por etapa, e `form.controls.report.value === 'aging'`. End vai para Devoluções e Home para Laudo. Só a aba ativa tem `tabindex="0"`. Nenhuma requisição nova. **Reprova hoje:** não há abas.
  - `counts consulted RMAs in the heading`: com 1 RMA, `.page-heading__count` é `1 RMA`; com 2, `2 RMAs`. A contagem não aparece durante a carga nem na falha. `'RMA(s)'` não aparece. **Reprova hoje:** `html:37`.

  **Preservação:** todo o `reports.component.spec.ts` existente. A falha do servidor mantém “Tentar novamente”. A consulta inválida continua sem HTTP e oculta o resultado anterior, como `:134` exige.
- [ ] **Step 2: Rodar e ver falhar** (comando de relatórios). Esperado: FAIL nas asserções marcadas.
- [ ] **Step 3: Implementar.**
  - `<app-page-header heading="Relatórios" singular="RMA" plural="RMAs" [count]="report() && !loading() ? rmas().length : null" />`.
  - O formulário fica com quatro filtros e Consultar. A dica do formulário vira a ajuda `#report-period-help`: `'Período pela data de entrada do RMA, até 366 dias.'`.
  - O resumo `.meta-list` fica acima das abas, seguido de `'Consulte novamente para atualizar.'`.
  - Manter `aria-live` e `aria-busy` no bloco de resultados. Não criar botão de exportação.
- [ ] **Step 4: Repetir o comando.** Esperado: todos PASS.
- [ ] **Step 5: Commit.** `git add` dos quatro **Files**. `git commit -m "feat(relatorios): consulta aplicada, abas com teclado e validacao junto do periodo (NAV-98)"`.

### Task 7: Laudo técnico como documento estruturado por RMA

**Files:**
- Modify: `frontend/src/app/pages/reports/reports.component.html` (caso `technical`).
- Modify: `frontend/src/app/pages/reports/reports.component.css`.
- Create: `frontend/src/app/pages/reports/reports.component.compositions.spec.ts` (bloco `describe('technical report')`).

**Interfaces:**
- Consumes: `rmas()`, `failureLabels`, `causeLabels`, `formatDate` e `statusLabels`. Nenhuma propriedade nova no TS.
- Produces: um `<article aria-labelledby>` por RMA, com `h3` (código e cliente) e `.meta-list` com Status e Entrada. Seções `h4`:
  - **Produtos:** tabela em `.table-wrap` com Produto, SKU, Série, Lote, e `Não informada`/`Não informado` nas ausências.
  - **Falha relatada.**
  - **Diagnóstico:** falha encontrada e os pares Tipo, Causa provável, Técnico, Data do diagnóstico e Notas, com os rótulos de `rma-detail.ts:82-95`; ou `Diagnóstico pendente`.
  - **Reparo e testes:** pares Reparo, Peças trocadas e Testes (`rma-detail.ts:98-103`).
  - As ausências mantêm os textos atuais do relatório (`Não informado`, `Não informada`, `Sem observações`, `Não informadas`, `Não informados`).

- [ ] **Step 1: Escrever os testes novos:**
  - `renders one structured document per RMA`: com 2 RMAs, há dois `article` com `h3` contendo `RMA-REAL` e o segundo código. Cada um tem os `h4` `['Produtos', 'Falha relatada', 'Diagnóstico', 'Reparo e testes']`. **Reprova hoje:** há uma tabela de quatro colunas (`html:45-77`).
  - `separates product identification in columns`: a tabela de produtos tem os cabeçalhos `['Produto', 'SKU', 'Série', 'Lote']`, e a linha 1 é `Controlador | SKU-1 | SER-A | LOTE-A`. Com `serialNumber: null`, a célula Série é `Não informada`. **Reprova hoje:** a identificação é concatenada (`html:54`).
  - `uses the detail labels and separates technician and date`: os pares `Técnico` → `Técnico Alfa`, `Data do diagnóstico` → `20/10/2026`, `Causa provável` → rótulo de `INCORRECT_USAGE`, `Notas` → `Inspeção visual` e `Peças trocadas` → `Conector USB`. **Reprova hoje:** `html:64` mostra `Técnico Alfa · 20/10/2026`, e os rótulos são “Causa”, “Observações” e “Peças”.

  **Preservação:** os textos de `reports.component.spec.ts:69-93` (falha encontrada, reparo, peças, testes, técnico, `Diagnóstico pendente`); `white-space: pre-wrap` nos textos longos; status com chip e texto.
- [ ] **Step 2: Rodar e ver falhar.**
- [ ] **Step 3: Implementar** só o caso `technical`, com os documentos empilhados e `--space-4` entre eles. Nenhum dado novo.
- [ ] **Step 4: Repetir o comando.** Esperado: todos PASS.
- [ ] **Step 5: Commit.** `git add` dos três **Files**. `git commit -m "feat(relatorios): laudo tecnico como documento por RMA (NAV-98)"`.

### Task 8: Garantia por produto com campos distintos

**Files:**
- Modify: `frontend/src/app/pages/reports/reports.component.ts` (expor `warrantyTermLabel`, `warrantyExpiryLabel` e `purchaseFact` de `core/utils/rma-detail.ts`).
- Modify: `frontend/src/app/pages/reports/reports.component.html` (caso `warranty`).
- Modify: `frontend/src/app/pages/reports/reports.component.compositions.spec.ts` (bloco `describe('warranty report')`).

**Interfaces:**
- Consumes: os helpers do detalhe, sem alteração. No template:
  - Compra: `purchaseFact(rma).value`. Dá `Desconhecida` quando `purchaseDateUnknown`, `Não informada` quando nula, ou a data.
  - Vencimento: `warrantyExpiryLabel(item).value`. Dá `Sem data da compra` quando nulo, o que equivale a compra ausente ou desconhecida (`ItemWarranty.java:8-9`).
  - Prazo: `warrantyTermLabel(item.warrantyMonths)`, que devolve `1 mês` ou `N meses`.
- Produces: colunas `RMA`, `Cliente`, `Produto` (nome e SKU), `Série`, `Lote`, `Compra`, `Entrada`, `Prazo`, `Vencimento`, `Situação`, em `.table-wrap`. A situação continua texto de `WARRANTY_STATUS_LABELS`.

- [ ] **Step 1: Escrever os testes novos:**
  - `separates purchase and entry`: os cabeçalhos incluem `Compra` e `Entrada` separados, e a linha tem `20/10/2025` e `20/10/2026`. **Reprova hoje:** `Compra / Entrada` (`html:115`).
  - `keeps unknown purchase pending with explicit labels`: `purchaseDateUnknown: true, purchaseDate: null`, item `PENDING` com `warrantyExpiresAt: null`. `Compra` → `Desconhecida`, `Vencimento` → `Sem data da compra`, `Situação` → `Pendente`. **Reprova hoje:** a compra e o vencimento aparecem como `Não informado`. `Pendente` já passa hoje (preservação).
  - `uses the singular month`: com `warrantyMonths: 1`, `Prazo` é `1 mês`. **Reprova hoje:** `1 meses`.

  **Preservação:** uma linha por item, inclusive itens repetidos do mesmo RMA (spec `:82-93`); `Em garantia` e `Fora de garantia`; vencimento `20/04/2026`; o texto `Cálculo automático na data de entrada, sem override manual. Compra desconhecida mantém a garantia pendente.`. Nenhum cálculo de prazo no cliente. Os testes dos helpers (`rma-detail.spec.ts:51-65`) não são recriados.
- [ ] **Step 2: Rodar e ver falhar.**
- [ ] **Step 3: Implementar** só o caso `warranty`.
- [ ] **Step 4: Repetir o comando.** Esperado: todos PASS.
- [ ] **Step 5: Commit.** `git add` dos três **Files**. `git commit -m "feat(relatorios): garantia por produto com compra, entrada e vencimento distintos (NAV-98)"`.

### Task 9: Tempo por etapa e devoluções com escopo explícito

**Files:**
- Modify: `frontend/src/app/pages/reports/reports.component.html` (casos `aging` e `returns`).
- Modify: `frontend/src/app/pages/reports/reports.component.compositions.spec.ts` (blocos `describe('stage time report')` e `describe('returns report')`).

**Interfaces:**
- Consumes: `activeRmas()`, `aging()`, `returns()`, `duration()` e `formatInstant()`, sem mudança de cálculo.
- Produces:
  - **Tempo por etapa:** título `Tempo por etapa atual`. Linha de escopo `X RMAs em andamento considerados · Y encerrados fora do cálculo`, com `Y` = `rmas().length - activeRmas().length` e o trecho de `Y` omitido quando zero. Cabeçalhos do resumo: `Etapa`, `RMAs`, `Tempo médio na etapa`, `Maior tempo na etapa`. Cabeçalhos do detalhe: `RMA`, `Cliente`, `Etapa`, `Início na etapa (São Paulo)`, `Tempo decorrido`. As tabelas ficam em `.table-wrap`.
  - **Devoluções:** `N RMAs devolvidos` e o texto `'Somente RMAs com status atual Devolvido. O período filtra a data de entrada do RMA, não a data de expedição.'`. Colunas `RMA`, `Cliente`, `Entrada`, `Expedição`, `Transportadora`, `Rastreio`.

- [ ] **Step 1: Escrever os testes novos:**
  - `states how many closed RMAs were left out`: com 2 ativos e 1 encerrado, aparece `'2 RMAs em andamento considerados · 1 encerrado fora do cálculo'`, e o título do painel é `Tempo por etapa atual`. **Reprova hoje:** só o texto genérico, com título “Aging” (`html:82-83`).
  - `labels average and maximum per stage`: os cabeçalhos do resumo são `['Etapa', 'RMAs', 'Tempo médio na etapa', 'Maior tempo na etapa']`. **Reprova hoje:** `Quantidade`, `Tempo médio`, `Maior tempo`.
  - `explains the return scope and period inside the panel`: o `tabpanel` de Devoluções contém `'O período filtra a data de entrada do RMA, não a data de expedição.'` e `'1 RMA devolvido'`. **Reprova hoje:** o período só aparece no formulário.
  - `separates RMA and client in both tables`: a coluna `Cliente` tem `Cliente Alfa` separado do código. **Reprova hoje:** `RMA / Cliente`.

  **Preservação:** `[data-stage="IN_DIAGNOSIS"]` com `2`, `3h 0min` e `4h 0min` (spec `:95-105`); `RMA-CLOSED` ausente; o vazio de ativos mantém um caso próprio (`Nenhum RMA em andamento nos filtros selecionados.`); devoluções sem `RMA-REAL` (`:107-117`); `Não informada` e `Não informado` para transportadora e rastreio; `Nenhuma devolução nos filtros selecionados.`.
- [ ] **Step 2: Rodar e ver falhar.**
- [ ] **Step 3: Implementar** só os dois casos, sem gráfico.
- [ ] **Step 4: Repetir o comando.** Esperado: todos PASS.
- [ ] **Step 5: Commit.** `git add` dos dois **Files**. `git commit -m "feat(relatorios): tempo por etapa e devolucoes com escopo explicito (NAV-98)"`.

### Task 10: Conferência final (sem commit)

- [ ] **Step 1: Suíte completa e build.**
  ```bash
  npm --prefix frontend test -- --watch=false --runner-config 'C:\Users\joseh\AppData\Local\Temp\vitest-runner.config.mjs'
  npm --prefix frontend run build
  ```
  Esperado: zero falhas e build com saída 0. Registrar os avisos de orçamento antes e depois, sem aumentar limites.
- [ ] **Step 2: Escopo do diff.** No início da etapa, guardar `etapa6_base=$(git rev-parse HEAD)` (Git Bash). No fim:
  ```bash
  git diff --check "$etapa6_base"
  git diff --name-only "$etapa6_base"
  git diff "$etapa6_base" -- backend frontend/src/app/core frontend/src/app/app.routes.ts frontend/src/styles.css frontend/src/app/shared
  ```
  Esperado: `--check` sem erro; só os **Files** das tarefas; o último comando sem diff.
- [ ] **Step 3: Busca de resíduos** (PowerShell, leitura):
  ```powershell
  Get-ChildItem frontend/src/app/pages/dashboard,frontend/src/app/pages/notifications,frontend/src/app/pages/reports -File |
    Where-Object { $_.Name -match '\.component\.(html|ts)$' } |
    Select-String -Pattern 'RMA\(s\)','consultado\(s\)','stat-card','class="meter','Aging','Exportar','Regra desativada','title\]="severityLabels','icon="edit"'
  ```
  Esperado: nenhuma ocorrência. `Consulta em tela.` continua no template.
- [ ] **Step 4: Relatar limites.** A conferência autenticada não foi feita. Testes e build não substituem o roteiro abaixo. F1 continua aberto.

## Critérios de aceite

1. O dashboard não mostra zeros nem vazios antes do primeiro sucesso ou depois de uma falha, e tem “Tentar novamente”. Os indicadores dizem o que contam e sobre qual conjunto. O percentual de garantia continua, com numerador, denominador, pendentes e escopo. Não há barras decorativas nem total somado de entidades diferentes.
2. A fila prioritária contém só RMAs em andamento, na ordem atual, e cada código leva a `/rmas?rma=<id>`. A auditoria mostra status, autor, instante e nota separados, com uma entrada por evento.
3. Caixa, preferências, regras e falhas têm carga, falha com nova tentativa e vazio próprios (“Nenhuma preferência disponível.”, “Nenhuma regra disponível.”). A resposta antiga da caixa não substitui a atual. A troca de filtro inicia uma primeira carga. O vazio com filtro oferece “Mostrar todas”. Os limites de 100 notificações e de 50 + 50 falhas aparecem na tela.
4. Cada notificação tem um título acionável só quando o destino é interno. Marcar como lida e adiar são secundárias. O adiamento ativo é identificado e o vencido não aparece. O sucesso de adiar informa o fim. As abas funcionam por teclado.
5. Cada preferência mostra exatamente uma situação: Recebendo, Silenciado, Desativado pela administração ou Obrigatório, com a precedência definida e sem prometer entrega.
6. As regras são lidas num resumo (inclusive “Nenhum destinatário”) e editadas num formulário em seções, com Cancelar à esquerda, numa única gravação confirmada, com os mesmos seis campos e o mesmo conjunto de destinatários. Cancelar não grava. A gravação pendente não duplica nem fecha. Abrir outra regra não herda valores.
7. Os relatórios mostram período (do servidor), status, cliente, instante de geração e contagem de RMAs. A validação de período fica junto das datas, com ajuda e erro associados, sem nova tentativa. O tipo de relatório fica em abas com teclado, sem nova consulta.
8. O laudo é um documento por RMA, com os rótulos do detalhe. Garantia, tempo por etapa e devoluções separam os campos e explicam o escopo. Regras, cálculos e textos preservados continuam valendo.
9. Cada tarefa ou subtarefa tem um commit próprio, testes novos com o vermelho identificado, preservação separada, suíte e build passando com a saída relatada. Backend, contratos, rotas, `core`, `shared` e CSS global ficam sem alteração.

## Roteiro manual para o usuário

Backend em `localhost:8080`, frontend com `npm --prefix frontend start -- --port 4300`, login feito pelo próprio usuário. Conferir em **1440 px e 320 px**, com zoom de 200% e teclado. Tabelas podem rolar por dentro; a página não deve ter rolagem horizontal.

1. **Dashboard, ADMIN:**
   - A linha de indicadores tem escopo legível, e o percentual de garantia aparece com `X de Y itens · Z pendentes`.
   - Cadastros mostra os três totais separados.
   - A fila prioritária não tem RMA concluído, devolvido ou irreparável.
   - Abrir um código da fila, da auditoria e de Últimos RMAs: o RMA certo abre na lista.
   - As tabelas rolam por dentro em 320 px.
   - Com o backend desligado na abertura: falha, “Tentar novamente”, religar e recuperar.
2. **Dashboard, TECHNICIAN, SERVICE_DESK e VIEWER:** sem total de usuários e sem erro de permissão.
3. **Caixa de entrada (todos os perfis):**
   - O contador “N não lidas” aparece na aba e no sino com o mesmo número.
   - Alternar os dois filtros, também com respostas lentas (aba de rede com throttling) e depois de uma falha.
   - Vazio com filtro e “Mostrar todas”. Texto do limite de 100.
   - Abrir pelo título: altura do alvo e foco visível.
   - Marcar como lida. Adiar por 1 hora (a mensagem informa o fim), marcar “Mostrar adiadas” e conferir “Adiada até”. Marcar todas como lidas e conferir que as adiadas também ficaram lidas.
   - Abas por setas, Home e End.
4. **Preferências:**
   - Silenciar e reativar um alerta silenciável.
   - Como ADMIN, tornar esse alerta obrigatório: para o usuário que o silenciara, a situação passa a “Obrigatório”.
   - Desativar uma regra: aparece “Desativado pela administração”.
   - VIEWER também consegue silenciar.
5. **Regras (ADMIN):**
   - O resumo é legível sem controles, e uma regra sem destinatários mostra “Nenhum destinatário”.
   - Editar uma regra e cancelar: nada mudou. Abrir outra: valores próprios.
   - Editar perfis, responsável, e-mail e silenciamento e salvar: o resumo e a “Atualização” mudam, com um único envio na aba de rede.
   - Com o backend desligado durante o salvamento, o formulário continua com os valores.
   - Teclado: Enter envia; Escape e foco seguem a pendência F1.
6. **Falhas (ADMIN):** a origem é legível; o texto do limite 50 + 50 aparece; o erro completo aparece com quebra de linha; a falha da lista é distinta de “Nenhuma falha registrada.”.
7. **Relatórios (ADMIN, TECHNICIAN, VIEWER; SERVICE_DESK sem acesso pela rota):**
   - Consultar com período, status e cliente. O resumo mostra o período devolvido pelo servidor e os filtros.
   - Alterar um filtro sem consultar: o resumo continua o anterior.
   - Intervalo invertido e período de 367 dias mostram o erro junto das datas, sem “Tentar novamente”. O leitor de tela anuncia a ajuda e o erro.
   - Alternar as quatro abas por clique e teclado, sem nova requisição (aba de rede).
8. **Composições:**
   - Laudo com textos longos de vários parágrafos em 320 px.
   - Garantia com compra desconhecida (Pendente, Desconhecida, Sem data da compra) e prazo de 1 mês.
   - Tempo por etapa com encerrados fora do cálculo e média diferente do máximo.
   - Devoluções com o recorte explicado e o status filtrado diferente de Devolvido.

## Decisões tomadas na elaboração, sem nova decisão do usuário

São propostas do autor do plano, já ajustadas pela revisão. Não são acordos atribuídos ao usuário. Cada uma pode ser revertida antes da tarefa correspondente.

1. **Dashboard:** manter o percentual de garantia existente, com `X de Y itens · Z pendentes` e o escopo “em todos os RMAs registrados”. Retirar só as barras decorativas. Não restringir o recorte aos ativos: isso seria um cálculo novo.
2. **Dashboard:** mostrar clientes, produtos e usuários (este só para ADMIN) separados, sem o total somado. É decisão de apresentação: os três números permanecem.
3. **Dashboard:** excluir RMAs encerrados da fila prioritária. É uma alteração de comportamento declarada. Manter “Últimos RMAs” (backlog D1). A atualização manual fica no backlog (D3).
4. **Notificações:** o título acionável substitui o botão primário repetido “Abrir RMA” e só aparece para destino interno. A severidade continua por ícone mais texto para leitor de tela, sem `title` nativo.
5. **Notificações:** esconder “Adiada até” quando o adiamento venceu, usando `SlaClockService.now` como relógio e testando o instante exato do vencimento.
6. **Notificações:** dizer na mensagem de sucesso que “Marcar todas” inclui as adiadas, como o servidor faz.
7. **Preferências:** precedência `desativado → obrigatório → silenciado → recebendo`. “Obrigatório” significa “não silenciável”, e o silenciamento antigo é ignorado quando o usuário for destinatário de uma regra ativa. Não oferecer “Reativar” em alerta obrigatório. Adiar continua permitido.
8. **Regras:** trocar a gravação imediata por resumo mais formulário com Salvar e Cancelar, como o estudo pede, com o contrato da Tarefa 4b. Exige mudar um teste existente, de forma deliberada.
9. **Regras sem destinatário:** só o resumo factual “Nenhum destinatário”. O aviso explicativo foi para o backlog (N4).
10. **Limites:** informar os limites do servidor: 50 falhas de eventos + 50 de e-mail, e até 100 notificações na caixa.
11. **Relatórios:** tipo em abas com teclado sobre `form.controls.report`, resumo dos filtros submetidos e validação local junto das datas. A consulta inválida continua ocultando o resultado anterior.
12. **Laudo:** documento estruturado por RMA, uma das formas indicadas pelo estudo (`:183`), sem emissão, persistência ou exportação.
13. **Tempo por etapa:** sem gráfico, porque a tabela já compara os valores disponíveis.
14. **Escrita:** “Tempo por etapa” no lugar de “Aging”, plurais reais no lugar de “(s)”, sem mudança de cálculo.

## Fora de escopo e backlog justificado

- **D1 — Últimos RMAs no dashboard.** O estudo (`:127`) desaconselha uma segunda lista de RMAs se ela não orienta ação diferente. Remover é retirar informação existente e precisa de decisão do usuário.
- **D2 — Indicadores do dashboard no servidor.** Hoje `listBoard()` traz todos os RMAs de todo o período só para contar e ordenar. Um endpoint de resumo, com período e escopo definidos, tiraria o cálculo do cliente. Exige backend.
- **D3 — Instante e atualização manual do dashboard.** Mostrar “Atualizado às …” e um botão Atualizar é comportamento novo.
- **D4 — Candidatos herdados das etapas anteriores.** Garantia média dos produtos e número de administradores (`plano-etapa-3:78-79`), e a eventual migração do valor em estoque (`revisao-plano-etapa-5:105`). Eram candidatos ao dashboard da etapa 6, não obrigações. Não entram agora, porque exigiriam novos indicadores ou cálculo no servidor e decisão do usuário.
- **N1 — Paginação ou mudança do limite de 100 notificações** (`NotificationService.java:38`). A tela só informa o limite.
- **N2 — Desfazer silenciamento de alerta que virou obrigatório.** O servidor permite, mas a utilidade depende de a regra voltar a ser silenciável.
- **N3 — Disponibilidade do resumo de não lidas.** `refreshSummary()` absorve o erro e conserva o último valor (`notification.service.ts:34-38`). Distinguir “resumo indisponível” exigiria mudar o serviço.
- **N4 — Aviso explicativo para regra sem destinatário** (“não é entregue a ninguém”). Fica para decisão posterior, sem validação nova.
- **R1 — Aviso de filtros alterados e não consultados nos relatórios.** O resumo aplicado já resolve a ambiguidade principal.
- **R2 — Exportação dos relatórios.** Continua indisponível no produto. Nenhum botão.
- **F1 — Coordenação de foco nos diálogos** (herdada da etapa 5). O diálogo de regras segue o padrão atual de `aria-modal` sem confinamento. A pendência continua aberta.
- O shell e o sino de notificações, outras telas, `core`, `shared`, rotas, CSS global e backend.

## Autorrevisão do plano

- Cobertura do estudo: Dashboard → 1a e 1b; Notificações → 2a, 2b, 3, 4a, 4b e 5; Relatórios → 6 a 9; decisões globais e estados → restrições, contrato de carga, contrato de abas, tabela de recarga e roteiro.
- Cada tarefa tem **Files**, **Interfaces**, testes novos com o motivo do vermelho, preservação separada, comando, implementação mínima e um commit. As partes que já passam hoje estão marcadas como preservação dentro dos testes:
  - a mensagem de erro e o `getUserSummary` por perfil no dashboard;
  - o `50%` de garantia e as duas entradas de auditoria do mesmo RMA;
  - a abertura por rota interna e a recarga depois de adiar;
  - a ausência de botão nas preferências obrigatórias;
  - os seis campos e a mensagem de sucesso das regras;
  - o erro completo das falhas;
  - a troca programática do tipo de relatório e o instante de geração;
  - a mensagem e o `expectNone` da validação;
  - `Pendente` na garantia.
- Cada cenário de falha tem gatilho: falha inicial por `throwError`; falha depois de sucesso por toggle de filtro (caixa) ou por troca de aba e retorno (preferências, regras); ordem por `Subject`; instante por `clock.set`. O dashboard não tem recarga depois de sucesso, e isso está declarado.
- Nenhum cálculo novo: os números vêm das mesmas funções e respostas. Os textos de escopo e limite só descrevem regras do código citado.
