# API

Fonte: `SecurityConfig.java` e os controllers em `backend/src/main/java/br/com/navitasassist`. "Autenticado" significa qualquer usuário com sessão; as demais permissões estão em [acesso-e-permissoes.md](acesso-e-permissoes.md).

Convenções:

- Prefixo `/api`; JSON, exceto onde indicado (CSV, PDF, `multipart/form-data`).
- Escritas (`POST`, `PUT`, `PATCH`, `DELETE`) exigem o header `X-XSRF-TOKEN` (ver `GET /api/auth/csrf`).
- Sem sessão: `401`; sem permissão: `403`; validação e regra de negócio: `400` com mensagem em português; não encontrado: `404`.
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
| `GET /api/auth/me` | autenticado | Usuário atual e permissões efetivas. |

## ordens de serviço

| Rota | Permissão | Descrição |
| --- | --- | --- |
| `GET /api/rmas` | `rma.ver` | Lista paginada (`query`, `status`, `page`, `size`). |
| `GET /api/rmas/summary` | `rma.ver` | Totais para os indicadores (`query`, `status`). |
| `GET /api/rmas/board` | `rma.ver` | Todos as ordens de serviço do Kanban e do dashboard, sem paginação. |
| `GET /api/rmas/{id}` | `rma.ver` | Detalhe. |
| `GET /api/rmas/{id}/report.pdf` | `rma.ver` | Laudo final em PDF. |
| `POST /api/rmas` | `rma.abrir` | Abre uma OS. |
| `PUT /api/rmas/{id}` | `rma.editar` | Altera dados gerais, prioridade e data limite (`dueDate` / `clearDueDate`). |
| `PUT /api/rmas/{id}/items/{itemId}/warranty` | `rma.editar` | Ajuste manual de garantia do item. |
| `PATCH /api/rmas/{id}/status` | `rma.status` | Muda o status. |
| `PATCH /api/rmas/{id}/status-history/{eventId}/note` | `rma.status` | Edita a observação (`note`, até 255 caracteres) de um evento do histórico de status; recusado em OS encerrada. |
| `PATCH /api/rmas/{id}/assignee` | `rma.responsavel` | Atribui, troca ou remove o responsável. |
| `PUT /api/rmas/{id}/diagnosis` | `rma.diagnosticar` | Registra ou altera o diagnóstico. |
| `POST /api/rmas/{id}/blocks` | `rma.impedimentos` | Inicia um impedimento. |
| `PATCH /api/rmas/{id}/blocks/{blockId}` | `rma.impedimentos` | Resolve aquele impedimento. |

## Peças, reparo e protocolos nas ordens de serviço

| Rota | Permissão | Descrição |
| --- | --- | --- |
| `GET /api/rmas/{id}/parts` | `rma.ver` | Reservas e componentes trocados da OS. |
| `POST /api/rmas/{id}/parts` | `pecas.reservar` | Reserva peça. |
| `POST /api/rmas/{id}/parts/{reservationId}/allocate` | `pecas.reservar` | Aloca a reserva. |
| `POST /api/rmas/{id}/parts/{reservationId}/consume` | `pecas.reservar` | Aplica a reserva (ação `consume`) (motivo e lote). |
| `POST /api/rmas/{id}/parts/{reservationId}/cancel` | `pecas.reservar` | Cancela a reserva. |
| `GET /api/rmas/{id}/repair` | `rma.ver` | Intervenções e `totalServiceHours`. |
| `GET /api/rmas/{id}/repair/external-components` | `rma.ver` | Componentes externos. |
| `POST /api/rmas/{id}/repair/external-components` | `pecas.reservar` | Adiciona componente externo. |
| `POST /api/rmas/{id}/repair/interventions` | `rma.diagnosticar` | Registra intervenção. |
| `PUT /api/rmas/{rmaId}/repair/interventions/{id}` | `rma.diagnosticar` | Edita intervenção ativa em OS aberta. |
| `POST /api/rmas/{rmaId}/repair/interventions/{id}/void` | `rma.diagnosticar` | Anula intervenção com `{ reason }` obrigatório (até 1000). |
| `PUT /api/rmas/{rmaId}/repair/external-components/{id}` | `pecas.reservar` | Edita componente externo ativo em OS aberta. |
| `POST /api/rmas/{rmaId}/repair/external-components/{id}/void` | `pecas.reservar` | Anula componente externo com `{ reason }` obrigatório (até 1000). |
| `GET /api/protocols/rmas/{rmaId}/executions` | `rma.ver` | Execuções de protocolo da OS. |
| `POST /api/protocols/rmas/{rmaId}/executions` | `protocolos.executar` | Inicia execução. |
| `POST /api/protocols/executions/{executionId}/items/{itemId}/results` | `protocolos.executar` | Registra resultado de um item. |
| `POST /api/protocols/executions/{executionId}/complete` | `protocolos.executar` | Conclui a execução. |

