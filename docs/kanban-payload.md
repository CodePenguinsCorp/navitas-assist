# Payload do Kanban

`GET /api/rmas/board` devolve um card por OS, sem paginação. O card leva só o que o quadro exibe e o que os filtros e a busca usam; o resto vem do detalhe (`GET /api/rmas/{id}`), lido quando a pessoa abre o card.

## Análise (medida com 307 OS no Docker local)

Antes, o card pesava cerca de 1 kB (306 kB no total). Metade era `stagePeriods` (147 kB, a lista de períodos de cada etapa), usada só para o texto "há X nesta etapa". Os itens completos somavam 53 kB e o objeto `deadline`, 16 kB.

Consumidores do endpoint: só a página do Kanban (`pages/kanban`, que desenha o quadro em `shared/rma-kanban-board`). O dashboard usa `GET /api/rmas/dashboard` e as visualizações salvas guardam apenas os valores dos filtros, então nenhum dos dois lê o card. Filtros e busca do Kanban rodam no cliente, por isso os campos que eles usam continuam no card.

| Campo do card | Uso | Decisão |
| --- | --- | --- |
| `id`, `code`, `clientName`, `status`, `priority`, `entryDate`, `dueDate`, `assigneeId`, `assigneeName` | Exibição, filtros e busca | Mantidos |
| `updatedAt` | Ordem do card na coluna e filtro "Atualização" | Mantido, sem fração de segundo |
| `productName`, `additionalItems` | Título "Produto A + 2 item(ns)" | Substituem a lista de itens; `additionalItems` sai do JSON quando a OS tem um item só |
| `searchText` | Busca por SKU, lote, série e nome dos demais itens | Substitui os itens; a busca continua no cliente |
| `warranty` | Filtro "Garantia" (garantia efetiva de qualquer item) | Substitui `items[].warrantyStatus`: uma letra por garantia distinta (P pendente, I em garantia, O fora de garantia) |
| `dueSoonFrom` | Situação do prazo recalculada pelo relógio do negócio | Substitui o objeto `deadline`. Continua vindo do servidor porque a janela (`DEADLINE_WARNING_DAYS`) é configurável no backend; o status nunca é enviado, o cliente o deriva de `dueDate` e `dueSoonFrom` |
| `blockedAt` | "Impedida há X" e filtro "Impedimentos" | Substitui `currentBlock`; ausente sem impedimento |
| `currentStageEnteredAt` | "há X nesta etapa" | Substitui `stagePeriods`: só o instante em que a OS entrou na etapa atual, calculado com a mesma regra do último período do detalhe |

Saíram do card: `items` completos (`id`, garantia calculada etc.), `stagePeriods`, `deadline`, `currentBlock` com o motivo. O detalhe continua completo e é lido ao abrir o card, incluindo "Tempo por etapa", itens com garantia e impedimento detalhado.

No servidor, o status e os impedimentos entram por duas consultas em lote só com as colunas necessárias (`RmaBoardRepository`), no lugar de carregar as coleções de cada OS; cliente e responsável vêm no `join fetch` da consulta principal.

## Medição

Mesmo script, 307 OS (317 no momento da medida final, por dados criados no ambiente):

| | Antes | Depois |
| --- | --- | --- |
| Corpo da resposta | 306 kB (1.019 bytes por card) | 135 kB com 317 cards (436 bytes por card; cerca de 131 kB com 307) |
| Redução | | 57% por card |
| Tempo de resposta do backend local | não medido antes | cerca de 300 ms (230 a 395 ms em 8 chamadas) |

## Regra para os próximos campos

Antes de pôr um campo no card, confirme que o quadro o exibe ou filtra. O que só o detalhe usa fica em `GET /api/rmas/{id}`. Qualquer página de cards por coluna (carregamento incremental) deve passar `SKIP_GLOBAL_LOADING` na chamada, para não acionar o overlay de carregamento global; abrir o detalhe de um card usa o carregamento global normal.
