# Padrões visuais do Navitas Assist

Catálogo oficial dos padrões de interface do frontend. Serve de referência para quem cria ou revisa uma tela: antes de escrever CSS novo, procure aqui o componente, o token e a regra de uso.

Este documento nasceu da [auditoria visual de novembro de 2026](auditoria-visual-2026-11.md), que lista onde o código de hoje foge do padrão. Convenção de status usada nas tabelas:

- **Vigente**: já existe em `frontend/src/styles.css` ou em `frontend/src/app/shared/` e deve ser usado.
- **Proposto**: normalização sugerida pela auditoria que depende de decisão do dono do produto (as decisões estão em [auditoria-visual-2026-11.md, seção 9](auditoria-visual-2026-11.md#9-decisões-que-o-dono-precisa-tomar)). Até a decisão, não aplique em massa.

Documentos relacionados que continuam valendo: [formulários inline](2026-11-14-formularios-inline.md), [affordance das notificações](2026-11-14-affordance-notificacoes.md), [fundação visual](2026-11-07-etapa-1-fundacao-visual.md) e o [roteiro de conferência manual](2026-11-07-roteiro-conferencia-manual.md). O catálogo de componentes compartilhados também está resumido na skill `navitas-ui`.

## 1. Princípios

1. **Um conceito, uma aparência.** Duas telas com o mesmo objetivo (listar cadastro, filtrar, editar em modal) usam os mesmos componentes e as mesmas classes. Diferença só quando o conteúdo exige e com motivo escrito.
2. **Corrija a família, não o caso.** Ao receber um pedido visual, procure todas as ocorrências do mesmo padrão (`grep` pela classe e pelo conceito) e corrija todas na mesma entrega. Corrigir só a tela apontada cria a próxima inconsistência.
3. **Separar com estrutura, não com texto.** Informação agrupada precisa de uma divisão visível: espaço, divisória, fundo tonal ou caixa. Texto corrido em uma única superfície branca é a causa da aparência de "bloco de texto".
4. **Hierarquia em três níveis legíveis sem ler as palavras:** o que o usuário veio fazer (título, ação principal), o que ele precisa comparar (dados, rótulos) e o que é contexto (metadados em cinza). Tudo no mesmo peso é erro.
5. **Token antes de literal.** Cor, tamanho de fonte, espaçamento, raio e sombra vêm de variáveis de `:root`. Valor solto em `rem`, `px` ou hexadecimal só em casos documentados (login, SVG).
6. **Affordance de clique visível.** O que clica parece clicável em repouso (borda, fundo, ícone, chevron), tem hover e foco visível e alvo de 40 px.

## 2. Tokens

Definidos em `frontend/src/styles.css` (`:root`, linhas 1 a 138).

### 2.1 Cores

| Papel | Token | Valor | Uso |
| --- | --- | --- | --- |
| Marca | `--brand-sky`, `--brand-blue`, `--brand-blue-deep`, `--brand-dark` | `#2ea8d4`, `#236da7`, `#1b4f7a`, `#1f2e40` | Ação primária, títulos, acentos. Um acento por tela. |
| Tinta de marca | `--brand-tint` | `#edf5fc` | Cabeçalho de grupo, contagem, hover suave. |
| Fundo da página | `--bg` | `#f4f7fb` | Canvas atrás dos painéis. |
| Superfície | `--surface`, `--surface-alt` | `#ffffff`, `#f8fbfe` | Painel e subgrupo. |
| Linha | `--line`, `--line-hover`, `--card-border` | `#d9e3ee`, `#c9dceb`, `#c3d1e0` | Bordas e divisórias. |
| Texto | `--text`, `--muted`, `--muted-strong` | `#1f3550`, `#5b6f85`, `#4a5d72` | Corpo, apoio, apoio sobre fundo tonal. |
| Semânticas | `--success-*`, `--warning-*`, `--danger-*` (`bg`, `text`, `line`, `strong`) | ver `:root` | Alertas, selos, estados. |
| Tom de indicador | `--tone-success`, `--tone-warning`, `--tone-danger`, `--tone-sky`, `--tone-slate`, `--tone-violet` | ver `:root` | Via classes `.tone-*`, `.icon-tile`, gráficos. |
| Status da OS | `--status-received` ... `--status-irreparable` | ver `:root` | Somente `[data-status]`, chips, selects e colunas do Kanban. |
| Atenção | `--attention-line`, `--attention-bg`, `--attention-strong` | ver `:root` | Falha relatada, impedimento. |
| Foco | `--focus-ring`, `--focus-ring-soft`, `--focus-border` | ver `:root` | Todo elemento interativo. |
| Fundo de modal | `--backdrop` | `rgba(13, 29, 49, 0.48)` | Único. |

Regras: prioridade e status usam as classes de `core/utils/rma-ui.ts` e `[data-status]`; nunca cor fixa no componente. Os componentes não devem repetir `#ffffff`: use `var(--surface)`. Texto sobre cor de marca precisa de contraste de 4,5:1.

**Proposto:** tokens para três literais que hoje se repetem (`#cfdbe7` borda forte dos cartões de detalhe, `#f4f7fb` fundo de tile, `#eaf0f6` canvas do detalhe) e para os dois tons de sucesso (`#cde7d7`, `#f4fbf6`). Ver V-14 e V-15 na auditoria.

### 2.2 Tipografia

Fonte única: `--font-body` e `--font-heading` (Segoe UI, Aptos, sans-serif). Escala em `rem` sobre base de 16 px:

| Token | Tamanho | Uso |
| --- | --- | --- |
| `--font-size-xs` | 12 px | Chips, selos, rótulos em caixa alta, datas secundárias. Menor que isto não se usa. |
| `--font-size-sm` | 13 px | Apoio, subtítulo de célula, mensagens de campo. |
| `--font-size-md` | 14 px | Corpo de tabela, rótulos de formulário, botões compactos. |
| `--font-size-control` | 15 px | Texto de campos, seletores, abas. |
| `--font-size-base` | 16 px | Corpo, título de painel. |
| `--font-size-lg` | 18 px | Título de seção grande. |
| `--font-size-xl` | 23,2 px | Título de modal e de detalhe. |

| Peso | Token | Uso |
| --- | --- | --- |
| 400 | `--font-weight-regular` | Corpo, valores em cinza. |
| 600 | `--font-weight-semibold` | Rótulos, botões, chips, abas. |
| 700 | `--font-weight-bold` | Títulos de painel, números de destaque. |

Título de página: `h1` do `app-page-header` (até 2 rem, peso 800, só um por tela). Linha: `--line-height-tight` (1,25) em rótulos e títulos, `--line-height-body` (1,5) em parágrafos. Números que mudam ou alinham em coluna usam `font-variant-numeric: tabular-nums`.

**Proposto:** hoje existem 22 tamanhos de fonte em `rem` literal fora da escala (0,66 a 1,9 rem) e peso 800 em cinco lugares. A auditoria propõe mapear todos para a escala acima (V-08) e criar `--font-size-display` e `--font-weight-heading` para os poucos casos de título.

### 2.3 Espaçamento

| Token | Valor | Uso típico |
| --- | --- | --- |
| `--space-1` | 4 px | Entre ícone e texto, entre chips. |
| `--space-2` | 8 px | Entre botões, entre rótulo e campo. |
| `--space-3` | 12 px | Entre campos de uma grade, padding de cabeçalho de grupo. |
| `--space-4` | 16 px | Padding de painel e de grupo, espaço entre painéis. |
| `--space-5` | 24 px | Padding de cartão de detalhe, entre blocos. |
| `--space-6` | 32 px | Respiro de estado vazio, entre seções grandes. |

Altura de controle: `--control-height` 40 px (botão, campo, seletor, aba, data) e `--control-height-xs` 28 px (somente chip informativo). Alvo de toque mínimo 40 px.

**Proposto:** definir `--space-7` (40 px), hoje referenciado com valor reserva em `styles.css:1945` e `:1950`, e trocar os 147 valores soltos em `rem`/`px` de margem, padding e gap pelo token mais próximo (V-09).

### 2.4 Raios

| Token | Valor | Uso |
| --- | --- | --- |
| `--radius-xs` | 4 px | Link-button, destaque pequeno. |
| `--radius-sm` | 10 px | Botão, campo, linha de item, aba. |
| `--radius-md` | 12 px | Grupo de formulário, cartão de detalhe, item de lista. |
| `--radius-popover` | 14 px | Menus e calendário. |
| `--radius-lg` | 16 px | Painel e modal. |
| `--radius-pill` | 999 px | Chips, avatar, contadores. |

Raio de elemento interno é menor que o do contêiner (concêntrico). Literais `5px`, `9px`, `11px`, `14px`, `8px` e `999px` devem virar token.

### 2.5 Sombras e elevação

| Nível | Token | Uso |
| --- | --- | --- |
| Repouso | `--shadow` | Painel. |
| Foco | `--focus-ring`, `--focus-ring-soft` | Anel de foco. |
| Botão primário | `--btn-primary-shadow` | Somente botão primário. |

**Proposto:** duas sombras novas, `--shadow-raised` (cartão de detalhe, hover de item clicável) e `--shadow-overlay` (modal, menus), substituindo as 9 sombras literais hoje espalhadas (V-10). Uma só estratégia de profundidade: borda de 1 px mais sombra suave, nunca sombra forte sem borda.

## 3. Componentes

### 3.1 Botões

Todos com 40 px de altura, `--radius-sm`, peso semibold (**proposto**, hoje o primário e o secundário saem com peso 400 por falta de declaração em `styles.css:241`).

| Tipo | Classe | Quando usar | Quando não usar |
| --- | --- | --- | --- |
| Primário | `.button-primary` | A ação principal da tela ou do modal. No máximo uma por região. Ex.: Novo cliente, Salvar. | Duas ao mesmo tempo no mesmo cabeçalho. Ação de excluir (use o perigo). |
| Secundário | `.button-secondary` | Ação de apoio visível: Importar CSV, Exportar CSV, Tentar novamente, Limpar filtros. | Cancelar de rodapé (use neutro). |
| Neutro | `.button-secondary--neutral` | Cancelar e Fechar ao lado de uma ação primária. Hoje aplicado automaticamente por `.form-actions:has(> .button-primary)`. | Ações que levam a algum lugar. |
| Perigo | `.button-primary--danger` (confirmação) e `.button-secondary--danger` (gatilho) | Exclusão e ações irreversíveis; o primário vermelho só dentro do modal de confirmação. | Qualquer ação reversível. |
| Sucesso | `.button-secondary--success` | Concluir etapa, aprovar. | Decorativo. |
| Link | `.link-button` | Ação discreta dentro de texto ou de cabeçalho de seção: Recolher tudo, Abrir na lista. | Ação principal. Alvo menor que 40 px (hoje há 23 px nas notificações, ver auditoria). |
| Ícone | `button[appRowAction]` (classe `.icon-button`) | Ação de linha de tabela ou de cartão (editar, excluir) com rótulo acessível e confirmação. | Ação com texto necessário para entender. |

Regras:

- Ordem no rodapé: Cancelar à esquerda, ação principal à direita.
- Botão grande solto vira ação em ícone ou link discreto.
- Ícone de 16 px à esquerda do rótulo quando ajuda a reconhecer a ação (plus em "Novo ...", download em "Exportar"). Se uma ação do cabeçalho tem ícone, as irmãs também têm (**proposto**, V-05).
- Estado: hover escurece um passo, desabilitado usa `--disabled-opacity`, foco usa `--focus-ring`. Botão alternável (`aria-expanded`, `aria-pressed`) fica um passo mais escuro.
- Não existe tamanho "pequeno": `--small` hoje mantém 40 px e só reduz a fonte. **Proposto:** remover a variação (V-06).

### 3.2 Chips, selos e indicadores

| Tipo | Componente | Altura | Uso |
| --- | --- | --- | --- |
| Status da OS | `.status-chip` com `data-status` | 26 px (**proposto** 28) | Etapa da OS em lista, detalhe e relatório. |
| Prioridade | `.priority-tag` (barras) e `custom-select--priority` | texto | Prioridade da OS, sempre com as cores de `rma-ui.ts`. |
| Garantia | `.warranty-tag` (`warrantyClass`) | 24 px | Garantia por item. |
| Contagem informativa | `.mini-chip` (`.tag`) | 28 px | Quantidade ao lado de título. |
| Contador de pendência | `.count-badge` | 22 px | Não lidas, itens pendentes. |
| Selo de origem | `.lock-badge` | 22 px | "Do perfil" em permissões. |
| Selo de linha | `.item-row__chip` | 22 px | Atributos curtos de item de lista. |
| Estado ligado/desligado | `.state-dot` | texto | Ativo/Inativo, recebendo alertas. |
| Tom livre | `.tone-chip` com `.tone-*` | 28 px | Tipo de movimento e categorias. |
| Removível | `.removable-chip` | 28 px | Seleção múltipla. |

Regras: chip fica em uma linha (`white-space: nowrap`, reticências se faltar espaço); cor significa algo (status, prioridade, garantia, atenção), não enfeita; uma coluna de tabela usa uma só família de chip. **Proposto:** reduzir para duas alturas (chip 28 px, selo 22 px) e parar de reutilizar nomes de prioridade e garantia (`priority-high`, `warranty-off`, `warranty-alert`, `priority-low`) como cores genéricas, criando `.chip--danger`, `--warning`, `--success`, `--neutral`, `--brand` (V-04).

### 3.3 Cabeçalhos

| Nível | Componente | Regra |
| --- | --- | --- |
| Página | `app-page-header` (`[heading]`, ações em `ng-content`) | Um `h1` por tela, só título e ações. Nada de total nem texto explicativo ao lado. |
| Indicadores | `.page-summary` | Faixa de ícone, rótulo e valor logo abaixo do cabeçalho (OS, Kanban, Peças, Relatórios). |
| Painel | primeiro `h2`/`h3` de `.panel.table-card` (faixa tonal com marca à esquerda) | Título curto, sem ponto final. Use o mesmo nível de título em todas as telas (**proposto** `h2` em página, `h3` em modal). |
| Seção recolhível | `app-collapsible-section` | Substitui o título do cartão. Ver 3.5. |
| Grupo de formulário | `legend` de `fieldset.form-section` | Faixa tonal com marca azul, estilo igual ao do painel (**proposto** unificar degradê e fundo). |

### 3.4 Cartões, painéis e caixas de separação

Há quatro níveis de superfície. A regra do dono é "sem caixa dentro de caixa", mas ele também pede "caixas que separem as informações". A leitura adotada neste catálogo (**proposta**, V-01): dentro de um contêiner com borda, subgrupos se distinguem por **fundo tonal sem sombra e raio menor**, nunca por outro cartão com borda e sombra.

| Nível | Classe | Aparência | Uso |
| --- | --- | --- | --- |
| 0. Canvas | `--bg` | cinza azulado | Fundo da página. |
| 1. Painel | `.panel` (com `.table-card`) | branco, borda `--line`, `--radius-lg`, `--shadow` | Contêiner de região da página: filtros, tabela, formulário de página. |
| 2. Grupo | `fieldset.form-section`, `.detail-card` | `--surface-alt` ou branco, `--radius-md`, cabeçalho tonal | Grupo nomeado dentro de modal ou de detalhe. |
| 3. Item | `.item-row`, `.record-card`, `.detail-tile`, `.delete-target` | fundo `--surface` ou `--surface-alt`, `--radius-sm`, sem sombra | Um registro dentro de um grupo. |

Regras de uso:

- Máximo dois níveis de borda visível na mesma área. Painel (1) dentro de modal (que já é painel) conta como o mesmo nível: o modal é o contêiner e os grupos são o nível 2.
- Tabela vai direto no painel de lista (`.table-card--list`); não crie painel para uma tabela dentro de outro painel.
- Faixa de indicadores (`.page-summary`) não é cartão.
- Item clicável ganha hover, foco e chevron ou ícone de abrir (`.interactive-card`, `.open-hint`, `.item-row`).
- Para separar texto longo em um grupo, use pares rótulo/valor (`.meta-list`, `.detail-facts`) em vez de parágrafo.

**Famílias a descontinuar (propostas, V-12):** `.status-card`, `.timeline-card`, `.queue-card`, `.module-card`, `.metric-card`, `.catalog-card`, `.report-card`, `.matrix-card`, `.form-panel`, `.stat-card`. A maioria não tem uso nos templates (ver inventário); as que têm (`status-card`, `timeline-card`) migram para `.panel`.

### 3.5 Seções recolhíveis

`app-collapsible-section` (`title`, `count`, `icon`, `open`, `storageKey`, slot `[sectionActions]`). Usar em cartões longos do detalhe da OS. Regras:

- O cabeçalho da seção é o título do cartão; não coloque outro título dentro.
- A contagem vira chip ao lado do título. Ações ficam no slot e não recolhem.
- A escolha do usuário persiste por `storageKey` (`navitas.section.<chave>`).
- Não envolva `app-collapsible-section` em `.detail-card` quando o host já traz borda: o resultado é uma moldura dupla (**verificar e corrigir**, item V-03 da auditoria).

### 3.6 Formulários

Dois contextos, um só visual de campo.

**Campo (`.field-group`):**

- Rótulo como filho direto, sempre visível, semibold, `--font-size-md`. Campo largo usa `.field-group--full`.
- Campo de texto, seletor, data e sugestão têm 40 px de altura, `--radius-sm`, borda `--line`, foco com `--focus-border` e `--focus-ring-soft`; erro com borda `--danger-text`.
- Seletor: `app-custom-select`; texto livre com sugestão: `app-suggest-input`; data: `app-date-picker`; liga/desliga: `.switch`. Nunca `select`, `datalist` ou `input type="date"` nativos.
- Textarea de 6 rem, sem alça de redimensionar.
- Erro: `small.field-error` abaixo do campo, mensagem curta em português. Erro de formulário inteiro em `.alert-banner--error` na largura total.
- Obrigatório: `.field-group--required` acrescenta asterisco vermelho ao rótulo. Não se escreve "(obrigatório)" nem "(opcional)". **Hoje só vale dentro de `.inline-form`; proposto estender aos modais de cadastro (V-02).**

**Formulário em modal de cadastro:** `form.form-grid` com `fieldset.form-section` por grupo (Identificação, Contato, ...), rodapé `.form-actions.form-actions--full` com Cancelar (neutro) e ação primária. Rótulo do botão: o verbo do que acontece ("Salvar", "Registrar", "Criar"), com "Salvando..." enquanto envia.

**Formulário inline do detalhe da OS:** `.inline-form` (ver [formulários inline](2026-11-14-formularios-inline.md)). Um ou dois campos: edição no próprio lugar, estilo Jira, sem modal (`app-rma-*-field`).

### 3.7 Tabelas

- Contêiner: `article.panel.table-card.table-card--list` com `.table-wrap` (rolagem horizontal) dentro.
- Cabeçalho: faixa tonal `--brand-tint`, texto `--brand-blue-deep`, 12,8 px, peso 700, cantos arredondados nas pontas.
- Linha: divisória inferior, zebra suave e hover tonal. Linha inteira clicável só quando abrir é a ação principal (`.rma-table-row`); ela tem hover e foco próprios e `open-hint` à direita.
- Primeira coluna: `strong.table-title` com `span.table-subtitle` (código ou apoio) abaixo.
- Coluna de ações: `.table-actions-col` com `.row-actions` de `button[appRowAction]` (editar, excluir), sempre nessa ordem.
- Alinhamento: texto à esquerda; **números e valores monetários à direita** com `tabular-nums` (classe `.num`, hoje só em Relatórios; **proposto** global, V-07).
- Vazio: ver 3.9. Rodapé: `app-result-count` e `app-pagination`.

### 3.8 Modais

Estrutura: `.modal-overlay` > `section.modal-panel.panel role="dialog" aria-modal="true"` com `appModalFocus`, cabeçalho `.modal-header` (título `h3` e `.modal-close` de 40 px à direita), corpo, rodapé `.form-actions`.

| Tamanho | Classe | Largura | Uso |
| --- | --- | --- | --- |
| Confirmação | `.modal-panel--narrow` | 560 px | Exclusão, confirmação, nome de visualização. |
| Formulário | `.modal-panel` | 920 px | Cadastro padrão. |
| Formulário largo | `.modal-panel--form-wide` | 1080 px | Protocolo, nova OS. |
| Detalhe | `.modal-panel--wide` | 1080 px, altura 820 px | Detalhe da OS. |

Regras: título curto no cabeçalho, sem subtítulo explicativo; erro no topo do corpo em `.alert-banner--error.modal-feedback`; fechar bloqueado enquanto grava (`modalCloseBlocked`); foco inicial no primeiro campo ou no Cancelar da confirmação. **Proposto:** nenhuma largura própria por tela; hoje `user-form-modal` (780 px), `profile-form-modal` (860 px) e `history-panel` (720 px) criam três larguras extras (V-11).

### 3.9 Estados

| Estado | Padrão | Observação |
| --- | --- | --- |
| Vazio | `.empty-state` com `.icon-tile`, título (`h3`) e, se houver, uma frase de apoio | Não repete o botão que já está no cabeçalho. Vazio sem dado ("Nenhum cliente cadastrado") e vazio por filtro ("Nenhum cliente encontrado" mais "Limpar busca e filtros") são mensagens diferentes. |
| Erro de carga | `.empty-state` com `role="alert"` e botão "Tentar novamente" | Mensagem do servidor via `extractHttpErrorMessage`. |
| Erro de ação | `.alert-banner--error` com `role="alert"` | No topo da lista ou do modal. |
| Sucesso | Aviso flutuante (`ToastService`), ver 3.13 | Nunca texto fixo na página nem `.alert-banner--success` (removido). |
| Carregando | `app-loading-overlay` global e `aria-busy` na região | **Proposto:** esqueleto de linhas (`.skeleton`) na lista e nos painéis, em vez de região em branco (V-13). |
| Desabilitado | `--disabled-opacity`, `cursor: not-allowed` e, quando há motivo, `blockedReason` no `appRowAction` | Sem permissão: a ação some. |

### 3.10 Dicas (appTip)

`appTip` (`shared/tip`) é a única dica: fundo escuro, texto claro de 14 px, abre em hover e em foco, fecha com Esc. Regras: use para explicar ícone sem rótulo, abreviação e motivo de ação bloqueada; texto de uma frase; nunca para informação essencial (ela precisa estar visível). Não use o atributo `title` do HTML. Em botões de ícone o rótulo vem de `appRowAction` (`label`).

### 3.11 Listas e itens

- Lista de registros com várias colunas: tabela.
- Lista de itens expansíveis com edição no lugar: `.item-row` (cabeçalho em botão, editor na mesma caixa).
- Histórico: `.record-rows` com `.record-row` (tile de ícone, título, chip de situação, pares rótulo/valor em `.record-stats--compact`) ou `.activity-list` para linha do tempo. Vale para o Histórico geral da OS (tile por tipo: status, reparo, responsável, prazo, garantia) e para os impedimentos: ativo (`tone-warning`, chip "Ativo") e anteriores (`tone-success`, chip "Resolvido"), com Categoria, Início, Bloqueado por, Duração, Resolvido em e Resolvido por em grade de 3 colunas (1 abaixo de 720 px) e a "Nota de resolução:" como linha secundária. Rótulos de pares (`.meta-list dt`, `.detail-tile`, `.record-stats dt`) usam caixa normal, `--font-size-sm` e cor muted, nunca caixa alta.
- Prévia da importação CSV: métricas Válidas, Inválidas e Duplicadas em cartões neutros compactos (`surface-alt`, borda padrão, acento de 3 px à esquerda na cor do tom), alinhados à esquerda. Clicar filtra (`aria-pressed`, borda e fundo de marca suaves); clicar de novo na métrica ativa limpa o filtro e o link "Limpar filtro" aparece só enquanto há filtro. Não existe botão "Todas".
- Registros de reparo (reservas, componentes trocados, intervenções): `.record-rows` com `.record-row`, mesmo desenho nas três seções, inspirado nas listas de atividade e inventário do Linear, Jira e Polaris.
  - Faixa de resumo no topo, `.record-stats` (`dl` com rótulo pequeno e valor grande, fundo tonal sem borda). Valores: Intervenções (horas, registros, última data), Componentes (total, externos, do estoque), Peças (ativas, aplicadas, custos).
  - Cada linha: tile de ícone tonal (`.icon-tile--sm`: peça `box`, componente `chip`, intervenção `wrench`), barra lateral de 3 px e chips na cor do estado, ambos vindos da classe `tone-*` da linha (`--tone`). Tons: ativa `tone-sky`, pendente `tone-warning`, aplicada ou do estoque `tone-success`, externo `tone-violet`, anulada `.is-voided` (cinza, só o título riscado, chip "Anulada" em `tone-danger` e motivo e autor em `.record-row__void`).
  - Hierarquia: título semibold (`.record-row__title`), código discreto (`.record-row__code`) e chips com significado (origem "Externo" ou "Do estoque", quantidade com unidade, horas, situação) na mesma linha do topo (`.record-row__head`). Abaixo, pares rótulo e valor em `.record-fields` (`dl`, rótulo pequeno muted em caixa normal, valor normal), em três colunas que viram uma só em largura estreita por container query (`@container`, a linha é o container), nunca uma única linha separada por pontos. Componentes: Motivo da troca, Lote e Registrado (data e autor). Intervenções: Realizada em e Técnico. Anulados acrescentam Motivo da anulação e Anulado por em `.record-fields--void`. Padding `var(--space-4)` e gap `var(--space-3)` por linha.
  - Ações (`appRowAction`) à direita, alinhadas ao topo; em 480 px caem para baixo do texto. Aplicar e Efetivar reserva usam botão secundário com ícone. Ação destrutiva em ícone sem fundo nem borda colorida em repouso, com destaque no hover e foco visível; nunca link sublinhado. Botões de texto também não recebem sublinhado, reservado aos links de navegação. Divisória sutil entre linhas e hover suave, sem caixa por registro.
  - Reservas usam a variante `.record-row--stacked`: cabeçalho com tile, nome, código e chip; métricas Quantidade, Disponível e Custo (com permissão) em `.record-stats--metrics`, uma linha de colunas iguais (`--cols`), sem fundo; Local e Observação em `.record-fields--single`, cada um em largura inteira com rótulo; ações Aplicar e Cancelar numa linha própria à direita, sem disputar espaço com o título. Observação só aparece quando preenchida.
  - Vazio: `.record-empty` com tile, frase curta e botão da ação principal ao lado. O contador de registros vai em chip no cabeçalho da seção (`[count]`, oculto quando zero).
- Histórico da página Peças: `.record-row` com tile por tipo, título "Entrada de 30 UN", chip de tipo e "Revertida" quando aplicável e `.record-fields` com Registrado (data e autor), Ordem de serviço, Reverte o movimento, Estoque e Reservado ("10 UN → 11 UN") e Motivo em largura inteira. A ação usa `appRowAction` com rótulo "Reverter" e confirmação inline.
- Modais da página Peças: `.inline-form`, obrigatórios com asterisco, textarea de motivo com altura padrão e ações à direita no rodapé. Movimentar estoque abre com nome, código e três métricas compactas; impacto estimado tem uma linha por saldo, valores "10 UN para 11 UN" e destaque do disponível.
- Notificações: ver [affordance das notificações](2026-11-14-affordance-notificacoes.md); item inteiro é um botão com ponto de não lida e chevron.

### 3.12 Filtros

Padrão do Kanban (`.kanban-filters__bar`): barra compacta com busca e seletores de 40 px, filtros avançados recolhidos, "Limpar filtros" como botão secundário no fim. Listas de cadastro usam `.catalog-toolbar.catalog-toolbar--filters` com `.search-field` e `.filter-field`. Contagem de resultados fica no rodapé da lista, não na barra.

### 3.13 Avisos e feedback

Regra: confirmação de sucesso é aviso flutuante (`ToastService.show({ message, tone: 'success' })`, popup no centro inferior, some em 5 s, 8 s com ação, X, Esc, pausa em hover e foco). Nunca um texto fixo na página ou no cartão, que fica "congelado" depois que o usuário já viu. Texto curto, em pt-BR, com ponto final e sem "com sucesso". O aviso sem ação continua válido mesmo que o modal ou painel que o originou seja fechado; com ação, passe o dono para o serviço descartar o aviso junto.

Fica inline: erro de validação junto do campo, erro de API (`role="alert"`, `.field-error` ou `.alert-banner--error`), estado que descreve a tela (vazio, "Adiada até ...", resumo da prévia de importação, limite de e-mail atingido, status do canal, "Salvando...") e qualquer mensagem que o usuário precise reler.

Cancelar reserva exige confirmação inline na própria linha, com Cancelar antes de Confirmar (nome acessível "Confirmar cancelamento da reserva") e bloqueio durante o envio. Desistir mantém a reserva sem chamada à API. O sucesso continua no aviso flutuante; erros permanecem no painel.

Inventário da migração (tela, texto, destino):

| Arquivo | Texto | Destino |
| --- | --- | --- |
| `shared/rma-repair-panel` | Intervenção salva. | Aviso, sucesso |
| `shared/rma-repair-panel` | Intervenção anulada. (novo) | Aviso, sucesso |
| `shared/rma-parts-panel` | `<peça>` reservada para a OS. | Aviso, sucesso |
| `shared/rma-parts-panel` | Saldo insuficiente: `<peça>` ficou pendente de reposição. | Aviso, informação, 8 s |
| `shared/rma-parts-panel` | Reserva efetivada. / Aplicação registrada. / Reserva cancelada e disponibilidade devolvida. | Aviso, sucesso |
| `shared/rma-parts-panel` | Componente salvo. / Componente anulado. (novo) | Aviso, sucesso |
| `shared/rma-diagnosis` | Diagnóstico salvo. (a variável `message` nunca era preenchida; o aviso passou a existir) | Aviso, sucesso |
| `shared/rma-priority-field` | Prioridade alterada para `<nível>`. | Aviso, sucesso |
| `shared/rma-assignee-field` | Responsável alterado para `<nome>`. / OS sem responsável. | Aviso, sucesso |
| `shared/rma-status-field` | Troca de status, com Desfazer (já era aviso) | Aviso, sucesso, com ação |
| `pages/rmas` | OS `<código>` criada. | Aviso, sucesso |
| `pages/clients`, `pages/products` | Cliente/Produto `<nome>` cadastrado, atualizado ou excluído. | Aviso, sucesso |
| `pages/clients`, `pages/products` | Resultado da importação CSV (`N linha(s) importada(s). ...`) | Aviso, sucesso, 10 s. A prévia com contagens continua fixa na tela de importação, antes de confirmar. |
| `pages/profiles` | Perfil `<nome>` cadastrado, atualizado ou excluído. | Aviso, sucesso |
| `pages/users` | Usuário `<nome>` cadastrado, atualizado ou excluído. | Aviso, sucesso |
| `pages/protocols` | Protocolo `<nome>` cadastrado, publicado na versão N ou excluído. | Aviso, sucesso |
| `pages/parts` | Peça cadastrada ou atualizada. `<Tipo>` registrada para `<peça>`. Movimento N revertido. | Aviso, sucesso |
| `pages/notifications` | Todas marcadas como lidas. Notificação adiada (até data). `<Evento>` silenciado ou reativado. Regra atualizada. | Aviso, sucesso |
| `pages/notifications` | Teste enviado. / Simulação registrada. / Reenvio agendado. | Aviso, sucesso |
| `pages/notifications` | Limite atingido: os envios retomam no próximo período | Fica inline (estado do canal) |
| `pages/catalog-import` | Contagens da prévia (válidas, inválidas, duplicadas) | Fica inline (descreve a tela) |
| `pages/login` | Sua sessão expirou. Entre novamente. | Fica inline (estado da tela) |
| `shared/notification-detail-modal` | Salvando... | Fica inline (progresso) |
| `shared/rma-due-date-field`, `rma-warranty-field`, `rma-blocks-section` | Sem aviso de sucesso: o novo valor aparece no próprio campo | Sem mudança |

## 4. Regras de separação visual e hierarquia

1. **Um título por região.** Cada painel, grupo ou seção começa com um título curto. Região sem título é bloco de texto.
2. **Rótulo e valor, nunca frase.** Dado de cadastro aparece em par rótulo (cinza, 12 a 13 px) e valor (texto, semibold); não escreva "Cliente: X | Lote: Y".
3. **Três tons de texto.** `--text` para o que se lê, `--muted` para apoio, `--muted-strong` para apoio sobre fundo tonal. Mais que isso é ruído.
4. **Um foco por tela.** O que domina (título e ação principal) tem tamanho, peso e contraste maiores; o resto recua (secundário em tinta, metadado em cinza).
5. **Agrupe por proximidade antes de agrupar por borda.** Espaço de 8 px entre itens do mesmo grupo e 16 a 24 px entre grupos. Use caixa só quando o espaço não basta ([NN/g sobre proximidade](https://www.nngroup.com/articles/gestalt-proximity/)).
6. **Densidade de duas velocidades.** Listas de trabalho (OS, estoque) em linha compacta; telas de leitura (detalhe, notificações) com mais respiro e subcaixas.
7. **Sem explicação didática.** Rótulos curtos; dica só por `appTip`.
8. **Mesma função, mesmo componente.** Antes de criar classe, procure um componente existente (seção 3).

## 5. Checklist de revisão de tela nova

Marque cada item antes de abrir o pedido de revisão.

**Estrutura**

- [ ] Um `app-page-header` com um `h1`; ações só no cabeçalho.
- [ ] Cada região tem título e fica em `.panel` (ou grupo/seção, conforme 3.4).
- [ ] No máximo dois níveis de borda visível; sem painel dentro de painel.
- [ ] Informação em pares rótulo/valor, não em frase corrida.
- [ ] Se existe tela com a mesma função, usei os mesmos componentes e classes dela.

**Componentes e tokens**

- [ ] Botões: uma ação primária por região, Cancelar neutro à esquerda, 40 px, perigo só para exclusão.
- [ ] Chips: família certa, uma linha, cor com significado, altura do catálogo.
- [ ] Seletores, datas e sugestões pelos componentes compartilhados.
- [ ] Nenhum `rem`/`px`/hexadecimal solto para cor, fonte, espaçamento, raio ou sombra.
- [ ] Nenhum `!important`, nenhuma classe duplicada para ganhar especificidade, nenhuma margem negativa para desfazer padding.

**Formulário**

- [ ] Rótulo sempre visível; obrigatório com `.field-group--required`.
- [ ] Erro em `.field-error` abaixo do campo e `role="alert"` no erro geral.
- [ ] Um ou dois campos: inline; mais que isso: modal.

**Tabela e lista**

- [ ] Cabeçalho, linha e coluna de ações no padrão; números à direita.
- [ ] Rodapé com `app-result-count` e `app-pagination`.
- [ ] Linha clicável tem hover, foco e indicação de abrir.

**Estados**

- [ ] Vazio sem dado, vazio por filtro, carregando, erro de carga e erro de ação implementados.
- [ ] Estado vazio não repete o botão do cabeçalho.
- [ ] Sucesso por `.alert-banner--success`.

**Acessibilidade e responsivo**

- [ ] Foco visível, ordem de tabulação lógica, `aria-label` em botão só com ícone, `aria-labelledby` no modal.
- [ ] Alvo clicável de 40 px; contraste de 4,5:1.
- [ ] 320 px sem rolagem horizontal e conferido em desktop; respeita `prefers-reduced-motion`.
- [ ] Orçamento de CSS por componente em 4 kB (aviso) e 8 kB (erro).

**Entrega**

- [ ] Procurei as outras telas com o mesmo padrão e corrigi todas, ou registrei a pendência na auditoria.
- [ ] Spec cobrindo o comportamento visível; conferência em `http://localhost:4201`.
