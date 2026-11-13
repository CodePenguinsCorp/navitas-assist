# Revisão do plano da etapa 5 — Operações especializadas

**Plano revisado:** `docs/ux/2026-11-07-plano-etapa-5-operacoes.md` (525 linhas, tarefas 1–11 com 6a/6b e 7a/7b).
**Base conferida:** `main` em `f889f70`, leitura de `frontend/src/app` (peças, painéis do RMA, protocolos, cabeçalho, ação de linha, `styles.css`, `core/*`), backend citado pelo plano, estudo de UI/UX e planos das etapas 3 e 4.

**Precedência:** onde este documento diverge do plano, vale este documento. Os trechos "Substituir por" são o texto que o implementador deve seguir no lugar do trecho citado.

## Veredito

**Aprovar com ajustes.** As evidências do inventário estão quase todas corretas. As regras de negócio (saldos, estorno, matriz de reservas, impedimentos, progresso e conclusão de protocolos) estão bem descritas e conferem com o backend. O plano não pode ser executado como está escrito: ele se declara não executável e tem seis lacunas de severidade alta. São elas: o momento de recarga do catálogo de reservas, a remoção não autorizada de um indicador, mensagens por campo que entram em conflito com specs e com "não mudar `save`", a formatação incorreta dos limites de medição, a estimativa negativa sem explicação e a forma de disparar os cenários "falha após sucesso". Também há escopo inflado na Tarefa 11 e na Tarefa 1.

## Problemas por severidade

### Alta

**A1. O plano proíbe a própria execução.** Plano `:3` ("a solicitação atual não autoriza implementar nem commitar código") e `:19` ("Esta entrega escreve somente…").
- Linha 3, substituir a última frase por: "A implementação e os commits por tarefa estão autorizados conforme Global Constraints."
- Linha 19, substituir o item inteiro por: "**Escrita na execução:** somente os **Files** de cada tarefa. Não alterar outros documentos, o estado das etapas nem este plano. Testes e build devem ser executados de fato e relatados com a saída real."

**A2. Catálogo de reservas desatualizado (6a).** Hoje `load()` também relê o catálogo depois de cada reserva e de cada ação (`rma-parts-panel.component.ts:181,200,216-218`). Isso mantém atualizado o texto "disponível: X" das opções (`:143-147`). O plano (`:236`) cria `loadCatalog()` sem dizer quando ela é chamada, e quem implementar tende a chamá-la só na troca de RMA.
- Acrescentar em 6a **Interfaces**: "`load(rmaId)` continua chamando `loadCatalog()` a cada execução, como hoje (abertura, troca de RMA, depois de reservar e depois de cada ação), sempre que `canCreateReservation()`. Cada chamada cancela a leitura anterior do catálogo. `retryCatalog()` chama somente `loadCatalog()`."
- Acrescentar em 6a **Preservação**: "Depois de `reserve` ou `runAction` com sucesso, `list` é chamado de novo (contagem de chamadas +1)."

**A3. Remoção de "Valor em estoque" sem decisão do usuário (Task 2).** Plano `:81,154,159,458,499`. O próprio plano registra essa remoção como proposta do autor (`:496-499`). A decisão "indicadores avaliados por tela" não autoriza retirar informação existente (`parts.component.html:24-28`, `parts.component.ts:120`).
- Tabela de indicadores, linha "Valor em estoque", substituir por: "Manter o valor na linha compacta, sem cartão: `Valor em estoque (saldo × custo unitário atual): R$ X`. Usar o mesmo `stockValue` sobre `parts()` completo, oculto na primeira carga e na falha. Mover o cálculo para o backend ou dashboard fica no backlog."
- Teste `shows scoped alerts without statistic cards` (`:154`), substituir as asserções por: `expect(text).toContain('No estoque completo:'); expect(line.textContent).toContain('Valor em estoque'); expect(root.querySelector('.stat-card')).toBeNull()`. Filtrar não muda nenhum dos três números.
- Task 2 **Files** (`:144`): retirar "`stockValue :120`". Conferência final (`:456,458`): retirar `'Valor em estoque'` do padrão de busca.
- Decisões (`:499`), substituir por: "Manter alertas de mínimo/pendência e o valor em estoque em uma linha global identificada, sem cartões."

