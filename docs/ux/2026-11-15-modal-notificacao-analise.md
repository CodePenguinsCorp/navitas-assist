# Análise do detalhe de notificação - 15/11/2026

## Diagnóstico
O modal acumula borda externa, resumo tintado, quatro subcartões e outra caixa de metadados. Os níveis sugerem grupos que não existem. Valores igualmente destacados escondem o evento; o título Resumo não informa nada. Navegação e ação principal ficam distantes, sem uma sequência clara de leitura e decisão.

## Referências pesquisadas
- [Linear Inbox](https://linear.app/docs/inbox): detalhe ligado à tarefa, navegação e adiamento contextual.
- [GitHub Inbox](https://docs.github.com/en/subscriptions-and-notifications/how-tos/viewing-and-triaging-notifications/managing-notifications-from-your-inbox): leitura e triagem do assunto com ações contextuais.
- [Jira / Atlassian](https://atlassian.design/components/modal-dialog): referência de diálogo; página sem conteúdo textual extraível nesta consulta.
- [Stripe Workbench](https://stripe.dev/blog/simple-error-handling-strategies-with-stripe-workbench): investigar o evento e o recurso associado, sem confundir evento e objeto.
- [Slack Activity](https://slack.com/help/articles/19693583638803-Get-your-work-done-from-the-Activity-view): contexto da atividade e ação sobre o item.
- [Material 3](https://m3.material.io/components/dialogs/guidelines): referência consultada, mas depende de JavaScript; não foi possível confirmar a composição visual.
- [Carbon](https://www.carbondesignsystem.com/components/modal/usage/): cabeçalho, corpo e rodapé; tamanho proporcional ao conteúdo e ações no rodapé.

A superfície única, a lista com divisórias finas e a hierarquia por espaço e tipografia são a síntese adotada para este projeto. Não se afirma que os sete produtos usam exatamente esse desenho ou que suas telas foram inspecionadas em navegador.

## Referências locais e desenho final
Lidos padroes-visuais.md, auditoria-visual-2026-11.md, detalhe da OS, sino e página de notificações. Reutilizar appModalFocus, app-icon, custom-select, mini-chip apenas para código e os utilitários de severidade/data já compartilhados. O detalhe da OS oferece a referência semântica de dl/dt/dd, sem copiar suas caixas para um conteúdo muito menor.

Uma superfície branca de até 520 px. Cabeçalho com ícone pequeno de severidade, título forte, código e linha discreta com tempo relativo, data absoluta e leitura. Corpo com frase de evento e pares rótulo/valor em colunas, valores regulares e quebra integral, separados apenas por linhas de 1 px. Conteúdo não reconhecido permanece literal, inclusive quebras. Sem título Resumo nem cartões internos. Rodapé reúne navegação e contador; Adiar discreto e Abrir OS primário à direita. Em celular os grupos de ações quebram linha, mantendo alvos de 40 px.

Cartões foram descartados por repetirem a causa da reprovação; parágrafo único foi descartado por apagar a hierarquia. Os tokens --space-*, --muted, --line e a escala tipográfica existente bastam. Sino e página já usam os mesmos utilitários semânticos, portanto não precisam de alteração de comportamento ou redesenho.

## Execução e verificação
Primeiro atualizar specs e observar falha de estrutura; depois trocar template/CSS e a frase dos formatos reconhecidos. Preservar os outputs, regras e diretiva de foco. Rodar suíte completa com TZ=UTC e build sem avisos. Não haverá conferência em navegador; dimensões, aparência real e retorno de foco no navegador continuam sujeitos a conferência manual.
