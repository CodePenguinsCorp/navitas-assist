# Minimização de dados por consumidor

## Objetivo e limites

Enviar somente os dados usados por cada tela, preservando o comportamento dos quatro perfis prontos. A mudança de autorização fica exclusivamente na etapa 3, já autorizada no pedido. Identificadores continuam rma/Rma; textos novos usam Ordem de Serviço (OS).

Sem mudança de schema, dependências ou infraestrutura. Não alterar os campos da seção “NÃO mexer” da auditoria. Cada achado precisa ser confirmado nos consumidores antes de remover dados. Não alterar relatórios nem notificações por associação com outros DTOs.

## Abordagem

Usar records explícitos por finalidade, com interfaces TypeScript correspondentes. A separação de contratos torna verificável a ausência de dados e evita que campos de detalhe voltem às listas. Filtragem apenas no frontend não atende à minimização. Serialização dinâmica genérica acrescentaria complexidade e esconderia contratos.

As três etapas e seus contratos foram definidos no pedido. As decisões técnicas abaixo são propostas para execução.

## Evidências iniciais

- Árvore limpa na leitura inicial.
- `RmaController` usa `RmaResponse` na lista, board, detalhe e escritas.
- `RmaService` do frontend não expõe history nem busca por código. Busca textual em frontend/src e docs encontrou as rotas somente na tabela de API e no registro histórico de nomenclatura; não encontrou consumidores frontend.
- `DashboardComponent` chama `listBoard()`, calcula indicadores e percorre statusHistory para mostrar quatro eventos.
- `SecurityConfig` autoriza GETs de clientes, produtos, peças e protocolos apenas por autenticação.
- As permissões dos quatro perfis na fixture incluem cadastros.ver, pecas.ver e protocolos.ver; confirmar também baseline e documentação antes de alterar a matriz.

Esta leitura inicial não substitui a conferência campo a campo durante a implementação.

## Etapa 1: minimizar sem mudar acesso

- Options de clientes: id, legalName. Options de produtos: id, sku, name. Nova rota de peças options: id, code, name, unit, available, active; usada pelo painel da OS.
- Remover GET /api/rmas/history e GET /api/rmas/code/{code}, métodos exclusivos, testes obsoletos e entradas na matriz/documentação viva. Preservar registro histórico de nomenclatura.
- Summaries de clientes e usuários somente total; produtos total e categories. Remover timestamps não consumidos de clientes, produtos, usuários, perfis e kanban-views.
- Proposta: remover GETs individuais de profiles, products, parts e protocols/templates após confirmar ausência de consumidores inclusive nos serviços frontend. Remover métodos exclusivos dessas leituras; preservar helpers usados por escritas. Manter GET de cliente para edição na etapa 2. Justificar cada remoção no corpo do commit correspondente.
- SessionResponse: username, fullName, email, profileName, permissions; login e auth/me mantêm sessão e fluxo de autenticação.
- Remover os campos mortos de OS enumerados no pedido, inclusive duplicações do primeiro item e fallback frontend. Busca do Kanban passa a usar items.
- PartMovementResponse sem custos nem identificadores internos não consumidos; preservar identificadores necessários às ações, createdBy e demais campos exibidos. Não remover dados das entidades.
- Dashboard GET /api/rmas/dashboard com rma.ver explícito e matriz. Servidor calcula agregados por status, prioridade, responsável, garantia e prazo, sem transportar históricos completos. Preservar os universos atuais dos indicadores: garantia considera todos os itens; prazos consideram OS abertas. Preservar fila atual de até cinco OS abertas, quatro OS atualizadas e quatro eventos de status, com os campos efetivamente exibidos. Fuso America/Sao_Paulo; ordenação equivalente à atual.
- Kanban substitui localmente o card pela resposta de atribuição, status e prioridade; não recarrega o board nessas ações.

O dashboard usa consultas agregadas e limitadas próprias, sem montar RmaResponse nem carregar históricos completos via search(). A fila mantém prioridade decrescente e entrada mais antiga; OS recentes usam atualização decrescente. Pendências de peças precisam de projeção própria caso sejam reduzidas: não retirar de PartReservationResponse os identificadores usados para ações no painel da OS.

## Etapa 2: lista, board e detalhe

- RmaListItemResponse: campos da tabela e ações da lista, sem textos e históricos do detalhe.
- RmaBoardCardResponse: campos consumidos pelo card, filtros e busca, incluindo items, responsável, datas, deadline, stagePeriods e currentBlock resumido. Sem históricos completos nem textos livres de detalhe.
- RmaDetailResponse: campos realmente consumidos pelo detalhe. GET individual e respostas de escrita devolvem esse contrato.
- Ao abrir detalhe na lista, modal do Kanban ou link /rmas?rma=, buscar GET /api/rmas/{id}, com carregamento local. Modal usa SKIP_GLOBAL_LOADING. Falha mostra mensagem local e permite nova tentativa; resposta anterior não deve aparecer como detalhe de outra OS.
- Escritas substituem o detalhe aberto e projetam a resposta no card/linha. Não inserir campos do detalhe no estado do board/lista por espalhamento indiscriminado.
- Lista de clientes não contém address/notes; edição busca GET individual antes de preencher formulário.

## Etapa 3: autorização e custos

- Custos de RmaPartsResponse e PartReservationResponse retornam null sem pecas.ver, em leituras e escritas que os devolvam. PartMovementResponse já não transporta custos após etapa 1; manter ausência. Ocultar blocos correspondentes no frontend pela mesma permissão.
- GET /parts/options exige pecas.ver OU pecas.reservar; demais GET /parts/** exigem pecas.ver.
- Listas/detalhes de clientes e produtos exigem cadastros.ver. Options aceitam cadastros.ver, rma.ver, rma.abrir, relatorios.ver, protocolos.ver ou protocolos.catalogo. Summaries mínimos continuam disponíveis ao dashboard autenticado, preservando etapa 1 e evitando exigir cadastros.ver para estatísticas agregadas.
- Templates exigem protocolos.ver OU protocolos.executar OU rma.ver; execuções por OS exigem rma.ver.
- Matchers específicos precedem os genéricos. Matriz cobre todas as rotas restantes e novas.
- Tela de OS só carrega options de abertura com rma.abrir. Conferir chamadas de relatórios, protocolos, peças e dashboard contra os respectivos guards e permissões.
- Não conceder permissões novas aos perfis prontos. Testar endpoints realmente usados pelas telas permitidas de cada perfil, com dados existentes para exigir 200. Perfis personalizados sem a autoridade adequada recebem 403; permissões alternativas devem ser testadas isoladamente.

## Verificação e entrega

Cada tarefa começa com teste que falha por comportamento. Cobrir ausência de campos no JSON, transporte frontend, abertura assíncrona de detalhes, atualização local do Kanban e mascaramento condicional em respostas de escrita.

Ao fim de cada etapa: Maven verify; suíte frontend com TZ=UTC e runner-config informado; build frontend sem avisos e CSS por componente até 4 kB. Registrar contagens reais. Não encerrar etapa com falhas conhecidas. Atualizar docs/api.md e docs/acesso-e-permissoes.md no mesmo conjunto de mudanças.

Commits locais por tarefa lógica, com caminhos explícitos, mensagens Conventional Commits em português e justificativas de remoção de rotas. Sem push, reescrita de histórico, intervenção em Docker, segredos ou configuração global. Leituras das skills e do relatório externo são somente leitura; artefatos de trabalho ficam no repositório.

Relato por etapa: hashes, contagens de testes, endpoints alterados/removidos e desvios. Nenhuma suíte foi executada nesta fase de especificação.
