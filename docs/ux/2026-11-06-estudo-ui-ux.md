# Navitas Assist — estudo global de UI e UX

Iniciado em 6 de novembro de 2026. Ampliado em 7 de novembro de 2026 para todas as telas e fluxos do projeto. Status: proposta para discussão, sem alteração das telas de produção.

## Resumo para decisão

Escopo: o produto inteiro (11 telas de entrada e seus fluxos internos), entregue em fases. Os mockups discutem aparência e organização; não validam usabilidade com operadores nem comportamento em Angular. As sete decisões abaixo foram tomadas em 7 de novembro de 2026; o restante do estudo continua proposta a validar.

| # | Decisão | Base conservadora proposta | Alternativa | Escolha |
| --- | --- | --- | --- | --- |
| 1 | Card do Kanban | Produto e falha resumida, cliente, SLA (inclusive saudável), prioridade, avatar e chave | Card enxuto: ocultar SLA saudável e falha, após teste com operadores | **Enxuto** (decidido em 7 nov): SLA saudável e falha saem do card; cliente, exceções de SLA/bloqueio, prioridade, avatar e chave ficam. Validar com operadores após a entrega |
| 2 | Detalhe da OS | Preservar as seis abas da lista e os blocos/timeline do Kanban; harmonizar o contrato de informação antes de trocar a estrutura | Estrutura única com abas nos dois lugares | **Harmonizar primeiro** (decidido em 7 nov) |
| 3 | Indicadores nos cadastros | Avaliar por tarefa: total no título; indicadores de gestão no dashboard; estoque mantém o que orienta ação | Remover de todos os cadastros | **Avaliar por tela** (decidido em 7 nov) |
| 4 | Prioridade | Ícone com nome acessível e rótulo curto na densidade padrão | Só ícone, após teste de compreensão | **Ícone + rótulo curto** (decidido em 7 nov) |
| 5 | Fundação visual | Azul `#236DA7`, Segoe UI, escala 4/8/12/16/24/32, controles de 36 px; valores são candidatos | Ajustar paleta e medidas | **Aceita como ponto de partida** (decidido em 7 nov) |
| 6 | Rodapé de formulários | Cancelar à esquerda, ação principal à direita, em todos os diálogos | Manter como está | **Cancelar à esquerda** (decidido em 7 nov) |
| 7 | Usuário e sair | Rodapé da lateral; sino com contador no cabeçalho | Manter no topo | **Rodapé da lateral** (decidido em 7 nov; entregue no commit `71d51ba`) |

### Padrões globais em uma página

- Cinco composições: acesso, visão operacional, coleção, trabalho/configuração e fluxo/análise, com os mesmos controles, estados e linguagem.
- Tabela para comparar registros, pares rótulo/valor para propriedades, timeline para eventos e checklist para execução. Não transformar tudo em chips ou cards.
- Nenhuma simplificação visual elimina permissões, filtros, paginação, rastreabilidade ou ações existentes.
- Texto de implementação não aparece para o usuário (ex.: exportação indisponível em relatórios).
- Ações de negócio mantêm texto (Iniciar protocolo, Aplicar, Efetivar reserva); ações recorrentes de linha usam ícone com tooltip e nome acessível.
- Estado vazio, busca sem resultado, falha de carga e falta de permissão são casos distintos.

### Primeira entrega (fase 1, implementada em 7 nov; plano em `2026-11-07-plano-fase-1-fundacao.md`)

1. Shell: usuário e Sair no rodapé da lateral; sino com contador. Já entregue no commit `71d51ba`.
2. Rótulos visíveis no login, com fundo mais escuro para manter contraste mínimo de 4,5:1 (cálculo sobre o CSS, não medição de pixels).
3. Ordem Cancelar / ação principal nos diálogos de clientes, produtos, usuários, peças, protocolos e execução de protocolo. Rodapé do `rma-block-panel`, Cancelar no estorno de peças e filtros de ordens de serviço ficam para a fase seguinte.
4. Texto de relatórios sem justificativa técnica da exportação.

Em seguida: piloto operacional no Kanban. O restante entra por fases, conforme a tabela de ordem de aplicação.

## Direção recomendada

Uma ferramenta de operação com uma linguagem comum em todo o produto: leitura rápida, poucas superfícies, ações previsíveis e detalhes disponíveis no contexto. O Kanban é a principal referência operacional, mas o escopo inclui login, navegação, dashboard, lista e abertura de ordens de serviço, atendimento, peças, clientes, produtos, protocolos, usuários, notificações e relatórios, com suas telas internas e estados.

Usar o Jira para o quadro e a organização do atendimento; Linear para densidade; Geist para estruturas discretas; Carbon para tabelas, ações em lote e formulários. Preservar o azul do Navitas. Um padrão comum deve oferecer composições adequadas a tarefas diferentes: uma tabela de estoque, um formulário de diagnóstico e um relatório não precisam ter o mesmo layout para pertencerem ao mesmo produto.

O pedido já define a preferência por cards enxutos, detalhe com conteúdo à esquerda e informações à direita, componentes uniformes, usuário no rodapé da navegação e ações recorrentes por ícone. As dimensões, cores e distribuições abaixo são propostas deste estudo; ainda precisam de avaliação com quem opera o sistema.

### Método e limites

- Pesquisa em documentação pública de Atlassian, Linear, Vercel, Nielsen Norman Group e W3C.
- Inspeção das 11 entradas de tela em `frontend/src/app/app.routes.ts`, dos templates de todos os módulos e dos painéis compartilhados de atendimento. Regras de visibilidade e ações também foram consultadas nos componentes e na navegação.
- Avaliação heurística; não houve observação de usuários, medição de tempo ou teste do sistema em execução.
- A URL privada do quadro NAV foi tentada, mas não ficou acessível pela ferramenta de pesquisa. O estudo usa referências públicas oficiais do Jira; não afirma reproduzir a configuração desse quadro.
- As visualizações usam dados fictícios. Os primeiros exemplos abaixo são explorações anteriores, com recorte de quatro etapas. A proposta global deve representar as nove etapas, visualizações salvas, seleção em lote, cliente, falha e SLA; não implica que essas funções já tenham sido implementadas em Angular.

