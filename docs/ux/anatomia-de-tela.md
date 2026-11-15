# Anatomia de tela

Documento normativo. Define o esqueleto fixo de cada tipo de tela, o bloco compartilhado que ocupa cada posição e o que é proibido. O [catálogo de padrões visuais](padroes-visuais.md) descreve cada componente; este documento diz **onde cada um entra**. Se uma tela precisa de algo que o esqueleto não prevê, o esqueleto é que muda (neste arquivo, na mesma entrega), nunca a tela em separado.

## 1. Fluxo obrigatório para qualquer tarefa de UI

1. Leia este documento e identifique o **tipo de tela** (seção 3).
2. Monte a tela só com os blocos da seção 2. Antes de escrever CSS, procure o bloco no inventário.
3. Cite o tipo de tela na descrição do commit ou do pedido de revisão (ex.: "tipo: lista com filtros e resumo").
4. Passe o checklist da seção 8 e o [checklist de revisão](padroes-visuais.md#5-checklist-de-revisão-de-tela-nova).
5. Rode o spec `src/app/testing/ui-guard.spec.ts` (já roda no `npm test`). Ele falha se a dívida de CSS crescer (seção 7).

Corrija a família, não o caso: ao mexer em um bloco, procure todos os usos dele.

## 2. Inventário dos blocos compartilhados

| Bloco | Onde vive | Papel |
| --- | --- | --- |
| `app-page-header` | `shared/page-header` | Título (`h1`) e ações da página. Só isso. |
| `.page-summary` / `.page-summary__item` | `styles.css` | Único indicador do sistema. Item estático ou clicável (`button.page-summary__item`, `aria-pressed`). Tom por `.tone-*`. |
| `.panel.table-card` e `.table-card--list` | `styles.css` | Painel de conteúdo com tabela. Cabeçalho tonal, zebra, hover. |
| `.table-wrap`, `.table-title`, `.table-subtitle`, `.table-actions-col`, `.num` | `styles.css` | Rolagem horizontal, primeira coluna, ações, números à direita. |
| `app-pagination`, `app-result-count` | `shared/` | Rodapé de lista paginada: contagem, por página, anterior e próxima. |
| `.table-card__footer` | `styles.css` | Rodapé do painel: paginação à esquerda e ações finais à direita. |
| `.form-actions` | `styles.css` | Ações finais: Cancelar (neutro) à esquerda do principal, alinhadas à direita. |
| `.catalog-toolbar`, `.search-field`, `.filter-field`, `.kanban-filters__bar` | `styles.css` | Barra de busca e filtros. |
| `app-collapsible-section` | `shared/` | Seção recolhível de cartão de detalhe. |
| `.record-rows`, `.record-row`, `.record-stats`, `.record-fields`, `.record-empty` | `styles.css` | Cartão de registro (uso de peça, componente, intervenção, movimento, impedimento). |
| `button[appRowAction]` | `shared/row-action` | Ação de linha ou cabeçalho em ícone. |
| `.status-chip`, `.mini-chip`, `.tone-chip`, `.count-badge`, `.warranty-tag`, `.priority-tag` | `styles.css`, `core/utils/rma-ui.ts` | Chips. Famílias do catálogo, ver padroes-visuais 3.2. |
| `.empty-state` e `.icon-tile` | `styles.css` | Vazio, erro de carga. |
| `.alert-banner--error` | `styles.css` | Erro de ação. |
| `ToastService` e `app-toast-outlet` | `core/`, `shared/` | Sucesso. |
| `.modal-overlay` e `.modal-panel--sm|--md|--lg` | `styles.css` | Modal (seção 5). |
| `.inline-form`, `.field-group`, `fieldset.form-section` | `styles.css` | Formulários. |
| `app-custom-select`, `app-date-picker`, `app-suggest-input` | `shared/form-controls` | Seletor, data, texto com sugestões. |
| `app-donut-chart`, `app-bar-chart` | `shared/` | Gráficos. |
| `appTip` | `shared/tip` | Dica. |

## 3. Esqueletos por tipo de tela

Cada esqueleto lista as posições **na ordem**. Posição opcional vem entre colchetes. Não se inverte a ordem nem se acrescenta posição.

### 3.1 Lista de cadastro (Clientes, Produtos, Perfis, Usuários, Protocolos)

```
app-page-header (h1)  + ações: Importar CSV, Exportar, Novo (primário, por último)
barra de busca e filtros   .catalog-toolbar--filters
painel de conteúdo         .panel.table-card.table-card--list > .table-wrap > table
rodapé                     app-pagination (dentro do painel)
```

Estados: carregando (`aria-busy` e overlay), vazio sem dado, vazio por filtro com "Limpar busca e filtros", erro de carga (`.empty-state` com `role="alert"` e "Tentar novamente"). Edição e exclusão por modal (3.5, 3.6).

### 3.2 Lista com filtros e resumo (OS, Peças)

```
app-page-header (h1) + ações
resumo                     .page-summary (itens clicáveis quando filtram)
barra de busca e filtros   .kanban-filters__bar ou .catalog-toolbar--filters
painel de conteúdo         .panel.table-card.table-card--list (tabela ou .record-rows)
rodapé                     app-pagination
```

Detalhe abre em modal grande (3.4). O resumo vem **antes** dos filtros; filtros avançados ficam recolhidos.

### 3.3 Kanban

```
app-page-header (h1) + ações
resumo                     .page-summary
barra de filtros           .kanban-filters__bar
quadro                     app-rma-kanban-board (colunas por status)
```

Sem paginação. Detalhe abre no modal grande da OS, com Anterior e Próxima.

### 3.4 Detalhe em modal (OS lista e Kanban, notificação)

```
.modal-header              título (h3) + .modal-close
[alerta de erro]           .alert-banner--error.modal-feedback (topo do corpo)
corpo com rolagem          abas ou cartões; cartões longos com app-collapsible-section
rodapé fixo                ações (Anterior e Próxima à esquerda, Fechar à direita)
```

Tamanho: grande para a OS, médio para a notificação. Seções do corpo seguem a escala tipográfica da seção 6.

### 3.5 Formulário em modal (cadastros, movimentar estoque, regra de notificação)

```
.modal-header              título curto + .modal-close
[alerta de erro]           .alert-banner--error.modal-feedback
corpo com rolagem          form.form-grid > fieldset.form-section > .field-group
rodapé fixo                .form-actions: Cancelar (neutro), ação principal
```

Tamanho médio. Mais de dois campos usa modal; um ou dois campos usa formulário inline (3.6).

### 3.6 Formulário inline (detalhe da OS)

```
cabeçalho da seção         título + ação que abre o formulário
.inline-form               .field-group (obrigatório com asterisco) + .inline-form__actions
registros                  .record-rows
```

O formulário abre pela ação do cabeçalho; o texto de vazio some enquanto ele está aberto.

### 3.7 Confirmação e exclusão (modal pequeno)

```
.modal-header              título (pergunta) + .modal-close
corpo                      uma ou duas frases curtas, nome do item
rodapé fixo                .form-actions: Voltar ou Cancelar (foco inicial), ação (perigo se destrói)
```

### 3.8 Prévia e importação (CSV de clientes e produtos)

```
app-page-header (h1) com seta de voltar (3.11)
painel 1. Modelo           ação de baixar o modelo
painel 2. Arquivo          campo de arquivo, "Gerar prévia", erro
painel 3. Prévia           texto do arquivo
                           .page-summary clicável (Válidas, Inválidas, Duplicadas)
                           tabela .table-card com chip de situação
                           rodapé .table-card__footer: app-pagination e, abaixo, .form-actions--end com Importar à direita
```

Não há "Cancelar" de página: sair é a seta de voltar do cabeçalho, e trocar o arquivo é escolher outro no passo 2. O rodapé fica só com a ação primária. É a tela-modelo para qualquer fluxo "enviar, conferir, confirmar".

### 3.9 Relatórios

```
app-page-header (h1) + ações (período, exportar)
resumo                     .page-summary
abas                       .tab-list
painéis de conteúdo        .panel.table-card com tabela, app-donut-chart ou app-bar-chart (máx. 3 gráficos por aba)
```

### 3.10 Notificações

```
app-page-header (h1) + ações
abas                       .tab-list (caixa de entrada, regras, canais)
barra de filtros           .inbox-filters (no padrão do Kanban)
lista                      itens-botão com ponto de não lida e chevron
rodapé                     app-pagination
```

Detalhe em modal médio. Regra de notificação em modal médio.

### 3.11 Sub-página (importação e qualquer página fora do menu)

Toda página que não é item de menu usa a **seta de voltar** no cabeçalho, à esquerda do título: `<app-page-header heading="..." [backLink]="'/clientes'" backLabel="Voltar para Clientes" />`. É um botão de ícone de 40 px (`.icon-button.page-heading__back`) com `aria-label` e dica no foco e no hover, que navega para a lista de origem. Página de rota **não tem botão "Cancelar" de página**; "Cancelar" só existe no rodapé de modal. A conferência das páginas de rota atuais (clientes, produtos, perfis, usuários, protocolos, peças, notificações, OS, Kanban, relatórios, auditoria, dashboard) mostrou que a importação era a única com Cancelar de página.

### 3.12 Cartão de registro

`.record-row` dentro de `.record-rows`: borda de 1 px em `--record-line` (a `--line` clareada, sempre mais leve que a borda do painel que o contém, para não virar caixa dentro de caixa), raio `--radius-md`, fundo `--surface`, padding `--space-4`, **sem sombra** em repouso. Cartões com tom (`tone-*`) mantêm a barra de acento de 3 px à esquerda por dentro do raio. Espaço entre cartões por `gap` (`--space-3`), sem divisória. Vale para usos de peças, componentes, intervenções, impedimentos, histórico geral e histórico de movimentos de peças. Sombra só no hover de cartão clicável.

## 4. Estados

| Estado | Bloco | Onde |
| --- | --- | --- |
| Carregando | `aria-busy` na região e `app-loading-overlay` | Painel de conteúdo |
| Vazio sem dado | `.empty-state` com `.icon-tile` e título | Dentro do painel, no lugar da tabela |
| Vazio por filtro | `.empty-state` com "Limpar busca e filtros" | Idem |
| Erro de carga | `.empty-state` com `role="alert"` e "Tentar novamente" | Idem |
| Erro de ação | `.alert-banner--error` com `role="alert"` | Topo do painel ou do corpo do modal |
| Sucesso | `ToastService` | Fora da tela |

## 5. Regra de modais

Três tamanhos, e só três. O modal **nunca** muda de tamanho conforme o conteúdo, nem ao alternar entre erro e sem erro, formulário aberto e fechado, ou ao navegar entre registros (Anterior e Próxima).

| Classe | Largura | Altura mínima | Uso |
| --- | --- | --- | --- |
| `.modal-panel--sm` | 560 px | `min(18rem, 100dvh - 2.5rem)` | Confirmação, exclusão, visualização curta. |
| `.modal-panel--md` | 760 px | `min(32rem, 100dvh - 2.5rem)` | Formulário de cadastro, notificação, histórico, movimentar estoque. |
| `.modal-panel--lg` | 1080 px | `min(52rem, 100dvh - 2.5rem)` | Detalhe da OS e editores grandes (nova OS, protocolo). |

Regras:

- Estrutura em três faixas: cabeçalho fixo, **corpo com rolagem** (`.modal-body`, `flex: 1`, `overflow-y: auto`) e **rodapé fixo na base** (`.modal-footer` ou `.form-actions`). O painel é uma coluna flex com altura definida; a altura máxima é `100dvh - 2.5rem`.
- Largura e altura vêm só da classe de tamanho. Nenhuma tela define `width`, `max-width`, `height` ou `padding` do painel.
- Em tela estreita (até 720 px) o modal ocupa a largura toda e a altura disponível.
- Todo modal declara exatamente uma classe de tamanho: `modal-panel modal-panel--md panel`.
- Formulário e rodapé: o botão principal fica sempre à direita da base, na mesma posição em qualquer estado.

## 6. Escala tipográfica de cartões de seção e linhas de registro

Uma escala curta, em três níveis legíveis sem ler as palavras. Vale para todas as seções do detalhe da OS (Diagnóstico, Intervenções, Peças, Componentes trocados, Impedimentos, Protocolos, Histórico, Produtos), na lista e no Kanban, e para os resumos de Peças e Relatórios.

| Nível | Elemento | Token de fonte | Peso | Cor |
| --- | --- | --- | --- | --- |
| 1 | Título de seção (`.collapsible__title`, `.detail-card__title`), sem caixa alta | `--font-size-md` | semibold | `--brand-blue-deep` |
| 1 | Número de resumo de cartão (`.record-stats dd`); o `.page-summary strong` segue em `--font-size-md` bold, por ser indicador em linha | `--font-size-lg` (no máximo `--font-size-xl`) | semibold | `--text` |
| 2 | Título do registro (`.record-row__title`) | `--font-size-md` | semibold | `--text` |
| 3 | Valores e texto secundário (`.record-fields dd`, `.record-row__desc`, `.record-row__meta`) | `--font-size-sm` | regular | `--text` |
| 3 | Rótulos (`dt`, `.record-stats dt`, `.page-summary__item`) | `--font-size-sm` | regular | `--muted` (a mesma em todos) |
| 3 | Chips (`.mini-chip`, `.tone-chip`, `.item-row__chip`) | `--font-size-xs` | semibold | do tom |

Ritmo vertical: `--space-3` entre resumo, linhas e rodapé do cartão; `--space-4` de padding da linha; `--space-2` entre o topo da linha e seus pares rótulo e valor. Chips de um mesmo cartão têm uma só altura (`--control-height-xs`). Rótulo vai acima do número no resumo.

## 7. Proibido e trava automática

Proibido em CSS de página ou de componente:

| Proibido | Use |
| --- | --- |
| CSS próprio para indicador, métrica, cartão de contagem | `.page-summary` |
| CSS próprio para tabela, cabeçalho de tabela, zebra | `.table-card` |
| CSS próprio para botão, chip, paginação | `.button-*`, chips do catálogo, `app-pagination` |
| CSS próprio para cartão de registro | `.record-row` |
| Hexadecimal ou `rgb()` literal | Token de cor de `:root` |
| `font-size` em `px` ou `rem` literal | `--font-size-*` |
| Espaçamento fora dos tokens | `--space-*` |
| Largura, altura ou padding de modal | Classe `.modal-panel--sm|--md|--lg` |
| Nova classe que duplique um bloco existente | O bloco do inventário |

Classes proibidas de definir localmente: `.metric`, `.metric-card`, `.stat-card`, `.status-card`, `.summary-card`, `.import-metric`, `.kpi`, `.indicator`, e qualquer seletor que redefina `.page-summary`, `.table-card`, `.pagination`, `.mini-chip`, `.status-chip`, `.modal-panel` fora de `styles.css`.

### Trava (catraca)

O spec `frontend/src/app/testing/ui-guard.spec.ts` varre `src/app/**/*.css`, `*.html` e os `styles` inline dos componentes, e conta as violações por arquivo: cores literais, `font-size` literal e classes proibidas. A dívida existente está em `frontend/src/app/testing/ui-guard.baseline.json` (arquivo e quantidade permitida).

- Um arquivo que **excede** a sua contagem falha. Violação em arquivo que não está no baseline falha.
- A baseline só pode **diminuir**. Se um arquivo ficar abaixo da contagem, o spec também falha e pede para reduzir o número, para a conquista não se perder.
- Para reduzir: troque os literais por tokens, rode `UI_GUARD_UPDATE=1 npm --prefix frontend test -- --watch=false` e commite o JSON atualizado. O modo de atualização só grava números menores ou iguais.
- Nunca aumente um número à mão para fazer o teste passar.
- `src/styles.css` também é varrido (hoje com a maior parte da dívida). Declarações de variável (`--token: valor`) não contam, porque é nelas que os literais devem viver. Os blocos compartilhados só podem ser definidos em `styles.css`.
- Baseline inicial: 18 arquivos e 251 violações; o spec reporta por arquivo o que sobrou.

## 8. Checklist de anatomia

- [ ] Citei o tipo de tela e segui o esqueleto na ordem.
- [ ] Indicadores com `.page-summary`; tabela com `.table-card`; rodapé com `app-pagination`; ações finais com `.form-actions`.
- [ ] Nenhum CSS local para indicador, tabela, botão, chip, paginação ou cartão de registro.
- [ ] Modal com uma classe de tamanho e rodapé fixo; não muda de tamanho entre estados.
- [ ] Tipografia da seção 6; nada abaixo de 12 px.
- [ ] `ui-guard.spec.ts` passa e a baseline não subiu.