## Clientes e produtos

| Rota | Permissão | Descrição |
| --- | --- | --- |
| `GET /api/clients` · `/api/products` | autenticado | Lista paginada com filtros. |
| `GET /api/clients/options` · `/api/products/options` | autenticado | Opções para seletores, sem paginação: clientes `{id, legalName}`, produtos `{id, sku, name}`. |
| `GET /api/clients/summary` · `/api/products/summary` | autenticado | Totais dos cartões: clientes `{total}`, produtos `{total, categories}`. |
| `GET /api/clients/{id}` | autenticado | Detalhe do cliente. |
| `POST /api/clients` · `/api/products` | `cadastros.editar` | Cria. |
| `PUT /api/clients/{id}` · `/api/products/{id}` | `cadastros.editar` | Altera. |
| `DELETE /api/clients/{id}` · `/api/products/{id}` | `cadastros.editar` | Exclui. |
| `GET /api/clients/imports/template` · `/api/products/imports/template` | `cadastros.importar` | Baixa o modelo CSV. |
| `POST /api/clients/imports/preview` · `/api/products/imports/preview` | `cadastros.importar` | Prévia da importação (`multipart`, parte `file`). |
| `POST /api/clients/imports/confirm` · `/api/products/imports/confirm` | `cadastros.importar` | Confirma a importação (`multipart`, parte `file`). |

## Peças e estoque

| Rota | Permissão | Descrição |
| --- | --- | --- |
| `GET /api/parts/options` | autenticado | Seletor de peças da OS: `{id, code, name, unit, available, active}`. |
| `GET /api/parts` | autenticado | Busca peças (`query`). |
| `GET /api/parts/pending` | autenticado | Reservas pendentes. |
| `GET /api/parts/replenishment` | autenticado | Peças a repor. |
| `GET /api/parts/{id}/movements` | autenticado | Movimentações. |
| `POST /api/parts` | `pecas.movimentar` | Cadastra peça. |
| `PUT /api/parts/{id}` | `pecas.movimentar` | Altera peça. |
| `POST /api/parts/{id}/movements` | `pecas.movimentar` | Registra movimentação. |
| `POST /api/parts/movements/{movementId}/reversal` | `pecas.movimentar` | Estorna movimentação. |

## Protocolos (modelos)

| Rota | Permissão | Descrição |
| --- | --- | --- |
| `GET /api/protocols/templates` | autenticado | Lista dos modelos. |
| `POST /api/protocols/templates` | `protocolos.catalogo` | Cria modelo. |
| `PUT /api/protocols/templates/{id}` | `protocolos.catalogo` | Altera (cria nova versão). |

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
| `DELETE /api/profiles/{id}` | `perfis.gerir` | Exclui (não vale para perfis prontos nem com usuários). |
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
| `POST /api/notifications/{id}/snooze` | Adia. |
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