**A4. Mensagens por campo em conflito com specs e com "não mudar `save`".**
- **Task 4** (`:195`): `saveMovement` grava as três validações em `modalErrorMessage` (`parts.component.ts:216-227`), e o spec existente confere esse sinal (`parts.component.spec.ts:80`). Acrescentar em **Interfaces**: "`protected readonly movementFieldErrors = signal<{ quantity: string; reason: string }>({ quantity: '', reason: '' })`. As três validações locais gravam aqui, e não em `modalErrorMessage`, que fica só para erro do servidor. Limpar ao abrir o diálogo e a cada envio." Acrescentar em **Files**: `Modify: parts.component.spec.ts` (`:80`: trocar a asserção para a mensagem exibida junto do campo Motivo; é mudança deliberada).
- **Task 7a** (`:298` "Não mudar `save`"): `save()` grava uma mensagem geral na invalidação (`rma-block-panel.component.ts:72`), e ela duplicaria o alerta de cada campo. Substituir "Não mudar `save`" por: "Em `save()`, mudar somente o ramo inválido: manter `markAllAsTouched()` e remover `this.error.set(...)` da linha 72. Não mexer no resto de `save`." Acrescentar ao teste `shows trimmed required errors…`: `expect(dialog.querySelector('p.field-error[role="alert"]')).toBeNull()` depois do envio inválido.
- **Task 6b** (`:269`): o mesmo vale para `reserve()` (`rma-parts-panel.component.ts:163-166`). Substituir por: "No ramo inválido, manter `markAllAsTouched()` e não gravar `errorMessage`. A guarda `submitting()` passa a apenas retornar."

**A5. Limites de medição com precisão errada (Task 9).** `formatQuantity` arredonda para no máximo 3 casas (`part-ui.ts:43`), e os limites aceitam até 6 (`protocols.component.ts:15,248`). Com `formatQuantity`, um mínimo de `0.000125` apareceria como `0`.
- Acrescentar em Task 9 **Interfaces**: "Helper local `formatProtocolLimit(value: number, decimalPlaces: number | null, unit: string | null): string` com `Intl.NumberFormat('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: decimalPlaces ?? 6 })` mais a unidade. Não usar `formatQuantity`." O teste `keeps expected range…` ganha um caso com `decimalPlaces: 6`, `minValue: 0.000125` → `'Mínimo: 0,000125 V'`.

**A6. Estimativa negativa sem explicação (Task 4).** O servidor recusa movimento em que `onHand` ficaria abaixo de `reserved` (`PartStockService.java:229-232`). O plano (`:197`) manda exibir o número negativo sem dizer o que ele significa.
- Substituir a última frase de **Preservação** de `:197` por: "Se `availableAfter < 0`, exibir os números e, abaixo deles, o texto `O disponível estimado ficaria negativo; o registro deve ser recusado por saldo insuficiente.`. Não desabilitar o envio. A resposta do servidor continua sendo a decisão, e o input é preservado no erro." Novo caso de teste: saída de 7 sobre 10/4/6 mostra o texto, e `registerMovement` continua sendo chamado ao enviar.

### Média

**M1. Cenários "falha após sucesso" sem gatilho definido.** Tarefas 1 (`:125`), 5 (`:218`), 6a (`:239`) e 8 (`:335`). `load()` é privado e não existe retry depois de um sucesso. Usar estes gatilhos:
- T1: sucesso inicial com `Capacitor`, depois `savePart` (ou `saveMovement`) com sucesso e a recarga de `list` com erro.
- T5: histórico da peça A com sucesso, fechar, reabrir A com `listMovements` em erro. Para "registro antigo", usar `confirmReversal` com sucesso e a recarga do histórico com erro.
- T6a: sucesso com reserva, depois `runAction` com sucesso e a recarga de `getRmaParts` com erro. Para troca de contexto, `setInput('rmaId', 8)` com erro.
- T8: sucesso no RMA 4, depois `setInput('rmaId', 5)` com `listExecutions` em erro. O retry repete o RMA 5.

**M2. Bloqueio de escrita durante a atualização (T1) não tem teste e é inflado.** Plano `:89` ("com ações de mutação desabilitadas durante a carga") e `:136` ("Desabilitar ações de escrita sobre snapshot em atualização"). Substituir por: "A atualização depois de um sucesso mantém os dados e mostra `Atualizando estoque...` com `role="status"`. As ações continuam habilitadas, porque o servidor decide concorrência e saldo." Cortar o item correspondente do roteiro (`:491`, "impedir operação sobre snapshot…").