### Material visual global

A [galeria do projeto inteiro](2026-11-07-galeria-telas.md) apresenta as 11 telas de entrada e exemplos de abertura de OS, atendimento, estoque, versões de protocolos, configurações e relatórios. A visualização de referência está em `visuals/navitas-projeto-completo.html` e usa a navegação do produto para explorar os módulos.

![Visão global do dashboard e navegação](../../output/playwright/global-dashboard.png)

![Editor de protocolo com edição focada do item](../../output/playwright/global-editor-protocolo.png)

## Cobertura do projeto inteiro

O inventário parte das rotas e de seus estados internos. `/cadastros`, a raiz e a rota desconhecida são redirecionamentos, não novos módulos. Garantia é um domínio presente em produtos, ordens de serviço e relatórios; não existe uma tela independente de garantias nesta versão.

| Tela de entrada | Telas internas e fluxos incluídos | Evidência principal |
| --- | --- | --- |
| Login | Credenciais, mostrar senha, validação, falha de autenticação, envio | `pages/login/login.component.html` |
| Dashboard | Indicadores, fila, auditoria, últimas ordens de serviço, carregamento e vazio | `pages/dashboard/dashboard.component.html` |
| Ordens de serviço | Lista, filtros, histórico por lote/série, paginação, abertura, detalhe e diagnóstico | `pages/rmas/rmas.component.html` |
| Kanban | Nove etapas, busca e 11 filtros, visualizações salvas, seleção em lote, status, responsável e detalhe | `pages/kanban/kanban.component.html`; `shared/kanban-bulk-actions` |
| Notificações | Caixa de entrada, não lidas/adiadas, adiar, preferências, regras administrativas e falhas de processamento | `pages/notifications/notifications.component.html` |
| Peças | Estoque, reposição, pendências por OS, cadastro, movimento, histórico e estorno | `pages/parts/parts.component.html` |
| Clientes | Lista, busca e filtros, paginação, criar/editar, confirmação de exclusão e erros | `pages/clients/clients.component.html` |
| Produtos | Lista, categoria/firmware, paginação, criar/editar, garantia padrão, versões e exclusão | `pages/products/products.component.html` |
| Protocolos | Catálogo, aplicação por produto/categoria, criar, publicar versão, itens, medições e etapas bloqueadas | `pages/protocols/protocols.component.html` |
| Usuários | Lista, perfil/status, paginação, criar/editar, senha, ativação e exclusão | `pages/users/users.component.html` |
| Relatórios | Laudo técnico, tempo por etapa, garantia por produto e devoluções; período, cliente, status, consulta e falhas | `pages/reports/reports.component.html` |
| Estrutura compartilhada | Navegação por perfil, usuário, sair, sino, controles, paginação, mensagens e modais | `layout/app-shell.component.html`; `shared/form-controls`; `shared/pagination` |
| Atendimento compartilhado | Produtos/garantia, diagnóstico, peças e reservas, protocolos e resultados, impedimentos, histórico e atribuição | `shared/rma-detail-modal`; `shared/rma-parts-panel`; `shared/rma-protocols`; `shared/rma-block-panel`; detalhe em `pages/rmas` |

### Achados globais mais relevantes

1. **A mesma entidade tem dois detalhes.** A lista de ordens de serviço já usa seis abas: Produtos, Diagnóstico, Peças, Protocolos, Impedimentos e Histórico (`RmasComponent.detailTabs`). O Kanban abre `RmaDetailModalComponent`, com blocos e linha do tempo, sem abas. A revisão externa estava correta sobre o modal do Kanban, mas a conclusão não deve ser generalizada para o projeto todo. Primeiro unificar o contrato de informação e o acesso às ações; reaproveitar os dois avanços existentes antes de decidir uma estrutura única.
2. **Estatísticas ocupam espaço em vários cadastros.** Clientes, produtos, usuários, peças, ordens de serviço e Kanban apresentam indicadores antes da lista/quadro. Avaliar a utilidade por tarefa: total pode ser contagem no título; indicadores de estoque podem orientar uma ação; métricas de gestão cabem no dashboard. Não retirar indicadores de todos os módulos automaticamente.
3. **Formulários repetem instruções e variam nas ações.** Frases como “preencha os dados principais” não acrescentam contexto. Havia rodapés com Salvar antes de Cancelar e outros com ordem inversa; a fase 1 padronizou a maioria (restam rma-block-panel, estorno de peças e filtros). Definir Cancelar à esquerda e ação principal à direita, mantendo esse arranjo em todos os diálogos.
4. **A abertura de OS mistura momentos do ciclo.** O formulário inclui recebimento, compra, falha, reparo, peças trocadas e testes. Propor agrupamento por momento operacional, preservando a possibilidade de registrar atendimento retroativo; não remover campos nem alterar sua obrigatoriedade sem validar o processo.
5. **Regras também precisam de hierarquia.** O editor de protocolos expõe configuração, etapas bloqueadas e muitos campos de cada item; regras de notificações acumulam seletores e checkboxes. Priorizar visão resumida e edição da regra/item selecionado.
6. **Relatórios têm conteúdo de produto a rever.** A tela expõe a justificativa técnica da exportação indisponível. O usuário precisa ver as opções disponíveis; detalhes de implementação pertencem à documentação. Manter período, instante de geração e critério da consulta, pois afetam a interpretação dos dados.
7. **Peças têm semântica própria.** Disponível, reservado e em estoque são valores distintos. Estorno é uma operação rastreável, não exclusão. O sistema visual deve tornar essas diferenças claras.

