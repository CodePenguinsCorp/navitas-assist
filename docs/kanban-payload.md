# Payload do Kanban

`GET /api/rmas/board/column` devolve páginas de 20 cartões por status, com total real e `hasMore`. O card mantém o contrato enxuto existente; o resto vem do detalhe (`GET /api/rmas/{id}`), lido quando a pessoa abre o card.

## Análise (medida com 307 OS no Docker local)

Antes, o card pesava cerca de 1 kB (306 kB no total). Metade era `stagePeriods` (147 kB, a lista de períodos de cada etapa), usada só para o texto "há X nesta etapa". Os itens completos somavam 53 kB e o objeto `deadline`, 16 kB.

Consumidores do endpoint: só a página do Kanban (`pages/kanban`, que desenha o quadro em `shared/rma-kanban-board`). O dashboard usa `GET /api/rmas/dashboard` e as visualizações salvas guardam apenas os valores dos filtros, então nenhum dos dois lê o card. Filtros e busca do Kanban rodam no servidor antes da paginação. Os campos existentes continuam no contrato para compatibilidade e para projetar respostas do detalhe em cartões.

| Campo do card | Uso | Decisão |
| --- | --- | --- |
| `id`, `code`, `clientName`, `status`, `priority`, `entryDate`, `dueDate`, `assigneeId`, `assigneeName` | Exibição, filtros e busca | Mantidos |
| `updatedAt` | Exibição e compatibilidade; ordem e filtro são calculados no servidor | Mantido, sem fração de segundo |
| `productName`, `additionalItems` | Título "Produto A + 2 item(ns)" | Substituem a lista de itens; `additionalItems` sai do JSON quando a OS tem um item só |
| `searchText` | Busca por SKU, lote, série e nome dos demais itens | Mantido no contrato; a busca é executada no servidor |
| `warranty` | Filtro "Garantia" (garantia efetiva de qualquer item) | Substitui `items[].warrantyStatus`: uma letra por garantia distinta (P pendente, I em garantia, O fora de garantia) |
| `dueSoonFrom` | Situação do prazo recalculada pelo relógio do negócio | Substitui o objeto `deadline`. Continua vindo do servidor porque a janela (`DEADLINE_WARNING_DAYS`) é configurável no backend; o status nunca é enviado, o cliente o deriva de `dueDate` e `dueSoonFrom` |
| `blockedAt` | "Impedida há X" e filtro "Impedimentos" | Substitui `currentBlock`; ausente sem impedimento |
| `currentStageEnteredAt` | "há X nesta etapa" | Substitui `stagePeriods`: só o instante em que a OS entrou na etapa atual, calculado com a mesma regra do último período do detalhe |

Saíram do card: `items` completos (`id`, garantia calculada etc.), `stagePeriods`, `deadline`, `currentBlock` com o motivo. O detalhe continua completo e é lido ao abrir o card, incluindo "Tempo por etapa", itens com garantia e impedimento detalhado.

No servidor, o status e os impedimentos entram por duas consultas em lote só com as colunas necessárias (`RmaBoardRepository`), no lugar de carregar as coleções de cada OS; cliente e responsável vêm no `join fetch` da consulta principal.

## Medição histórica, anterior à paginação

Mesmo script, 307 OS (317 no momento da medida final, por dados criados no ambiente):

| | Antes | Depois |
| --- | --- | --- |
| Corpo da resposta | 306 kB (1.019 bytes por card) | 135 kB com 317 cards (436 bytes por card; cerca de 131 kB com 307) |
| Redução | | 57% por card |
| Tempo de resposta do backend local | não medido antes | cerca de 300 ms (230 a 395 ms em 8 chamadas) |

## Regra para os próximos campos

Antes de pôr um campo no card, confirme que o quadro o exibe ou filtra. O que só o detalhe usa fica em `GET /api/rmas/{id}`. Somente páginas incrementais passam `SKIP_GLOBAL_LOADING`, para não acionar o overlay global. A carga inicial, as contagens e a reconciliação da primeira página usam o loading normal; abrir o detalhe de um card usa o carregamento global normal.

## Páginas, totais e interação

`GET /api/rmas/board/column` responde `{cards, total, hasMore, page, size}` e exige `status`. `GET /api/rmas/board/counts` responde `{statusCounts, total, highPriority, active, closed, waitingPart}` com os mesmos filtros. Indicadores e cabeçalhos usam esses totais, incluindo cartões ainda não carregados. O total geral sem filtros é lido separadamente para mostrar “X de Y”. O endpoint completo `/board` permanece compatível, mas a página não o utiliza.

A página guarda cartões, total, próxima página, erro e carregamento por coluna. Cada coluna tem área rolável e sentinela com `IntersectionObserver`, raiz na própria coluna e margem de 240 px. Não há listener de scroll. Durante a leitura aparecem três esqueletos cinza, ocultos de leitores de tela. Uma falha conserva os cartões e oferece “Não foi possível carregar mais. Tentar novamente”. A região `aria-live` anuncia carregamento e quantidade.

A busca espera 300 ms. Mudanças de filtros e visualizações cancelam as leituras anteriores e descartam respostas de gerações antigas. Colunas encerradas seguem o mesmo fluxo.

O cliente mantém a ordem SQL. Arrastar mostra uma linha de inserção e grava `PUT /api/rmas/{id}/board-position` com os vizinhos. Alt+Seta acima/abaixo move uma posição entre os cartões carregados; no limite inferior com mais páginas, primeiro carrega a próxima. A escrita é otimista, preserva foco e reverte com mensagem em português na falha. Mouse e teclado exigem `rma.status`. O conteúdo visual dos cartões permanece o mesmo.

Mudanças de status, prioridade, responsável, impedimento e prazo aplicam o cartão retornado e reconciliam colunas e contagens com o servidor. Páginas já visíveis são relidas juntas antes de liberar novo offset. Requisições incrementais são canceladas antes da movimentação para que a reversão não descarte uma página concluída em paralelo. Uma gravação concluída após mudar filtros recarrega a consulta atual. A ação Desfazer permanece disponível e recusa alteração posterior da mesma OS.

As medições acima são históricas. Não foi feita nova medição de rede, tempo ou memória, nem conferência no navegador nesta entrega.
