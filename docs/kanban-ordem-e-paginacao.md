# Kanban: ordem manual e paginação por coluna

Projeto proposto em 15/11/2026, pendente de aprovação. Este documento descreve o contrato a implementar; os endpoints atuais continuam vigentes.

## Análise rápida

Só `pages/kanban` consome `GET /api/rmas/board`. `RmaService.search` carrega todas as OS, busca itens em lote e consulta pontos de status e impedimentos. `RmaBoardRepository` hoje contém apenas essas duas consultas auxiliares. O componente compartilhado agrupa e ordena no cliente; os filtros ficam na página. `KanbanViewService` persiste valores de filtros, sem cartões ou ordem. Existe apenas `V1__baseline.sql`; a próxima versão livre na conferência inicial é V2, a reconferir antes da criação.

Decisão proposta: consultas paginadas no PostgreSQL, preservando a montagem enxuta dos cartões. Paginar o resultado já carregado em Java manteria o custo atual. Paginar no cliente não atenderia à redução da carga inicial. Manter `/board` compatível durante a implementação permite entregar backend e frontend separadamente.

## Contratos propostos

| Rota | Permissão | Resposta |
| --- | --- | --- |
| `GET /api/rmas/board/column?status=X&page=0&size=20` | `rma.ver` | `{cards, total, hasMore, page, size}` |
| `GET /api/rmas/board/counts` | `rma.ver` | `{statusCounts, total, highPriority, active, closed, waitingPart}` |
| `PUT /api/rmas/{id}/board-position` | `rma.status` e CSRF | Cartão enxuto atualizado; corpo `{status, afterId?, beforeId?}` |

Página começa em zero, tamanho padrão 20, máximo 100. `status` da coluna é obrigatório. Os dois GET aceitam os mesmos filtros: `query` (até 100 caracteres, sem distinção de caixa/acento, código, cliente, produto, SKU, lote e série), `priority`, `warranty`, `blocked`, `deadline`, `assigneeId`, `unassignedOnly`, `entryFrom`, `entryTo`, `updatedFrom` e `updatedTo`. Contagens também aceitam o filtro `status` salvo da visualização; na leitura de uma coluna, a página só solicita os status compatíveis com esse filtro. Combinações e intervalos inválidos retornam 400. Datas de atualização representam dias civis de São Paulo, com limite final exclusivo no dia seguinte.

Garantia usa o cálculo efetivo atual, incluindo ajustes manuais e itens legados; prazo usa a mesma regra e configuração de `RmaDeadlineService`, com estados `OVERDUE`, `DUE_SOON`, `ON_TRACK` e `NO_DUE_DATE`. OS encerradas continuam seguindo a regra atual de prazo. Filtros e agregações compartilham os predicados SQL para evitar totais divergentes ou duplicação por item. Indicadores usam agregações, nunca somente os cartões carregados. A contagem geral sem filtros pode ser lida separadamente para preservar o título “X de Y”.

## Ordem e concorrência

- Nova migração `V2__rma_board_position.sql`: `rmas.board_position BIGINT NULL` e índice `(status, board_position)`. Conferir novamente a versão livre antes de escrever. Espelhar a coluna na entidade.
- Ordem SQL: `board_position ASC NULLS LAST`, prioridade HIGH/MEDIUM/LOW, `updated_at DESC`, `id ASC`. O cliente preserva a sequência recebida.
- Posições com intervalo inicial de 1024. Sem espaço ou com risco de overflow, renumerar sob o mesmo lock. Não alterar datas ou histórico dos cartões renumerados.
- `afterId` indica o predecessor e `beforeId` o sucessor. Sem vizinhos significa início da coluna. Recusar auto-referência, vizinho fora da coluna e ordem de vizinhos invertida. Aceitar vizinhos visíveis não adjacentes sob filtros: inserir imediatamente antes de `beforeId`, ou imediatamente após `afterId` se só ele vier. Com ambos, `beforeId` determina o ponto e `afterId` valida a ordem.
- Como posições manuais ficam acima das nulas, inserir no trecho automático exige atribuir posições também ao prefixo automático anterior ao ponto de inserção. Isso preserva exatamente o ponto escolhido, mantendo nulos apenas abaixo do trecho fixado. Exemplo: A e B automáticos, soltar X entre eles resulta em A e X manuais, seguidos por B automático.
- Lock transacional por coluna com advisory lock PostgreSQL de chave estável. Operações entre colunas bloqueiam origem e destino em ordem fixa; revalidam o status após obter os locks e recusam alteração concorrente incompatível. Depois bloqueiam a OS. Mudanças pelo endpoint atual de status participam do mesmo protocolo e limpam a posição anterior ao mudar de coluna.
- Troca de status reaproveita validações de protocolos, reservas, histórico e auditoria existentes. Reordenar sem troca não gera histórico de status. Atualizar só a coluna por SQL evita o `AuditingEntityListener`, que hoje altera `updatedAt` ao salvar a entidade; sincronizar o contexto de persistência antes de montar a resposta. Na troca real, a atualização visível segue a regra existente.

