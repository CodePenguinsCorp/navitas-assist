# Navitas Assist — galeria global de UI e UX

7 de novembro de 2026. Propostas com dados fictícios, sem alteração das telas em produção. A fundamentação, as evidências e as decisões estão no [estudo global](2026-11-06-estudo-ui-ux.md).

As imagens representam as 11 entradas de tela do projeto e exemplos dos fluxos internos. O padrão comum é aplicado à tarefa de cada módulo: formulários, tabelas, configurações, atendimento, quadro e relatórios. A navegação está disponível na visualização `visuals/navitas-projeto-completo.html`.

São mockups exploratórios: nem todos os controles, salvamentos e filtros reproduzem o comportamento completo do sistema. Arraste e alterações locais não validam regras de protocolo, estoque ou permissões do backend. As regras atuais continuam sendo a referência para a implementação futura.

## Telas de entrada

| Operação | Cadastros e configuração | Acesso e análise |
| --- | --- | --- |
| [Dashboard](#dashboard) | [Clientes](#clientes) | [Login](#login) |
| [ordens de serviço](#rmas) | [Produtos](#produtos) | [Relatórios](#relatórios) |
| [Kanban](#kanban) | [Protocolos](#protocolos) | |
| [Peças](#peças) | [Usuários](#usuários) | |
| [Notificações](#notificações) | | |

### Dashboard

Visão operacional com indicadores contextualizados, fila acionável e atividade. Os números são exemplos fictícios, não métricas reais da empresa.

![Proposta do dashboard](../../output/playwright/global-dashboard.png)

### ordens de serviço

Coleção com busca, acesso ao histórico por lote/série e abertura do atendimento. Os dados detalhados de garantia, prioridade, entrada e identificação continuam no contrato de informação; a definição de colunas padrão deve ser validada.

![Proposta da lista de ordens de serviço](../../output/playwright/global-rmas.png)

### Kanban

As nove etapas existentes são representadas, com rolagem horizontal. A captura mostra apenas a área visível. Cliente, falha resumida e SLA saudável permanecem no card; visualizações e seleção em lote têm acesso explícito.

![Proposta do Kanban completo](../../output/playwright/global-kanban.png)

### Peças

Estoque, reservado, disponível e mínimo mantêm significados distintos. Operações de histórico, movimento e edição usam ações recorrentes com nome acessível.

![Proposta do estoque de peças](../../output/playwright/global-pecas.png)

### Clientes

O mesmo cabeçalho, barra de busca, tabela, paginação e ações usados nos demais cadastros, preservando os campos próprios do cliente.

![Proposta do cadastro de clientes](../../output/playwright/global-clientes.png)

### Produtos

SKU e nome identificam o produto; categoria, hardware, firmware e garantia aparecem em posições comparáveis. A categoria livre existente deve ser preservada na implementação.

![Proposta do catálogo de produtos](../../output/playwright/global-produtos.png)

### Protocolos

Catálogo com aplicação, versão e quantidade de itens. Publicar uma nova versão permanece uma ação explícita, diferente de editar uma execução já iniciada.

![Proposta do catálogo de protocolos](../../output/playwright/global-protocolos.png)

### Usuários

Identidade, usuário, perfil e estado separados. Estado é indicador; o formulário controla a alteração. A ação de excluir a própria conta é desabilitada.

![Proposta da administração de usuários](../../output/playwright/global-usuarios.png)

### Notificações

Um resumo, ícone de evento, referência da OS, instante e ações discretas. Preferências e regras são seções distintas da caixa de entrada.

![Proposta da caixa de notificações](../../output/playwright/global-notificacoes.png)

### Relatórios

As quatro consultas existentes permanecem acessíveis. Período e geração são visíveis. O laudo longo é consultado por atendimento, em vez de comprimido em várias colunas de texto.

![Proposta dos relatórios](../../output/playwright/global-relatorios.png)

### Login

Mesma identidade visual e geometria dos controles. Rótulos persistentes e mostrar/ocultar senha. Na aplicação real, preservar autocomplete e o fluxo de autenticação existente; este exemplo permite apenas entrar na demonstração.

![Proposta do login](../../output/playwright/global-login.png)

## Fluxos internos

### Abertura de OS

Grupos de Atendimento, Produtos, Recebimento e Atendimento já realizado. A organização é uma proposta para discussão; campos de negócio não foram removidos. A implementação precisa preservar dados e validações ao trocar de grupo.

![Proposta de abertura de OS](../../output/playwright/global-novo-rma.png)

### Detalhe da OS pela lista

Preservação das seis seções que já existem na lista. O detalhe do Kanban ainda pode aproveitar seus blocos e timeline; harmonizar o acesso à informação antes de substituir sua estrutura.

![Proposta do detalhe de OS](../../output/playwright/global-detalhe-rma.png)

### Execução de protocolo

Versão e progresso dos itens, resultados e ações de registro em posições distintas. Os tipos de item, evidências e justificativas continuam sujeitos às regras atuais.

![Proposta de execução de protocolo no atendimento](../../output/playwright/global-execucao-protocolo.png)

### Editor de protocolo

Lista resumida de itens e edição focada. A seleção do tipo determina quais parâmetros de medição são necessários. Publicação identifica a consequência para a versão.

![Proposta do editor de protocolo](../../output/playwright/global-editor-protocolo.png)

### Reposição de peças

Sugestão de compra e pendências por atendimento agrupadas pela tarefa.

![Proposta da reposição de peças](../../output/playwright/global-reposicao.png)

### Movimento de estoque

Quantidade, unidade, motivo e contexto do saldo. O cadastro da peça não altera estoque. Estorno mantém o movimento original no histórico.

![Proposta de movimento de estoque](../../output/playwright/global-movimento.png)

### Preferências de notificações

Alerta obrigatório, recebendo e silenciado são situações diferentes. Evitar um único indicador ligado/desligado para todos esses casos.

![Proposta de preferências de notificações](../../output/playwright/global-preferencias.png)

### Regras de notificações

Resumo por evento, severidade, destinatários e edição focada. Falhas de processamento ficam na área administrativa.

![Proposta das regras de notificações](../../output/playwright/global-regras.png)

### Tempo por etapa

Quantidade, média e máximo com unidade; detalhamento por atendimento e contexto temporal preservados. Valores ilustrativos.

![Proposta de tempo por etapa](../../output/playwright/global-tempo-etapa.png)

### Garantia por produto

Compra, entrada, prazo e estado separados. Compra desconhecida mantém pendência, sem mudança na regra de cálculo.

![Proposta de relatório de garantia](../../output/playwright/global-garantia.png)

### Devoluções

Atendimento, cliente, expedição, transportadora e rastreio. O período continua baseado na entrada da OS, conforme o sistema atual.

![Proposta do relatório de devoluções](../../output/playwright/global-devolucoes.png)

## Contratos documentados além dos exemplos

### Seleção em lote e filtros avançados

O quadro mantém as nove etapas e diferencia selecionados visíveis de selecionados fora do filtro atual. A consulta completa continua acessível, com a busca na barra e dez campos no painel avançado.

![Seleção em lote com itens fora dos filtros](../../output/playwright/global-kanban-lote.png)

![Filtros avançados do quadro](../../output/playwright/global-kanban-filtros.png)

O estudo global também especifica filtros avançados, visualizações salvas, seleção em lote e resultados parciais; diagnóstico; criar/editar e excluir cadastros; peças reservadas, consumo, cancelamento, histórico e estorno; bloqueio/resolução de impedimentos; registro de resultados com evidência/justificativa; validação, carregamento, erros, vazio e permissões.

A galeria apresenta exemplos representativos desses padrões. Não afirma que cada variação e cada estado do sistema já tenha um desenho final ou implementação aprovada.
