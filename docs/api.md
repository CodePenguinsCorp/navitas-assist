# API

Fonte: `SecurityConfig.java` e os controllers em `backend/src/main/java/br/com/navitasassist`. "Autenticado" significa qualquer usuário com sessão; as demais permissões estão em [acesso-e-permissoes.md](acesso-e-permissoes.md).

Convenções:

- Prefixo `/api`; JSON, exceto onde indicado (CSV, PDF, `multipart/form-data`).
- Escritas (`POST`, `PUT`, `PATCH`, `DELETE`) exigem o header `X-XSRF-TOKEN` (ver `GET /api/auth/csrf`).
- Sem sessão: `401`; sem permissão: `403`; validação e regra de negócio: `400` com mensagem em português; não encontrado: `404`; consulta que passa do limite do banco (50 s): `503` com a mensagem "A consulta demorou mais do que o esperado e foi interrompida. Tente novamente ou use filtros mais específicos." (ver [visao-geral.md](visao-geral.md#limites-de-tempo)).
- Listagens paginadas: ver [visao-geral.md](visao-geral.md#paginação-das-consultas).
- S12: o parâmetro `query` aceita até 100 caracteres nas buscas de clientes, produtos, peças, perfis, usuários e OS (lista, resumo e quadro); o filtro salvo do Kanban segue o mesmo limite. A criação e a atualização de OS aceitam até 20 itens. Os limites recusam cargas excessivas com `400`, antes de executar a consulta ou persistir os itens. Modelos de protocolo mantêm o teto existente de 100 itens.
- Rotas de `/api/**` não listadas aqui exigem `usuarios.gerir` e `perfis.gerir`.

## Público e autenticação

| Rota | Permissão | Descrição |
| --- | --- | --- |
| `GET /health` | pública | Healthcheck. |
| `GET /api/auth/csrf` | pública | Cria o cookie CSRF se ausente (`204`). |
| `POST /api/auth/login` | pública | Login com usuário e senha; renova o cookie CSRF no sucesso (S9). Falhas recebem atraso progressivo por usuário e origem, sem bloqueio de conta (S1). |
| `POST /api/auth/logout` | autenticado | Encerra a sessão (`204`). |
| `GET /api/auth/me` | autenticado | Sessão atual: `{username, fullName, email, profileName, permissions}` (permissões efetivas); o login devolve o mesmo formato. |

## ordens de serviço

| Rota | Permissão | Descrição |
| --- | --- | --- |
| `GET /api/rmas` | `rma.ver` | Lista paginada (`query`, `status`, `page`, `size`) com só as colunas da tabela: `{id, code, clientName, items[{id, productName, productSku, batchNumber, serialNumber, warrantyStatus}], status, priority, entryDate}`. |
| `GET /api/rmas/summary` | `rma.ver` | Totais para os indicadores (`query`, `status`). |
| `GET /api/rmas/board/column` | `rma.ver` | Página da coluna: `{cards, total, hasMore, page, size}`. `status` obrigatório; `page=0`, `size=20`, máximo 100. |
| `GET /api/rmas/board/counts` | `rma.ver` | Agregações filtradas: `{statusCounts, total, highPriority, active, closed, waitingPart}`. |
| `PUT /api/rmas/{id}/board-position` | `rma.status` | Corpo `{status, afterId?, beforeId?}`; devolve cartão enxuto. Reordena ou muda de coluna usando as regras existentes de status. Exige CSRF. |
| `GET /api/rmas/board` | `rma.ver` | Cards do Kanban, sem paginação (aceita `query` e `status`), só com o que o card exibe e o que filtros e busca usam: `id`, `code`, `clientName`, `productName` (primeiro produto), `additionalItems`, `searchText` (SKU, lote e série de todos os itens e o nome dos demais), `warranty` (garantias efetivas distintas), `status`, `priority`, `entryDate`, `dueDate`, `dueSoonFrom`, `updatedAt`, `assigneeId`, `assigneeName`, `blockedAt` (início do impedimento aberto, nulo sem impedimento) e `currentStageEnteredAt`. Itens completos, `stagePeriods`, `deadline` e `currentBlock` vêm do detalhe (`GET /api/rmas/{id}`), lido ao abrir o card. Ver [kanban-payload.md](kanban-payload.md). |
| `GET /api/rmas/dashboard` | `rma.ver` | Indicadores do dashboard calculados no servidor: `statusCounts`, `initialQueueHighPriority`, `overdue` e `dueSoon` (OS abertas), `items`, `itemsInWarranty` e `itemsPendingWarranty` (todos os itens), `queue` (até 5 OS abertas por prioridade e entrada), `recent` (4 últimas atualizadas) e `statusEvents` (4 últimos eventos de status, cada um com `previousStatus`, nulo no primeiro registro da OS), sem históricos completos. |
| `GET /api/rmas/{id}` | `rma.ver` | Detalhe completo, lido ao abrir a OS (lista, Kanban e link `/rmas?rma=`). As escritas de OS devolvem o mesmo detalhe. |
| `GET /api/rmas/{id}/report.pdf` | `rma.ver` | Laudo final em PDF. |
| `POST /api/rmas` | `rma.abrir` | Abre uma OS com `items` obrigatório, de 1 a 20 produtos identificados por lote ou série. |
| `PUT /api/rmas/{id}` | `rma.editar` | Altera dados gerais, prioridade e data limite (`dueDate` / `clearDueDate`). Se `items` vier informado, deve conter de 1 a 20 itens; omitir a lista preserva os existentes. |
| `PUT /api/rmas/{id}/items/{itemId}/warranty` | `rma.editar` | Ajuste manual de garantia do item. |
| `PATCH /api/rmas/{id}/status` | `rma.status` | Muda o status. |
| `PATCH /api/rmas/{id}/status-history/{eventId}/note` | `rma.status` | Edita a observação (`note`, até 255 caracteres) de um evento do histórico de status; recusado em OS encerrada. |
| `PATCH /api/rmas/{id}/assignee` | `rma.responsavel` | Atribui, troca ou remove o responsável. |
| `GET /api/rmas/diagnosis/suggestions` | `rma.ver` | Sugestões para o diagnóstico: `{failureTypes, probableCauses}`, valores distintos já usados em outros diagnósticos (sem vazios, sem repetir por maiúsculas ou acentos), em ordem alfabética. |
| `PUT /api/rmas/{id}/diagnosis` | `rma.diagnosticar` | Registra ou altera o diagnóstico. `failureType` e `probableCause` são texto livre opcional de até 80 caracteres (aparados; vazio vira nulo), como a categoria do produto. |
| `POST /api/rmas/{id}/blocks` | `rma.impedimentos` | Inicia um impedimento. |
| `PATCH /api/rmas/{id}/blocks/{blockId}` | `rma.impedimentos` | Resolve aquele impedimento. |

O produto e sua identificação existem somente em `items[]`. O detalhe e a lista mantêm seus contratos JSON; `productName` no cartão do Kanban continua sendo o nome do primeiro item. Não há item sintetizado sem ID. Busca por produto, SKU, lote e série considera todos os itens, sem consultar campos de produto na OS. As rotas e permissões permanecem iguais.

Os contratos de criação, edição e detalhe não contêm `repairSummary`, `replacedPartsSummary`, `testSummary`, `shippedAt`, `carrier` nem `trackingCode`. Reparos, peças e protocolos usam as rotas estruturadas abaixo.

## Peças, reparo e protocolos nas ordens de serviço

| Rota | Permissão | Descrição |
| --- | --- | --- |
| `GET /api/rmas/{id}/repair` | `rma.ver` | Reparos e `totalServiceHours` (soma só os reparos ativos que informaram horas; `hours` ausente vem nulo). |
| `GET /api/suggestions/intervention-types` | `rma.ver` | Tipos de reparo já usados: lista de textos, sem vazios nem repetidos por maiúsculas ou acentos, em ordem alfabética. As sugestões iniciais (Ressolda, Limpeza, Regravação, Atualização de firmware, Troca de chicote, Outro) ficam na interface. |
| `GET /api/suggestions/block-categories` | `rma.ver` | Categorias de impedimento já usadas, no mesmo formato. |
| `GET /api/suggestions/part-units` | `pecas.ver`, `pecas.usar` ou `pecas.movimentar` | Unidades já usadas em peças e em componentes externos trocados, no mesmo formato (iniciais na interface: UN, PC, PAR, KIT, CX, KG, G, M, CM, MM, L, ML). |
| `GET /api/suggestions/part-locations` | `pecas.ver` ou `pecas.movimentar` | Localizações de estoque já usadas nas peças, no mesmo formato. |
| `GET /api/rmas/{id}/repair/external-components` | `rma.ver` | Componentes externos. |
| `POST /api/rmas/{id}/repair/external-components` | `pecas.usar` | Adiciona componente externo. |
| `POST /api/rmas/{id}/repair/interventions` | `rma.diagnosticar` | Registra reparo: `type` é texto livre obrigatório de até 80 caracteres (aparado), `hours` é opcional (positivas, até 3 casas). |
| `PUT /api/rmas/{rmaId}/repair/interventions/{id}` | `rma.diagnosticar` | Edita reparo ativo em OS aberta. |
| `POST /api/rmas/{rmaId}/repair/interventions/{id}/void` | `rma.diagnosticar` | Anula reparo com `{ reason }` obrigatório (até 1000). |
| `PUT /api/rmas/{rmaId}/repair/external-components/{id}` | `pecas.usar` | Edita componente externo ativo em OS aberta. |
| `POST /api/rmas/{rmaId}/repair/external-components/{id}/void` | `pecas.usar` | Anula componente externo com `{ reason }` obrigatório (até 1000). |
| `GET /api/protocols/rmas/{rmaId}/executions` | `rma.ver` | Execuções de protocolo da OS. |
| `POST /api/protocols/rmas/{rmaId}/executions` | `protocolos.executar` | Inicia execução. |
| `POST /api/protocols/executions/{executionId}/items/{itemId}/results` | `protocolos.executar` | Registra resultado de um item. |
| `POST /api/protocols/executions/{executionId}/complete` | `protocolos.executar` | Conclui a execução. |

## Clientes e produtos

| Rota | Permissão | Descrição |
| --- | --- | --- |
| `GET /api/clients` · `/api/products` | `cadastros.ver` | Lista paginada com filtros. A de clientes não traz endereço nem observações. |
| `GET /api/clients/options` · `/api/products/options` | qualquer uma de `cadastros.ver`, `rma.ver`, `rma.abrir`, `relatorios.ver`, `protocolos.ver`, `protocolos.catalogo` | Opções para seletores, sem paginação: clientes `{id, legalName}`, produtos `{id, sku, name}`. |
| `GET /api/clients/summary` · `/api/products/summary` | autenticado | Totais dos cartões: clientes `{total}`, produtos `{total, categories}`. |
| `GET /api/clients/{id}` | `cadastros.ver` | Cliente completo, lido ao abrir a edição. |
| `POST /api/clients` · `/api/products` | `cadastros.editar` | Cria. |
| `PUT /api/clients/{id}` · `/api/products/{id}` | `cadastros.editar` | Altera. |
| `DELETE /api/clients/{id}` · `/api/products/{id}` | `cadastros.editar` | Exclui. |
| `GET /api/clients/imports/template` · `/api/products/imports/template` | `cadastros.importar` | Baixa o modelo CSV. |
| `POST /api/clients/imports/preview` · `/api/products/imports/preview` | `cadastros.importar` | Prévia da importação (`multipart`, parte `file`). |
| `POST /api/clients/imports/confirm` · `/api/products/imports/confirm` | `cadastros.importar` | Confirma a importação (`multipart`, parte `file`). |

## Peças e estoque

| Rota | Permissão | Descrição |
| --- | --- | --- |
| `GET /api/parts/options` | `pecas.ver` ou `pecas.usar` | Seletor de peças da OS: `{id, code, name, unit, onHand, active}`. |
| `GET /api/parts` | `pecas.ver` | Busca peças (`query`). |
| `GET /api/parts/replenishment` | `pecas.ver` | Peças a repor. |
| `GET /api/parts/{id}/movements` | `pecas.ver` | Movimentações, sem custos (os custos ficam na peça e nos usos). |
| `POST /api/parts` | `pecas.movimentar` | Cadastra peça. |
| `PUT /api/parts/{id}` | `pecas.movimentar` | Altera peça. |
| `POST /api/parts/{id}/movements` | `pecas.movimentar` | Registra movimentação. |
| `POST /api/parts/movements/{movementId}/reversal` | `pecas.movimentar` | Estorna movimentação. |

Quantidade de peça: quando a unidade (campo `unit` da peça ou do componente externo, texto livre) é contável, a quantidade deve ser um número inteiro positivo; só unidades de medida aceitam decimais, até 3 casas. A comparação ignora acento, caixa e ponto final. São medidas: kg, g, mg, t, l, lt, litro(s), ml, m, metro(s), cm, mm, km, m2, m², m3, m³, pol e as formas por extenso (quilograma, grama, tonelada, mililitro, centímetro, milímetro, quilômetro, polegada, no plural também); tudo o mais (un, und, pc, peça, par, jogo, kit, cx, caixa, rolo, unidade em branco etc.) é contável. A regra vale para uso, movimentação (entrada, saída, ajuste), estoque mínimo e componente externo; a recusa é 400 com "A unidade UN não aceita quantidade fracionada. Informe um número inteiro." Usos antigos fracionados continuam exibidos e podem ser corrigidos por estorno; ao editar a peça, o estoque mínimo existente é preservado se não for alterado. No frontend a regra única fica em `core/utils/quantity-rules.ts`; no backend, em `part/QuantityRules.java`.

## Protocolos (modelos)

| Rota | Permissão | Descrição |
| --- | --- | --- |
| `GET /api/protocols/templates` | `protocolos.ver`, `protocolos.executar` ou `rma.ver` | Lista dos modelos. |
| `POST /api/protocols/templates` | `protocolos.catalogo` | Cria modelo. |
| `PUT /api/protocols/templates/{id}` | `protocolos.catalogo` | Altera (cria nova versão). |
| `DELETE /api/protocols/templates/{id}` | `protocolos.catalogo` | Exclui o modelo (204). Responde 409 se alguma versão já foi usada em uma OS; nesse caso o modelo só pode ser desativado. |

Qualquer outra rota de `/api/protocols/**` é negada.

## Relatórios

| Rota | Permissão | Descrição |
| --- | --- | --- |
| `GET /api/reports/rmas` | `relatorios.ver` | Lista paginada do período. |
| `GET /api/reports/rmas/summary` | `relatorios.ver` | Resumo e indicadores. |
| `GET /api/reports/rmas/export.csv` | `relatorios.ver` | CSV, uma linha por item. |
| `GET /api/reports/rmas/summary/export.csv` | `relatorios.ver` | CSV do resumo. |

## Usuários, perfis e permissões

| Rota | Permissão | Descrição |
| --- | --- | --- |
| `GET /api/users` | `usuarios.gerir` | Lista paginada (`query`, `profileId`, `active`). |
| `GET /api/users/summary` | `usuarios.gerir` | Total de usuários (`{total}`). |
| `POST /api/users` | `usuarios.gerir` | Cria usuário. |
| `PUT /api/users/{id}` | `usuarios.gerir` | Altera usuário. |
| `DELETE /api/users/{id}` | `usuarios.gerir` | Exclui usuário. |
| `GET /api/users/assignable` | autenticado | Técnicos que podem ser responsáveis (`rma.atribuivel`). |
| `GET /api/profiles` | `perfis.gerir` | Lista paginada de perfis. |
| `POST /api/profiles` | `perfis.gerir` | Cria perfil. |
| `PUT /api/profiles/{id}` | `perfis.gerir` | Altera perfil. |
| `DELETE /api/profiles/{id}` | `perfis.gerir` | Exclui qualquer perfil sem usuários vinculados. |
| `GET /api/profiles/options` | `perfis.gerir`, `usuarios.gerir` ou `notificacoes.regras` | Opções de perfil. |
| `GET /api/permissions` | `perfis.gerir` ou `usuarios.gerir` | Catálogo de permissões por módulo. |

## Kanban e notificações pessoais (autenticado)

| Rota | Descrição |
| --- | --- |
| `GET /api/kanban-views` | Visualizações do usuário. |
| `POST /api/kanban-views` | Cria visualização. |
| `PUT /api/kanban-views/{id}` | Renomeia ou altera filtros. |
| `PATCH /api/kanban-views/{id}/default` | Define a visualização padrão. |
| `DELETE /api/kanban-views/{id}` | Exclui. |
| `GET /api/notifications` | Lista (`unreadOnly`, `includeSnoozed`, `eventType`, `severity`; até 100). |
| `GET /api/notifications/summary` | Contagem de não lidas. |
| `POST /api/notifications/{id}/read` | Marca como lida. |
| `POST /api/notifications/read-all` | Marca todas as visíveis como lidas. |
| `POST /api/notifications/{id}/snooze` | Adia (`minutes` de 5 a 10080). Só `RMA_BLOCKED` e `TEST_FAILED`; as informativas (`RMA_CREATED`, `RMA_ASSIGNED`) recebem 400. |
| `GET /api/notifications/preferences` | Preferências de silenciamento. |
| `PUT /api/notifications/preferences/{eventType}` | Altera a preferência de um evento. |

## Regras de notificação e e-mail (`notificacoes.regras`)

| Rota | Descrição |
| --- | --- |
| `GET /api/notification-rules` | Lista as regras. |
| `PUT /api/notification-rules/{eventType}` | Altera a regra. |
| `GET /api/notification-rules/email-status` | Estado do canal e consumo dos tetos. |
| `GET /api/notification-rules/failures` | Falhas recentes de evento e e-mail. |
| `POST /api/notification-rules/emails/{notificationId}/retry` | Reenvia um e-mail `FAILED`. |
| `POST /api/notification-rules/emails/test` | Envia e-mail de teste ao endereço da própria sessão. |

Comportamento em [notificacoes-e-emails.md](notificacoes-e-emails.md).

## Auditoria

| Rota | Permissão | Descrição |
| --- | --- | --- |
| `GET /api/audit-events` | `auditoria.ver` | Trilha paginada, com `from`, `to` (datas inclusivas no fuso America/Sao_Paulo), `actor` (username completo), `action`, `entityType`, `page` e `size` (padrão 20, máximo 100). Ordem por instante e ID decrescentes. |

Contrato e eventos em [auditoria.md](auditoria.md). Não há edição, exclusão ou exportação.

## Filtros e ordem do Kanban

As páginas e contagens aceitam `query` (até 100 caracteres, ignorando caixa e acento em código, cliente, produto, SKU, lote e série), `status`, `priority`, `warranty`, `blocked`, `deadline`, `assigneeId`, `unassignedOnly`, `entryFrom`, `entryTo`, `updatedFrom` e `updatedTo`. Não se pode combinar responsável e somente sem responsável. Intervalos invertidos e paginação inválida retornam 400. Datas de atualização são dias civis de São Paulo, com final exclusivo no dia seguinte.

Garantia considera ajuste manual e itens legados; basta um item corresponder. Prazo aceita `OVERDUE`, `DUE_SOON`, `ON_TRACK`, `NO_DUE_DATE`, com a janela configurada no servidor; OS encerradas não pertencem a esses quatro filtros.

Ordem: posição manual crescente, nulos ao final, prioridade HIGH/MEDIUM/LOW, atualização decrescente e id crescente. `afterId` é o predecessor e `beforeId` é o sucessor; sem vizinhos insere no início. Vizinhos filtrados não precisam ser adjacentes: `beforeId` determina o ponto, enquanto `afterId` valida a ordem. Recusa vizinho fora da coluna, autorreferência e ordem invertida.

Inserir entre cartões automáticos fixa também o prefixo anterior, preservando os nulos abaixo. Intervalos começam em 1024; falta de espaço ou risco de overflow renumera sob o lock da coluna. Advisory locks transacionais de origem e destino precedem o lock da OS, sempre na mesma ordem, inclusive na rota atual de status. Reordenar usa SQL somente em `board_position`, sem alterar data visível nem histórico de status. Mudar de status usa as validações, protocolos, auditoria e histórico existentes; a rota atual limpa a posição ao trocar de coluna. O endpoint completo `/board` permanece compatível.


## Uso de peças nas OS

| Rota | Permissão | Descrição |
| --- | --- | --- |
| `GET /api/rmas/{rmaId}/parts` | `rma.ver` | Usos, movimentos, peças trocadas e `usedCost`; custos ocultos sem `pecas.ver`. |
| `POST /api/rmas/{rmaId}/parts/usages` | `pecas.usar` | Usar peça e descontar o estoque imediatamente (201). |
| `POST /api/rmas/{rmaId}/parts/usages/{usageId}/reversal` | `pecas.usar` | Desfazer uso com `{ reason }` obrigatório. |

Uso recebe `{ partId, quantity, replacementReason, componentBatch?, notes? }`. Motivo da troca obrigatório, sem espaços nas pontas; lote e observação opcionais. Exige OS aberta, peça ativa e quantidade válida para a unidade. Saldo insuficiente responde 409 com `Estoque insuficiente para a peça X. Em estoque: N.` e não grava uso, movimento ou pendência. Uso e estorno registram histórico e auditoria. Desfazer exige OS aberta, inclusive pela rota de reversão de movimentos; não reverte duas vezes.

Removidos: criação em `POST /api/rmas/{rmaId}/parts`, ações `/{reservationId}/allocate`, `/{reservationId}/consume`, `/{reservationId}/cancel` e `GET /api/parts/pending`. Reposição considera somente estoque abaixo do mínimo. A resposta da OS usa `usages`, `movements`, `usedCost` e `replacedComponents`. Situações persistidas: `USED` (usada) e `REVERTED` (uso desfeito). A base é recriada pela V1, sem registros ou tipos históricos de reserva.
