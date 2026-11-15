# Kanban: ordem manual e paginação por coluna

Projeto aprovado pelo dono em 15/11/2026. Este documento registra o contrato aprovado e a implementação. O endpoint completo continua compatível.

## Análise inicial

Na análise inicial, só `pages/kanban` consumia `GET /api/rmas/board`. `RmaService.search` carrega todas as OS, busca itens em lote e consulta pontos de status e impedimentos. `RmaBoardRepository` hoje contém apenas essas duas consultas auxiliares. O componente compartilhado agrupava e ordenava no cliente; os filtros ficavam na página. `KanbanViewService` persiste valores de filtros, sem cartões ou ordem. Havia apenas `V1__baseline.sql`; a versão V2 foi reconferida e usada para a coluna de posição.

Decisão adotada: consultas paginadas no PostgreSQL, preservando a montagem enxuta dos cartões. Paginar o resultado já carregado em Java manteria o custo atual. Paginar no cliente não atenderia à redução da carga inicial. Manter `/board` compatível durante a implementação permite entregar backend e frontend separadamente.

## Contratos

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
3. Documentação final em `api.md`, `kanban-payload.md`, `visao-geral.md`, `acesso-e-permissoes.md`, `banco-de-dados.md` e índice. Remover deste documento o estado de proposta somente após implementar e verificar. Incluída no commit da etapa 2.

Verificação final: `mvn -B -ntp -f backend/pom.xml verify`; suíte completa do frontend com `TZ=UTC` e o runner informado; `npm --prefix frontend run build`, sem avisos. Apenas um Maven por vez; PostgreSQL via Testcontainers. Sem Docker direto, alterações nas portas reservadas, push ou reescrita de commits. A conferência no navegador fica fora desta prova e será declarada como não realizada.

## Registro de execução

- Entrega em dois commits, conforme orientação final do dono: documentação de backend na etapa 1 e documentação final na etapa 2.
- Manter `/board` compatível preserva a entrega independente das duas etapas; a página passará a usar apenas páginas e contagens.
- Consultas JDBC parametrizadas compartilham o predicado de páginas e agregações; montagem de cartões usa os carregamentos em lote existentes.
- Locks usam um namespace fixo e hash PostgreSQL do nome do status, em ordem lexical, sem depender da ordem do enum.
- A renumeração excepcional pode fixar toda a coluna; inserções normais fixam somente o prefixo automático necessário.
- Trabalho realizado na branch local `feat/kanban-ordem-paginacao`, no repositório solicitado.
- Etapa 1 verificada com `mvn -B -ntp -f backend/pom.xml verify`: 1.189 testes, nenhuma falha, erro ou teste ignorado; JAR gerado. PostgreSQL isolado via Testcontainers, incluindo migração, equivalência de schema e duas threads reais.

- No frontend, reconciliação preserva os cartões visíveis enquanto relê todas as páginas já carregadas das colunas afetadas; novos offsets ficam bloqueados até concluir.
- Leituras incrementais são suspensas antes de capturar o estado otimista. A reversão não restaura requisições encerradas nem perde páginas concluídas em paralelo.
- Se a geração de filtros mudar durante a escrita, o sucesso recarrega a consulta atual; o cartão da geração anterior não é aplicado diretamente.
- Movimentações para status excluído pelo filtro continuam permitidas. Após reconciliar, o cartão sai do resultado e o foco retorna aos filtros caso deixe de estar visível.
- Mantida a ação Desfazer, com proteção contra nova alteração da mesma OS. Removidos o seletor oculto de status, filtros locais e comparador sem consumidores.

- Removida também a toolbar interna sem consumidores do componente do quadro, preservando o cabeçalho da página e mantendo o CSS dentro do orçamento de 4 kB.
- Uma edição do detalhe concluída durante a recarga reinicia a consulta atual, impedindo que uma leitura anterior à escrita recoloque dados antigos.

## Verificação da entrega

- Backend: `mvn -B -ntp -f backend/pom.xml verify`, 1.189 testes aprovados e JAR gerado.
- Frontend: `TZ=UTC npm --prefix frontend test -- --watch=false --runner-config "C:\Users\joseh\AppData\Local\Temp\vitest-runner.config.mjs"`, 1.863 testes aprovados em 132 arquivos e código de saída zero. Nesta máquina foi usado `npm.cmd` para preservar os argumentos no PowerShell. O log registrou `ECONNRESET`, sem reprovar testes nem alterar o código de saída.
- Build: `npm --prefix frontend run build`, código de saída zero e nenhum aviso, incluindo os orçamentos de CSS e pacote inicial.
- Não houve conferência no navegador, nova medição de desempenho ou teste de carga. A concorrência foi exercitada com duas threads reais no PostgreSQL isolado. A migração não foi aplicada à pilha em uso.