## Um sistema visual, cinco composições

| Composição | Aplicação | Estrutura comum |
| --- | --- | --- |
| Acesso | Login | Marca contida, rótulos persistentes, dois campos, ação principal e feedback local |
| Visão operacional | Dashboard | Indicadores úteis, fila acionável e atividade; números com contexto e escopo |
| Coleção | ordens de serviço, clientes, produtos, usuários, estoque e catálogo de protocolos | Cabeçalho, busca/filtros, tabela, ações de linha, paginação quando existente |
| Trabalho e configuração | Detalhe da OS, diagnóstico, protocolos, reservas, movimentos, regras | Seções por tarefa, campos alinhados, contexto preservado e ação explícita |
| Fluxo e análise | Kanban e relatórios | Quadro para etapas; tabelas/gráficos para comparação; mesmos controles, estados e linguagem |

A referência Carbon reúne busca, filtros e ações na barra da tabela e apresenta ações em lote após seleção. Adotar o princípio de hierarquia contextual, preservando as funções que o Navitas já oferece. [Tabelas e ações em lote](https://www.carbondesignsystem.com/building-blocks/core/components/data-table/guidelines).

### Decisões que valem para qualquer tela

- Cabeçalho de página com título, contagem quando útil e uma ação principal pertinente ao perfil.
- Mesma busca e mesma posição dos filtros. Busca não deve substituir o rótulo de um campo de cadastro.
- Mesmos controles, abas, estados de foco, mensagens, tooltips e rodapés de formulário.
- Tabelas para comparar registros; pares rótulo/valor organizados para propriedades; timeline para eventos; checklist para execução. Não transformar tudo em chips ou cards.
- Metadados e instruções de negócio permanecem quando orientam a decisão. Cortar repetição e frases genéricas, preservando nomes, unidades, datas e consequências.
- Nenhuma simplificação visual pode eliminar permissões, filtros, paginação, rastreabilidade ou ações existentes.
- Estado vazio sem registros é diferente de busca sem resultados, falha de carregamento e ausência de permissão.

## Recomendações por tela e fluxo

### Login

Manter a identidade no mesmo azul e na mesma tipografia do produto. Usar rótulos visíveis “Usuário” e “Senha”, além do mostrar/ocultar. O template atual já tem nomes acessíveis, mas os rótulos são visualmente ocultos e o placeholder desaparece durante a digitação. Preservar autocomplete e mensagens locais. Não inventar recuperação de senha ou autenticação externa sem suporte do produto.

Rótulos visíveis e curtos acima do campo ajudam a manter seu significado durante o preenchimento; placeholder não substitui rótulo. [GOV.UK: campos de texto](https://design-system.service.gov.uk/components/text-input/).

### Shell e navegação

Manter os grupos reais da navegação e a visibilidade por perfil. Usuário, função e Sair no rodapé da lateral, com menu contido se necessário. No cabeçalho, sino com contador e nome acessível. O usuário atual pode identificar qual sessão está aberta; não criar troca de perfil dentro do produto como se ela já existisse.

### Dashboard

Manter sua função de visão geral. Destacar fila prioritária e os indicadores já calculados, explicando período ou escopo quando necessário. A fila deve permitir chegar à OS correspondente. Auditoria usa a mesma linguagem de eventos do detalhe. Evitar reproduzir uma segunda lista extensa de ordens de serviço se ela não orientar uma ação diferente. Não inventar tendências, percentuais, metas ou comparações sem dados.

### Lista de ordens de serviço e histórico

Usar busca e filtro de status na barra comum; colocar consulta por lote/série em uma aba ou painel identificado como Histórico, preservando a busca especializada. Manter cliente, identificação, status e garantia por produto acessíveis. Códigos sem quebra; paginação real preservada. Indicadores calculados apenas sobre a página atual não podem parecer totais de toda a operação.

### Abertura de OS

Organizar em grupos de Atendimento, Produtos/identificação e Recebimento. Cliente, prioridade, nota fiscal, datas, lote/série, fabricação, falha, acessórios e condição física mantêm seu lugar no fluxo. Associar “Compra desconhecida” ao campo de compra. Itens repetidos usam linhas com campos alinhados e remoção por ícone com nome acessível. Reparo, peças trocadas e testes podem ficar em grupo avançado “Atendimento já realizado”, caso essa entrada seja necessária para registros retroativos.

Para formulários extensos, explorar área ampla ou página de edição em vez de apenas alargar qualquer modal. Agrupar tarefas relacionadas e manter os padrões de obrigatoriedade consistentes são princípios documentados pelo Carbon; a divisão exata do Navitas é proposta a validar. [Formulários](https://www.carbondesignsystem.com/building-blocks/core/patterns/forms).

### Atendimento e diagnóstico

Estabelecer um contrato comum de conteúdo entre os dois detalhes existentes. Preservar os blocos e a timeline do commit `4361b81`, confirmado no histórico. Preservar as seis seções já acessíveis na lista de ordens de serviço. O primeiro passo é facilitar o acesso consistente a produto, garantia, diagnóstico, peças, protocolos, impedimentos e histórico; a adoção de novas abas no Kanban permanece hipótese posterior.

Diagnóstico: falha encontrada primeiro; tipo, causa, data e técnico em campos organizados; notas separadas; ação “Salvar diagnóstico”. Respeitar permissões de ADMIN/TECHNICIAN. Não usar alertas ou chips para substituir texto técnico que precisa ser lido.

### Peças: estoque, reposição, movimento e reservas

No estoque, destacar disponível, unidade e mínimo; manter reservado e saldo total comparáveis. Cor de atenção acompanha texto “Repor” e números reais. Reposição conserva sugestão de compra e pendência por OS em grupos relacionados, sem concatenar nome, código e localização.

Cadastro de peça não altera saldo. Movimento apresenta tipo, quantidade/unidade, motivo e impacto antes/depois quando calculável. Histórico usa colunas para instante, tipo, variação, saldo, OS e autor. Estorno tem confirmação específica com motivo; conservar o movimento original.

Na OS, peças reservadas, pendentes e aplicadas têm estados e ações distintos. “Aplicar”, “Efetivar reserva” e “Cancelar reserva” são operações de negócio e continuam nomeadas; não trocá-las por ícones ambíguos. Mostrar custos com moeda e escopo, respeitando as permissões atuais.

### Clientes

Aplicar a composição comum de cadastro. Nome principal e nome fantasia só quando existente; contatos em posições previsíveis, com ícones auxiliares e valores visíveis. Ausências em células curtas podem usar “—” com contexto acessível, evitando repetir “Não informado” em todos os campos. Criar/editar com seções Identificação, Contato e Observações; exclusão com identificação clara do cliente e erro de vínculo apresentado no diálogo.

### Produtos

Tabela comum com SKU sem quebra, nome, categoria, versões e garantia. Distinguir hardware e firmware por campos/colunas em vez de frases concatenadas. Garantia padrão sempre com unidade “meses”. Formulário com Identificação, Versões e Garantia/observações técnicas. A categoria atualmente usa `input[list]`; se um seletor visual próprio for adotado, preservar a possibilidade de cadastrar categoria livre, sem substituí-la por uma lista fechada.

### Protocolos: catálogo e editor de versões

Catálogo com aplicação, versão atual, número de itens, estado e próxima ação. “Nova versão” continua explícito; não é edição retroativa. Preservar a regra de que execuções iniciadas usam a versão original.

Editor: configuração geral e etapas bloqueadas separadas da lista de itens; resumo de cada item e edição focada do item selecionado. Tipo determina campos adicionais de medição, unidade, casas decimais e limites. Obrigatório e Exige evidência usam o mesmo checkbox do produto. Instruções e resultado esperado têm espaço adequado. Publicar versão deve identificar a consequência; não esconder essa ação atrás de um lápis.

### Protocolos: execução na OS

Exibir nome e versão, progresso real dos itens obrigatórios e estado. Separar etapa, item e resultado. Medição mostra valor, unidade e faixa esperada; evidência e justificativa aparecem quando necessárias. Repetir registro conserva histórico e pede a justificativa prevista. Iniciar, Registrar resultado e Concluir são ações com texto. Não confundir progresso da inspeção com progresso percentual da OS.

### Usuários

Tabela com avatar/nome, usuário, perfil e estado. Ativo/inativo é indicador; só usar toggle se a interação realmente salvar a alteração. Formulário: identidade, acesso, perfil/estado e senha. Senha inicial obrigatória ao criar; nova senha opcional ao editar, com instrução curta. Preservar proteção contra exclusão da própria conta e as validações existentes. Não adicionar gestão de permissões granular inexistente.

### Notificações: entrada, preferências e regras

Entrada: um resumo acionável, ícone do evento, OS e instante. Manter marcar como lida e adiar sem dar o mesmo destaque à ação principal. Adiamento precisa ser identificável, sem multiplicar frases.

Preferências: separar recebendo, silenciado, desativado e obrigatório. Regra administrativa: resumo legível por evento; edição focada para severidade, destinatários, responsável, e-mail e possibilidade de silenciar. Falhas de processamento em uma seção administrativa própria, com erro completo disponível. Detalhes sobre implantação e configuração de servidor não precisam ocupar a rotina de quem lê alertas.

### Relatórios: quatro composições

- **Laudo técnico:** leitura por atendimento com identificação, produtos, falha, diagnóstico, reparo e testes. Evitar transformar textos longos em quatro colunas estreitas; usar resumo tabular com detalhe expandido por OS ou documento estruturado.
- **Tempo por etapa:** resumo comparável por etapa e tabela detalhada; se houver gráfico, valores e unidade devem ser os mesmos da consulta. Diferenciar média de máximo e excluir encerrados conforme a regra atual.
- **Garantia por produto:** compra, entrada, prazo, vencimento e estado em campos distintos. Compra desconhecida preserva pendência; nenhuma nova regra de cálculo é proposta.
- **Devoluções:** expedição, transportadora e rastreio; conservar o recorte atual por status Devolvido e explicitar que o período filtra a entrada da OS.

Todos mantêm período, filtros aplicados, instante de geração e atualização explícita. Exportação continua fora da proposta executável enquanto indisponível no produto; não desenhar botão funcional sem capacidade existente.

### Impedimentos e operações em lote

Impedimento: motivo, início, duração e resolução separados; bloquear/desbloquear com rótulo claro e nota obrigatória conforme a regra existente.

Lote: seleção visível, quantidade selecionada inclusive fora dos filtros atuais, confirmação com ação/escopo e resultado por OS. Sucesso parcial precisa continuar identificando falhas e mantendo a seleção dos itens que falharam. Não simplificar essa operação para um único toast de sucesso.

## Perfis e estados transversais

| Perfil atual | Acesso que a proposta deve preservar |
| --- | --- |
| Administrador | Navegação completa e ações administrativas, respeitando validações por operação |
| Atendimento | Dashboard, ordens de serviço, Kanban, notificações, peças, clientes e produtos; abertura de OS e gestão de estoque conforme componentes |
| Técnico | Dashboard, ordens de serviço, Kanban, notificações, peças e relatórios; diagnóstico, protocolos e reservas conforme regras |
| Consulta | Dashboard, ordens de serviço, Kanban, notificações, peças e relatórios; sem receber ações de alteração de OS reservadas a outros perfis |

Fonte: `app.routes.ts`, `NAV_GROUPS`, `canOpenRma`, `canRegisterDiagnosis`, `canManage`, `canReserve` e `canExecute`. A tabela resume o frontend; a autorização do backend permanece obrigatória e precisa de verificação na implementação. As preferências pessoais de notificações seguem suas próprias regras, inclusive para quem tem perfil de consulta.

Para cada tela e formulário, prever: carregando inicial; atualizando com dados existentes; vazio inicial; filtro sem resultado; falha com tentativa novamente; permissão insuficiente; validação de campo; salvando; sucesso; falha parcial quando aplicável. “Dados desatualizados” deve informar o instante da consulta quando isso afetar uma decisão.

## Tratamento da revisão externa enviada pelo usuário

| Observação do Claude | Verificação e decisão para o estudo |
| --- | --- |
| A proposta anterior simplifica o quadro | Confirmado: o primeiro mockup omitia funções reais. Nova representação deve manter nove etapas, visualizações e lote; o recorte antigo fica identificado como exploração |
| Cliente é importante na identificação | Risco plausível; manter cliente visível como base conservadora. Sua frequência de uso não foi medida neste estudo |
| Retirar SLA saudável e falha muda a triagem | Manter SLA saudável e resumo da falha na proposta base; testar qualquer ocultação separadamente |
| Prioridade só por ícone depende de compreensão | Manter nome acessível e tooltip; considerar rótulo curto na densidade padrão até validar |
| Abas podem gerar retrabalho | Commit `4361b81` confirmado. Há também seis abas no detalhe da lista. Harmonizar as experiências existentes antes de trocar a estrutura |
| Medidas e cores não têm comprovação empírica | Confirmado; continuam candidatos de design, sujeitos a contraste, responsividade e uso real |
| HTML não estima custo Angular | Confirmado; mockups são exploração visual. Complexidade e dependências abaixo são estimativas relativas, não prazo fechado |
| Shell → cabeçalho → card → modal | Ordem adequada para o primeiro piloto, dentro de um plano global de todos os módulos |

A revisão é insumo técnico externo; não representa aprovação do usuário para implementar mudanças ou restringir o estudo ao Kanban.

## Referências: o que adotar

### Jira / Atlassian Design System

A documentação descreve cards com resumo no topo, campos adicionais no meio e propriedades ao final; outros campos ficam no detalhe. Essa separação sustenta o card enxuto solicitado. A documentação também informa uma atualização gradual do quadro: configurações e aparência podem variar entre contas. [Cards do Jira](https://support.atlassian.com/jira-software-cloud/docs/customize-cards/).

Usar filtros rápidos para recortes recorrentes e colocar gestão de visualizações em um menu contextual. Essa organização se inspira na possibilidade de exibir filtros como botões acima do quadro. [Filtros do Jira](https://support.atlassian.com/jira-software-cloud/docs/configure-quick-filters/).

Adotar cores por função e uma escala limitada de espaçamento, em vez de escolher valores por tela. O ADS organiza cores por intenção e usa uma base de 8 px, com subdivisões. Os valores específicos do Navitas aparecem adiante como proposta própria. [Cores](https://atlassian.design/foundations/color), [espaçamento](https://atlassian.design/foundations/spacing).

Referência visual oficial, para observar a relação entre superfícies, cards e metadados: [quadro ilustrado na documentação de cores](https://atlassian.design/foundations/color/color-palette).

### Linear

O Linear não apresenta descrições nos cards e direciona a consulta de todas as propriedades para a abertura do item. Aproveitar a hierarquia curta e a clareza de estados. O SLA e os impedimentos da OS exigem adaptação ao domínio do Navitas. [Board layout](https://linear.app/docs/board-layout).

### Vercel / Geist

Usar como referência complementar para tabelas, indicadores e ações discretas. A documentação diferencia tabela para comparar registros, entidade para uma linha descritiva e pares de metadados para detalhes. Isso ajuda a escolher a estrutura pela tarefa, em vez de transformar tudo em cards. [Geist](https://vercel.com/geist/introduction), [tabelas e estruturas de dados](https://vercel.com/geist/table).

## Aplicação no Kanban e no detalhe compartilhado

### Quadro: reconhecer e priorizar

No cabeçalho: nome da tela e ação principal, quando o perfil puder executá-la. Abaixo: visualização atual, busca, filtros recorrentes e acesso aos filtros avançados. Contagem de resultados junto ao quadro. Remover instruções permanentes sobre arrastar; ajuda contextual pode explicar esse gesto na primeira utilização.

Mostrar inicialmente busca, responsável e SLA. A escolha precisa ser validada pela frequência de uso. Garantia, intervalos de entrada/atualização e outros filtros continuam acessíveis em um painel. Filtros ativos precisam ficar visíveis e ser removíveis; nunca esconder uma restrição aplicada.

O princípio é revelar opções especializadas quando necessárias, preservando as frequentes no primeiro nível. [Progressive disclosure](https://www.nngroup.com/articles/progressive-disclosure/).

O fluxo atual tem nove etapas. Na aplicação final, manter largura legível das colunas e navegação horizontal quando necessária; permitir recolher colunas e salvar esse recorte. Em telas estreitas, oferecer lista equivalente. Não comprimir nove colunas até os títulos ficarem ilegíveis.

### Card: contrato de conteúdo

1. Produto e falha resumida com hierarquia clara, mantendo o cliente visível. Evitar duas informações competindo como título. Não ocultar a falha na proposta base; disponibilizar texto completo no detalhe.
2. Etiqueta curta apenas quando ajudar a separar tipos de trabalho; não inserir frases, série, lote ou garantia por padrão.
3. Rodapé: chave sem quebra, ícone de prioridade e avatar. Prioridade e pessoa devem ter nome acessível e tooltip.
4. SLA: manter estado saudável em formato compacto, além das exceções e proximidade de vencimento com ícone e tempo; prazo exato no detalhe. Ocultar o estado saudável fica como hipótese separada para teste.
5. Bloqueio: indicador e rótulo curto sempre visíveis enquanto ativo; motivo e histórico no detalhe.
6. Não duplicar o status em cada card quando a coluna já o informa. Na lista, o status precisa reaparecer.

Clique ou Enter abre o detalhe. Seleção em lote não deve abrir o card; seu checkbox aparece em um modo explícito de seleção. Nenhuma ação essencial deve depender de hover. Arrastar continua disponível, com alternativa por clique no status; acessibilidade de teclado também precisa ser atendida. [W3C: alternativa ao arraste](https://www.w3.org/WAI/WCAG22/Understanding/dragging-movements.html).

### Detalhe: compreender e agir

Preservar a preferência informada: área principal à esquerda e informações à direita. A proporção de cerca de dois terços para conteúdo e um terço para propriedades é proposta de layout, não exigência do Jira nem aprovação formal de um novo desenho.

- Cabeçalho: chave, título principal, cliente e fechar.
- A exploração anterior mostrou **Visão geral**, **Itens**, **Atividade**, **Protocolos**. Ela não constitui o contrato final. A lista já tem Produtos, Diagnóstico, Peças, Protocolos, Impedimentos e Histórico; o Kanban tem blocos e timeline. Preservar as duas capacidades enquanto se avalia uma experiência comum.
- Lateral: status, responsável com avatar, prioridade, SLA com prazo e impedimento ativo; dados de atendimento em seção secundária.
- Visão geral: falha relatada primeiro, seguida do diagnóstico ou próximo passo relevante. Informação operacional não precisa virar alerta amarelo só por ser uma falha relatada.
- Itens: produto principal em destaque; SKU, série e lote em campos separados; garantia como estado curto. Para comparar muitos itens, usar tabela.
- Atividade: avatar, autor, instante, tipo de evento e mudança de estado. Exibir origem e destino com rótulos e seta. Comentário separado, sem repetir a mudança em uma frase extensa.
- Protocolos: progresso apenas quando houver checklist com conclusão mensurável; explicitar “3 de 5 etapas”. Não usar porcentagem inventada para representar progresso pelo fluxo de status.

Dimensionar o modal de forma estável dentro do espaço disponível: largura máxima proposta de 1120 px e altura limitada à janela, com cabeçalho, abas e ações acessíveis. Conteúdo longo pode precisar de rolagem em uma região definida. A promessa correta é reduzir rolagem desnecessária; não é possível garantir ausência de rolagem para históricos ilimitados, zoom ou telas pequenas. Dropdowns devem usar camada de overlay com reposicionamento, sem expandir o corpo rolável.

Na implementação final, abertura move o foco para o diálogo, Tab permanece nele, Escape fecha e o foco retorna ao gatilho. [W3C: diálogos modais](https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/).

## Fundação visual proposta

| Papel | Proposta inicial | Aplicação |
| --- | --- | --- |
| Marca / ação | `#236DA7` | Preserva o azul existente; primária e seleção |
| Texto principal | `#172B4D` | Títulos, valores, conteúdo operacional |
| Texto secundário | `#566171` | Rótulos, metadados e tempo |
| Superfície | `#FFFFFF` | Conteúdo e cards |
| Fundo secundário | `#F7F8FA` | Colunas e navegação |
| Divisória | `#DFE3E8` | Limites leves; não deve ser a única indicação de um controle |

Estados adicionais: informação `#155D94`, sucesso `#216E4E`, atenção `#7F5F01`, perigo `#AE2A19`, acompanhados de fundos suaves e texto/ícone. São candidatos, sujeitos a validação por combinação e estado. Acentos não devem mudar entre páginas.

Fonte: manter **Segoe UI**, com fallback de sistema, em todo o produto. Proposta de escala: 24/32 para página, 20/28 para título do detalhe, 16/24 para seção, 14/20 para corpo e controles, 12/16 para metadados curtos. Pesos 400, 500 e 600. Não usar caixa alta em todos os títulos. A documentação da Atlassian reforça hierarquia por estilos e reserva os menores tamanhos a usos limitados. [Tipografia](https://atlassian.design/foundations/typography/applying-typography).

Espaçamento: 4, 8, 12, 16, 24 e 32 px. Controles de uma mesma barra: 36 px no desktop; 44 px como proposta de alvo confortável em toque. Ícones: 16 ou 20 px dentro do alvo. Raios: 6 px em controles, 8 px em cards e 12 px em diálogo. Sombras para elevação real, como menus e modal. Sem gradientes decorativos nos módulos de operação.

Contraste de texto normal: pelo menos 4,5:1; texto grande tem limiar distinto. O mínimo AA para alvos de ponteiro é 24×24 CSS px, com exceções; 44 px é a recomendação de conforto adotada aqui, não o mínimo AA. Testar foco, estados e tema escuro separadamente. [Contraste](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html), [alvos](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html).

## Contrato dos componentes

| Componente | Regra comum |
| --- | --- |
| Cabeçalho | Mesmo alinhamento, título e espaço para ações; subtítulo só se acrescentar informação |
| Botões | Uma primária por área de decisão; secundária neutra; ação de linha recorrente por ícone |
| Ação destrutiva | Lixeira e tratamento de perigo; confirmação proporcional à consequência; não depender apenas do vermelho |
| Tooltip | Acionado por hover e foco; nome acessível no controle; não guardar informação indispensável apenas nele |
| Checkbox | Um estilo, rótulo clicável e estados selecionado, parcial, foco, erro e desabilitado |
| Select | Um componente visual compartilhado; busca quando a lista justificar; teclado, nome, seleção, escape e foco definidos |
| Abas | Mesma altura, espaçamento e indicador; painel associado; teclado; sem abas somente decorativas |
| Status | Cor + texto ou forma reconhecível; azul para andamento, neutro para espera comum, amarelo para atenção, verde para resultado favorável |
| Avatar | Tamanho e fallback comuns; nome disponível; nunca usar iniciais sem contexto acessível |
| Progresso | Somente medida real; numerador e denominador disponíveis |
| Estado vazio | Título específico, no máximo uma orientação e próxima ação pertinente |
| Feedback | Proximidade com a ação; mensagem de erro acionável; evitar banner global para cada pequena atualização |

A Atlassian recomenda usar botão primário para a ação de maior importância e limitar sua presença por área. [Botões](https://atlassian.design/components/button/examples).

## Escrita: reduzir sem tornar ambíguo

| Evitar | Preferir |
| --- | --- |
| `Cliente: Solar Sul \| Prioridade: Alta \| Responsável: Ana` | Cliente em posição própria; prioridade por ícone com nome; avatar com nome |
| `Item 1 · SKU: Pendente` como chip | Nome do produto; campo SKU com estado “Não informado” no detalhe |
| `Abrir` ao final de todas as linhas | Título como link ou ação por ícone com nome acessível |
| Botões de linha `Editar` e `Excluir` repetidos | Lápis e lixeira com tooltip e nome acessível |
| `admin moveu para Triagem` repetido em texto corrido | Autor + instante; origem → destino; comentário em bloco separado |
| `Nenhum registro foi encontrado no sistema` | `Nenhuma OS encontrada` e ação para limpar filtros, se houver filtros |
| `Ocorreu um erro` | `Não foi possível salvar o status. Tente novamente.`; preservar os dados digitados |

Manter palavras em ações específicas do negócio: **Iniciar protocolo**, **Salvar diagnóstico**, **Concluir reparo**. Um ícone pouco conhecido pode aumentar esforço; o reconhecimento depende da experiência anterior. Ações recorrentes por ícone atendem ao pedido, mas precisam de verificação de compreensão. [Usabilidade de ícones](https://www.nngroup.com/articles/icon-usability/).

Pares rótulo/valor continuam adequados em metadados organizados. O problema é concatená-los em texto corrido ou dar o mesmo peso a todos. A orientação de conteúdo é linguagem clara, concisa e consistente; mensagens devem informar o problema e o próximo passo quando houver. [Conteúdo](https://atlassian.design/foundations/content/), [mensagens](https://atlassian.design/foundations/content/designing-messages).

## Ordem de aplicação para o projeto inteiro

| Etapa | Entrega | Esforço relativo inicial | Dependências e risco |
| --- | --- | --- | --- |
| Fundação global | Contratos de tipografia, controles, ações, estados, cabeçalhos e overlay; shell e login | Baixo a médio | Layout responsivo, acesso por perfil, foco e encerramento da sessão |
| Coleções | Clientes, produtos, usuários, catálogo de protocolos e tabela de estoque com a mesma composição | Médio | Paginação, busca, categorias livres, validação e exclusões |
| Piloto operacional | Cabeçalho/filtros do Kanban, card conservador, visualizações e lote preservados | Médio a alto | Arraste, seleção fora do filtro, permissões, SLA e resultados parciais |
| Ciclo do atendimento | Lista/histórico e abertura de ordens de serviço, diagnóstico e contrato comum dos dois detalhes | Alto | Itens, garantia, registros retroativos, dados por etapa e trabalho recente do modal |
| Operações especializadas | Protocolos/versões/execuções, reservas, movimentos, estornos e impedimentos | Alto | Rastreabilidade, medições, restrições de status e estoque |
| Comunicação e análise | Notificações, preferências/regras/falhas, dashboard e quatro relatórios | Médio a alto | Escopo das métricas, dados temporais, configurações administrativas e textos técnicos |

O shell pode ser a primeira mudança entregue por atingir todas as telas. O Kanban pode ser o primeiro piloto operacional, sem limitar o alcance global do estudo. Abas novas no modal são uma hipótese posterior, não um requisito de início. Essas faixas não equivalem a dias ou sprints; faltam decomposição técnica e validação em Angular para estimar prazo.

Não é necessário substituir Angular nem adotar bibliotecas React das referências. A implementação deve aproveitar os componentes compartilhados existentes e introduzir novos apenas para padrões recorrentes já identificados.

## Como validar a proposta

Antes de expandir a mudança, comparar a interface atual e a proposta com operadores em tarefas reais:

- Encontrar a OS mais urgente e identificar responsável e impedimento.
- Localizar uma OS pelo cliente, série ou código; aplicar e remover um filtro.
- Abrir o detalhe, consultar a garantia e entender a última movimentação.
- Mudar status sem arrastar e iniciar um protocolo.
- Percorrer o fluxo por teclado e com zoom de 200%; avaliar a lista alternativa em tela estreita.

Registrar sucesso da tarefa, tempo, erros, retornos desnecessários e dúvidas. Metas numéricas devem ser definidas após medir a situação atual. Ainda não há evidência de ganho percentual ou de conformidade integral com WCAG.

Também avaliar cadastro de cliente/produto, edição de usuário, abertura com múltiplos produtos, consulta por lote/série, reserva e consumo de peça, estorno, publicação e execução de protocolo, adiamento de alerta e os quatro relatórios. O roteiro de validação deve alcançar os perfis reais de cada módulo.

Decisões a validar: redução posterior do card, filtros mais frequentes, estrutura comum dos dois detalhes, agrupamento de campos retroativos e edição focada de regras/itens. Cliente, falha e SLA permanecem na proposta conservadora. O estudo cobre o produto inteiro; a implementação pode ser entregue por etapas.

### Conferência do material apresentado

As propostas foram abertas no navegador e inspecionadas por captura de tela em desktop e largura estreita. Foram exercitados busca, filtros de responsável e SLA, abertura e fechamento do detalhe, abas, progresso do checklist, exibição de impedimento, navegação para produtos e leitura de notificações. O select da amostra foi operado por teclado. Ambos os exemplos foram conferidos com área de conteúdo de 320 px sem transbordamento horizontal. A sintaxe dos scripts foi verificada; o console do exemplo principal não apresentou erros nessa verificação. Isso valida a apresentação exploratória, sem substituir testes da aplicação Angular, avaliação de acessibilidade ou pesquisa com operadores.

Na ampliação global, as 11 telas de entrada foram percorridas e registradas em imagens. Também foram exploradas seções internas de atendimento, abertura de OS, editor e execução de protocolos, reposição/movimento de estoque, preferências/regras de notificações e os quatro relatórios. O protótipo representa composições e permite navegação, sem reproduzir toda a validação, persistência, autenticação ou resposta a falhas da aplicação. Alguns filtros, relatórios e operações usam estados demonstrativos; não constituem uma implementação funcional equivalente em Angular.

Na conferência do exemplo global, foram verificadas nove colunas no Kanban, a representação dos 11 filtros (busca mais dez campos avançados), seleção em lote com itens fora dos filtros, seis seções no detalhe da lista e proteção visual da exclusão da própria conta. As dez telas internas ao shell foram percorridas em área de conteúdo de 320 px sem transbordamento horizontal da página; tabelas e quadro conservam rolagem própria quando necessária. Isso não equivale a uma validação completa de todos os formulários em celular.

## Apêndice: material histórico

Explorações e diagnóstico da primeira fase, mantidos como referência. A proposta atual está nas seções anteriores.

### A. Explorações iniciais do Kanban (histórico)

Os exemplos a seguir pertencem à primeira exploração e não substituem a proposta global. O recorte de quatro etapas e a ocultação de alguns metadados não são o contrato conservador atual.

Quadro inicial com filtros curtos, títulos principais e exceções operacionais visíveis:

![Proposta do Kanban com dados fictícios](../../output/playwright/navitas-kanban.png)

Detalhe com conteúdo à esquerda e propriedades à direita:

![Proposta do detalhe de uma OS com dados fictícios](../../output/playwright/navitas-detalhe.png)

Atividade organizada por autor, horário e transição:

![Proposta da atividade com dados fictícios](../../output/playwright/navitas-atividade.png)

Exemplos da linguagem comum de ações, campos e estados:

![Amostra dos componentes propostos](../../output/playwright/navitas-componentes.png)

### B. Diagnóstico do estado atual do Kanban e do shell

Algumas reclamações anteriores já foram parcialmente tratadas no código. É importante preservar esses avanços.

| Evidência atual | Leitura de UX | Direção proposta |
| --- | --- | --- |
| `frontend/src/styles.css:57`: checkbox global; `shared/form-controls/custom-select`: select compartilhado | Há uma base comum de controles | Consolidar estados e geometria dessa base, sem criar outro conjunto paralelo |
| `pages/products/products.component.html:120`: editar e excluir por ícone; padrão também em clientes e usuários | Ações de linha já estão mais discretas | Padronizar tooltip acessível e alvo de interação; evitar depender apenas de `title` |
| `pages/kanban/kanban.component.html:9`: quatro estatísticas antes do quadro; linhas 44 e 97: visualizações e 11 campos de filtro | Muitos níveis disputam a primeira tela com o trabalho | Cabeçalho curto, busca e filtros rápidos; campos avançados em painel; métricas completas em visão de gestão |
| `pages/kanban/kanban.component.css:11`: gradiente próprio; componente do quadro: coluna com faixa colorida, painel, card e sombras | Excesso de molduras e cores com significado pouco estável | Superfícies neutras, separação por espaço, cor concentrada em seleção e estados |
| `shared/rma-kanban-board/rma-kanban-board.component.html:46`: código e cliente; linha 59: produto, falha, SLA, bloqueio e data | O card ainda apresenta vários níveis de texto | Um título, etiqueta curta se útil, chave, prioridade e responsável; exceções de SLA/bloqueio explícitas |
| `shared/rma-detail-modal/rma-detail-modal.component.html:10`: duas colunas; linha 98: atividade com avatar e transição | A estrutura desejada e parte da linguagem visual já existem | Manter a arquitetura; reduzir empilhamento e melhorar hierarquia, sem recomeçar o detalhe |
| `shared/rma-detail-modal/rma-detail-modal.component.css`: cada seção tem borda, fundo e título em caixa alta | As seções têm tratamento semelhante apesar de importâncias diferentes | Títulos em sentence case, espaços consistentes, divisórias leves; destaque apenas para exceções reais |
| `pages/notifications/notifications.component.html:46`: evento, título, mensagem e várias ações em cada alerta | Repetição e competição entre ações | Ícone do evento, um resumo, chave e tempo; acesso à OS e ações auxiliares discretas |
| `layout/app-shell.component.html:44`: usuário no topo; saída na sequência; notificação com texto (estado anterior ao commit `71d51ba`) | Resolvido: usuário na lateral e sino com contador | Usuário no rodapé da lateral; sino com contador e nome acessível no cabeçalho |

Esses achados indicam oportunidades; não provam perda de produtividade nem falhas de acessibilidade em toda a aplicação.