**M3. Inflação na Task 11: `hiddenMeasurementError`.** Plano `:413,420,423,429`. É um defeito anterior: um adicional de medição inválido continua bloqueando a publicação depois da troca de tipo. Tratar isso exige decisão de produto (limpar o valor ou explicá-lo).
- Em **Interfaces**, substituir o trecho "Se o erro está apenas num adicional… Não troca tipo automaticamente." por: "Se nenhum controle inválido do item estiver visível, `revealFirstInvalidItem` seleciona o item e foca o seletor Tipo. A mensagem geral atual (`protocols.component.ts:203`) continua sendo a única explicação."
- Cortar o teste `identifies an invalid measurement field hidden by a type change`. Na Preservação, manter apenas "erro em campo oculto continua impedindo o envio (`updateTemplate` não chamado)".
- O tratamento específico vai ao backlog (ver tabela).

**M4. Rótulo duplicado "Registrar resultado" (Task 10).** O plano usa esse texto para o botão que abre o editor do item (`:396`) e para o envio (`:397` "Cancelar antes de Registrar resultado"), e outros itens mostram o mesmo botão ao mesmo tempo. Substituir: o envio mantém **"Salvar resultado"** (`rma-protocols.component.html:72`). A legenda do `fieldset` (`:399`) passa a ser `Resultado de <título do item>`. Em `:397`, ler "Cancelar antes de Salvar resultado".

**M5. Matriz de perfis nos impedimentos exige mudar o mock existente (7a).** `rma-block-panel.component.spec.ts:11-17` usa `hasAnyRole: () => writable`. Acrescentar em 7a Step 1: "Substituir `writable` por `let role: UserRole = 'TECHNICIAN'` e `hasAnyRole: (roles: UserRole[]) => roles.includes(role)`. O teste VIEWER existente (`:63-70`) passa a usar `role = 'VIEWER'`. Parametrizar `ADMIN`/`SERVICE_DESK`/`TECHNICIAN` com formulário e `VIEWER` sem formulário."

**M6. Specs consumidores fora dos comandos.** `rmas.component.detail.spec.ts:280-302` monta os painéis de peças, protocolos e o histórico de impedimentos, e `rmas.component.html:318` também usa `app-rma-block-history`. Isso contradiz o plano em `:320`, que trata o painel como único consumidor. Nos Steps 2/4 das tarefas 6a, 6b, 7b, 8, 9 e 10, acrescentar `--include 'src/app/pages/rmas/rmas.component.detail.spec.ts'`. Em 7b Step 4, substituir "inclusive painel consumidor" por "inclusive `rma-block-panel` e o detalhe de RMAs".

**M7. Confirmação de estorno sem lugar definido (Task 5).** A coluna de ações (`parts.component.html:370-380`) não comporta rótulo, consequência e dois botões de 40 px. Acrescentar em Step 3: "A confirmação é uma linha própria `<tr>` logo abaixo do movimento, com uma `<td>` de `colspan` igual ao número de colunas. A validação e o erro do estorno continuam em `modalErrorMessage` (o spec `:93` não muda), mostrados dentro dessa linha com `role="alert"`. O erro de leitura do histórico vai para `historyLoadErrorMessage`. A unidade das variações é concatenada no template (`signedQuantity(v) + ' ' + part.unit`), sem alterar `formatSignedQuantity` (`part-ui.ts:47`, coberto por `part-ui.spec.ts`)."

**M8. Decisões em aberto na 6a.**
- Substituir o trecho "Após falha principal ocultar operações…" (`:249`) por: "Com `loadFailed()`, ocultar resumo, lista, ações por reserva **e** o formulário de nova reserva, até uma recarga com sucesso."
- A regra "Callbacks de escrita conferem o id capturado" (`:236`) precisa de teste. Acrescentar: `ignores a write result after switching RMA` — com `reserve` pendente no RMA 7, trocar para o 8 e só então emitir o sucesso; `getRmaParts` não é chamado de novo com 7 e o painel do 8 não mostra a mensagem de sucesso.

**M9. Efeito dos protocolos (Task 8).** O `effect` atual não usa `untracked` (`rma-protocols.component.ts:137`). Em `:332`, substituir "usando `untracked` se…" por: "Obrigatório: `effect(() => { const id = this.rmaId(); untracked(() => this.loadExecutions(id)); })`, como em `rma-parts-panel.component.ts:156-159`."