## Frontend e acessibilidade

Estado em signals por coluna: `cards`, `total`, `hasMore`, `loadingMore`, `error`, página seguinte e geração de consulta. Carga inicial das colunas em paralelo, com carregamento global normal. Busca com debounce de 300 ms; qualquer novo conjunto de filtros cancela as consultas anteriores, limpa páginas e recarrega colunas e agregações. Aplicar visualização salva usa o mesmo caminho.

Um sentinela por coluna com `IntersectionObserver`, tendo a área rolável da coluna como raiz e margem para antecipar o fim. Sem listeners de scroll. Requisições incrementais passam `SKIP_GLOBAL_LOADING`; falha preserva os cartões e mostra “Não foi possível carregar mais. Tentar novamente”. Durante a carga, três esqueletos cinza ao final, ocultos da árvore acessível. Desconectar observadores ao destruir a tela e impedir pedidos duplicados ou respostas de gerações antigas.

Cabeçalhos mostram totais reais. Região `aria-live` anuncia carregamento e quantidade. Arraste mostra linha de inserção, faz atualização otimista e reverte com mensagem em português em caso de erro. Alt+Seta acima/abaixo move uma posição entre cartões carregados, preserva foco pelo id e anuncia a nova posição; ao atingir o limite carregado inferior com mais páginas, carrega a próxima antes de permitir o movimento. Mesmas permissões para mouse e teclado. Não alterar o conteúdo ou visual aprovado dos cartões.

Ações de status, responsável e prioridade aplicam a resposta localmente e ajustam pertinência aos filtros e contagens. Invalidar a paginação das colunas afetadas após mudança de ordem ou pertinência para evitar saltos e duplicados de paginação por offset. O servidor fornece os totais novamente; a atualização otimista não substitui essa reconciliação. Preservar o foco e os cartões já visíveis durante a reconciliação. Abrir detalhe continua usando loading global.

## Entrega e prova

1. Backend e migração: TDD de ordem manual, trecho automático, paginação, filtros combinados, garantia efetiva, prazo, contagens, escrita, movimentação, concorrência com threads reais e permissões/CSRF. Atualizar `SecurityConfig`, `PermissionEquivalenceIntegrationTest`, contratos espelhados e documentação da API, acesso e banco. Commit local próprio.
2. Frontend: TDD de parâmetros HTTP, exclusão do loading global só nas páginas incrementais, cancelamento, visualizações, observador, repetição após erro, drag, teclado, foco, reversão e indicadores. Remover filtros/comparador locais apenas depois de conferir os demais consumidores. Commit local próprio.
3. Documentação final em `api.md`, `kanban-payload.md`, `visao-geral.md`, `acesso-e-permissoes.md`, `banco-de-dados.md` e índice. Remover deste documento o estado de proposta somente após implementar e verificar. Commit separado.

Verificação final: `mvn -B -ntp -f backend/pom.xml verify`; suíte completa do frontend com `TZ=UTC` e o runner informado; `npm --prefix frontend run build`, sem avisos. Apenas um Maven por vez; PostgreSQL via Testcontainers. Sem Docker direto, alterações nas portas reservadas, push ou reescrita de commits. A conferência no navegador fica fora desta prova e será declarada como não realizada.