**M10. Relógio controlado na 7b.** `SlaClockService.now` é somente leitura (`sla-clock.service.ts:7-8`). Acrescentar em 7b Step 1: "`const clock = signal(Date.parse('2026-10-20T12:00:00Z'))`; provider `{ provide: SlaClockService, useValue: { now: clock.asReadonly() } }`, como em `rmas.component.detail.spec.ts:78`; avançar com `clock.set(...)` e `fixture.detectChanges()`."

**M11. Foco na Task 11.** Acrescentar em **Interfaces**: "O foco depois da renderização usa `afterNextRender(() => …, { injector: this.injector })`. Nos testes, `fixture.detectChanges(); await fixture.whenStable();` antes de ler `document.activeElement`."

### Baixa

**B1. Inventário parcialmente impreciso.**
- Linha `:46`: Cancelar já fica desabilitado durante a gravação (`parts.component.html:263,304`). Sem guarda estão apenas o Fechar (`:203,279,320`), o overlay (`:196,272,313`) e a reentrada direta nos métodos.
- Linha `:50`: Confirmar já fica desabilitado por `submitting()` (`:375`); a lacuna é a reentrada em `confirmReversal`.
- Consequência: nas tarefas 3, 4 e 5, clicar no Cancelar ou no submit desabilitado é preservação. O vermelho vem do Fechar, do overlay e da chamada direta do método.

**B2. Nome do método de limpeza.** Peças só tem busca. Usar `clearSearch()`, como na lista em memória da etapa 3 (`protocols.component.ts:132`, `protocols.component.html:51`), em vez de `clearFilters()` (`:121,129`).

**B3. Rótulo "Concluir" entre as tarefas 9 e 10.** Os testes da Task 9 devem localizar o botão com `textContent.trim().startsWith('Concluir')`, porque a Task 10 o renomeia para "Concluir protocolo".

**B4. Consumidores de `protocolProgress*`.** Já conferido: só `rma-protocols.component.ts:15-16,211-217`. Substituir "Antes de mudar, buscar todos os consumidores…" (`:362`) por "Consumidor único: `rma-protocols`."

**B5. Estrutura do formulário inline de reserva (6b, `:273`).** Usar `form.form-grid` > `fieldset.form-section` (legenda "Reservar peças") com Peça e Quantidade, Observação em `field-group--full` e `.form-actions.form-actions--full` contendo apenas "Reservar". Remover `.parts-reserve`. A coluna única abaixo de 720 px já vem de `styles.css:1769,1807-1809`; não duplicar no CSS local.

## Testes classificados como novos que já passariam hoje (tratar como preservação)

- T3 `keeps the form…`: clicar em Cancelar durante a gravação (botão já desabilitado). Vermelho real só no Fechar, no overlay e em `savePart()` repetido.
- T4 `keeps a pending movement…`: clicar no submit repetidamente (desabilitado). Vermelho real só em `saveMovement()` direto; o fechamento já foi coberto pela T3, como o próprio plano admite.
- T5 `keeps one pending reversal…`: clicar em Confirmar (desabilitado). Vermelho real em `confirmReversal()` direto.
- T7a `disables the new cancel action…`: Escape e `close()` com escrita pendente já são bloqueados (`rma-block-panel.component.ts:56`, spec `:111-112`). Vermelho real só no `disabled` do novo botão.
- T11 `switches items without losing unsaved fields`: preservar os valores já passa hoje. O vermelho é só a ausência dos resumos selecionáveis, como o plano reconhece.
- T2 `names row actions…`: `tooltip.textContent === 'Editar'` já passaria com o componente compartilhado. O vermelho é o `aria-label` com o registro.

## Decisões: manter / cortar / backlog

| Item | Decisão | Justificativa e forma |
| --- | --- | --- |
| Impacto estimado do movimento (T4) | **Manter, reduzido** | Pedido pelo estudo ("impacto antes/depois quando calculável", `estudo:149`). Só aritmética do movimento manual sobre o saldo carregado, com o aviso de estimativa e a nota de negativo (A6). Sem outro cálculo. |
| Desabilitar ações durante a atualização (T1) | **Cortar** | Sem teste e sem requisito; o servidor decide (M2). |
| Remover "Valor em estoque" (T2) | **Cortar a remoção** | Manter na linha compacta (A3). |
| Calcular o valor em estoque no backend ou dashboard | **Backlog (etapa 6)** | Hoje o cálculo é local e correto sobre a lista completa. |
| Resumo por item + edição focada (T11) | **Manter** | Pedido pelo estudo (`:163`) e adiado explicitamente pela etapa 3 (`plano-etapa-3:364,420`). Resumo limitado a número, etapa, título, tipo, Obrigatório/Opcional e Exige evidência. |
| `hiddenMeasurementError` e o teste do campo oculto (T11) | **Cortar → backlog** | Defeito anterior que exige decisão: limpar adicionais ao trocar o tipo ou explicá-los (M3). |
| Foco no resumo depois de remover e no campo inválido revelado (T11) | **Manter** | Sem isso o foco se perde; o custo é pequeno (M11). |
| Textareas de instruções e esperado (T11) | **Manter** | Pedido pelo estudo ("espaço adequado"). |
| Bloquear seleção, Adicionar e Remover durante a publicação (T11) | **Manter** | Coerente com a estabilidade da etapa 3. |
| Mensagens por campo nos impedimentos (7a) | **Manter** | Não é validação nova: usa os validadores existentes (`rma-block-panel.component.ts:31-32`). Remover só a mensagem genérica (A4). |
| Unidade no rótulo de Quantidade da reserva (6b) | **Manter** | Pequeno, sem cálculo, com dado do catálogo. |
| `requiresEvidence` / `requiresJustification` (T10) | **Manter** | Só informam as regras do servidor (`ProtocolExecutionService.java:94-101,204`), sem `required` nem bloqueio. |
| Progresso A/B via `requiredItems - pendingRequiredItems` (T9) | **Manter** | Os dois números vêm do servidor (`:238-239,245-250`). Não derivar elegibilidade de conclusão. |
| Histórico de tentativas em `<details>` (T9) | **Manter** | Os dados já chegam (`models.ts:683-684`); o estudo pede o histórico. |
| Conferência do id capturado nas escritas (6a, 8) | **Manter com teste** | M8. |
| F1 (coordenação global de foco) | **Backlog** | Concordo com a justificativa do plano. |

## O que está correto

- **Evidências.** Todas as âncoras de linha do inventário conferem, exceto as nuances de B1. Conferidas: `parts.component.html/ts`, `rma-parts-panel` (`:39`, `:57-58`, `:6-8`, `:206-217`), `rma-block-panel` (`:30-32`, `:39`, html `:4,13-31`), `rma-block-history:29-41`, `rma-protocols` (`:22,28,33-34,63-71`, ts `:137-139,168-169,231-238,245-250`), `protocol-ui.ts:34-40`, `protocols.component.html:97-103,171-246`, `models.ts:417-419,446,476,683-684`, `styles.css:35-36,1041-1065,1807-1809` e `rma-detail-modal.component.ts:68-91`.
- **Backend.** Estoque e estorno (`PartStockService.java:73-88,107-115`). Satisfação de obrigatórios (`ProtocolItemOutcome.java:8-9`, `ProtocolExecutionService.java:245-250`). Justificativa e evidência (`:94-101,204-205`). Conclusão com reprovação permitida quando todo obrigatório tem registro (`:132-145`). As restrições dos Global Constraints correspondem exatamente a esse código.
- **Regras preservadas.** Matriz de reservas por estado, encerramento e perfil (`rma-parts-panel.component.html:49-59`, ts `:135-137`). Estorno por `reverseMovement`, sem DELETE, mantendo o original. Proibição de recalcular saldos a partir de reservas. Permissões citadas (`parts.component.ts:114`, `rma-protocols.component.ts:119`). Custos visíveis para todos os perfis, como hoje.
- **Specs.** Os existentes afetados estão bem identificados: `parts.component.spec.ts`, mais o `:80` acrescentado por A4; `rma-parts-panel.component.spec.ts:53-55,69`; `rma-protocols.component.spec.ts:59`; `protocols.component.spec.ts:333-339`. O spec do histórico de impedimentos não existe e o de `protocol-ui` também não, como o plano afirma.
- **Padrões das etapas 1–4.** Uso correto de `app-page-header` (count/total), `button[appRowAction]` (o tooltip mantém o texto "Histórico" no DOM, então `parts.component.spec.ts:69` continua passando), `fieldset.form-section`, `expectCancelBeforePrimary` e Cancelar à esquerda. A recusa de `PagedList` e de debounce em listas em memória está certa. O `<dialog>` nativo dos impedimentos é preservado e F1 fica explícito.
- **Commits.** Um por tarefa, somente com os **Files** listados, sem coautoria e sem `git add .`. A conferência final não cria commit.
