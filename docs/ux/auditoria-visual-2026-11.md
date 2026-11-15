# Auditoria visual do frontend (novembro de 2026)

Referência histórica de UX. O fluxo de peças vigente está em [padrões visuais](padroes-visuais.md) e [API](../api.md): uso imediato com motivo e reversão em OS aberta.

Auditoria completa da aparência do frontend, pedida pelo dono do produto depois de queixas repetidas: telas com "cara de bloco de texto", falta de caixas que separem as informações, botões que fazem a mesma coisa com cor ou formato diferente, telas com o mesmo conceito e visuais diferentes (dois formulários com o mesmo objetivo e aparência distinta) e correções feitas só nos casos apontados, não em todos.

Este documento só audita e propõe. Nenhum código nem estilo foi alterado. O catálogo de padrões que resulta dele está em [padroes-visuais.md](padroes-visuais.md); a correção em massa só começa depois que o dono validar as decisões da [seção 9](#9-decisões-que-o-dono-precisa-tomar).

## Revisão de 15/11/2026 (leia antes do resto)

A auditoria acima foi escrita antes de várias entregas e de decisões do dono. Esta revisão confere cada item contra o código de 15/11 e **substitui o plano da seção 8**. Onde houver conflito, vale esta seção.

### O que já foi resolvido (fechar)

| Item | Situação |
| --- | --- |
| V-12 | CSS morto removido na limpeza de 15/11 (`2026-11-15-limpeza-css.md`); sobras mínimas, checar na fase final |
| V-15 | `alert-banner--success` e `success-card` saíram: sucesso agora é aviso flutuante (toast) |
| V-21 | Sino e modal de notificação refeitos (cartões clicáveis, severidade, rodapé único) |
| V-28 | Textos explicativos removidos nas telas apontadas |
| V-32 | `modal-close` sem SVG copiado |
| V-09 (parte) | `--space-7` definido |
| V-18 | Dashboard decidido: só título e número, 4 por linha; as demais telas mantêm `page-summary` |
| V-13 (parte) | Kanban já tem esqueleto na rolagem infinita |
| 3.4 e 3.7 (Peças, Reparo, Movimentos) | Padrão `.record-row` aprovado e aplicado |

### O que não faz sentido hoje (descartar)

| Item | Motivo |
| --- | --- |
| V-01 (sem caixa dentro de caixa) e decisão 1 | Vai contra o que o dono pede: ele cobra caixas e subcaixas para separar informação. Vale o contrário: seções em caixa própria, subgrupos em fundo tonal |
| V-19 (unificar os dois detalhes da OS) | Esforço alto e risco alto; o dono acabou de ajustar os dois e não reclamou da diferença. Só manter os componentes compartilhados |
| V-29 (abas e fundo do detalhe) | Sem queixa; custo sem ganho visível |
| V-20 (barra de filtros única) | Esforço médio e alto risco nas listas; sem queixa. Só corrigir os 44 px do seletor do Kanban |
| V-08, V-14, V-10, V-23 (higiene de tokens, lint) | Dívida invisível para o usuário (4 a 5 dias). Fazer só se sobrar tempo, depois da revisão mobile |
| V-30 (trocar o cabeçalho de caixa) | O dono não pediu; manter a faixa atual e apenas documentar |
| V-05, V-33, V-34 | Detalhes sem efeito visível |

### O que continua valendo (fazer, em ordem)

| Fase | Itens | O que muda para o usuário |
| --- | --- | --- |
| A. Rápidos e visíveis | V-02 asterisco de obrigatório em todo formulário (hoje 22 de 112 campos) e remover "(obrigatório)" escrito; V-07 números à direita nas tabelas (Peças); V-26 Ativo/Inativo igual em todas as telas; V-06 fim do botão "small" (4 usos); V-22 conferir peso do botão (semibold) | Formulários coerentes, tabelas legíveis |
| B. Consistência de componentes | V-04 família de chips (duas alturas, nomes por significado, mínimo de 12 px); V-16 erro de ação em `alert-banner` em OS e Kanban; V-17 painéis do Dashboard e da Importação com o mesmo cabeçalho; V-27 sinal de linha e hover da tabela; V-25 e V-24 links e botões locais | Chips e avisos iguais em todo o app |
| C. Estados | V-13 esqueleto de lista nas telas de cadastro (hoje 47 regiões vazias) | Sem tela em branco ao carregar |
| D. Modais | V-11 larguras e cabeçalho; V-03 conferir moldura dupla no navegador | Modais previsíveis |

A revisão de mobile entra em paralelo e tem prioridade sobre as fases C e D.

### Decisões da seção 9 que se resolvem sozinhas

1 e 2: descartadas (acima). 3: manter o que existe. 4: sim, asterisco global. 5: manter como está. 6: sim, 40 px e semibold. 7: sim, duas alturas e Ativo/Inativo igual. 8: adiada. 9: sim, esqueleto. 10: já feito (cartões com chevron). 11: já decidido. 12: três larguras. 13: já feito. 14: sim.

**Resta o dono confirmar apenas:** a lista "descartar" e a ordem das fases A a D.

## 1. Escopo e método

- **Código lido:** `frontend/src/styles.css` (3.784 linhas), todas as páginas em `frontend/src/app/pages/*` (audit, catalog-import, clients, dashboard, kanban, login, notifications, parts, products, profiles, protocols, reports, rmas, users), os componentes compartilhados em `frontend/src/app/shared/*` e os blocos `styles: []` dos componentes.
- **Medição no app em desenvolvimento** (`http://localhost:4201`, 1440 px, 300 OS de teste): altura, raio, peso e tamanho de fonte calculados de botões, chips e títulos nas rotas `/clientes`, `/rmas`, `/kanban`, `/notificacoes`, `/dashboard` e `/relatorios`. Capturas de tela do painel do navegador não ficaram utilizáveis nesta sessão (a renderização expirou), por isso a conferência visual foi feita por estilos calculados e por leitura dos templates. Os modais e o detalhe da OS foram auditados só pelo código.
- **Contagens** vêm de buscas por texto em `.css`, `.html` e `.ts`; classes montadas dinamicamente podem escapar. Os números servem para dimensionar o problema, não para auditoria contábil.
- **Referências externas:** pesquisa na seção 7.
- Inclui as regras já cobradas pelo dono (skill `navitas-ui`) e os documentos anteriores de `docs/ux`.

## 2. Diagnóstico em uma página

O sistema tem uma boa base: tokens de cor, altura de controle de 40 px, componentes compartilhados de seletor, data, modal, seção recolhível e ação de linha, e zero `!important`. O que o dono percebe como "bloco de texto" e "visuais diferentes" nasce de cinco causas, todas visíveis no código:

1. **Não há regra de superfícies.** Existem pelo menos 15 nomes de cartão e caixa (`panel`, `table-card`, `detail-card`, `detail-tile`, `record-card`, `item-row`, `form-section`, `status-card`, `timeline-card`, `import-card`, `delete-target`, `muted-box`, `toggle-box`, `interactive-card`, `collapsible` ...) e cinco estilos diferentes de cabeçalho de caixa. Cada tela escolheu o seu. Onde falta caixa (parágrafos em painel branco, pares rótulo/valor em frase) a tela vira texto corrido.
2. **A mesma função foi implementada mais de uma vez.** Detalhe da OS (lista e Kanban), indicadores (dashboard e `page-summary`), filtros (barra do Kanban e `catalog-toolbar`), item de notificação (sino e caixa de entrada), mensagem de erro e de sucesso (quatro componentes).
3. **Chips e botões sem família fechada.** Dez tipos de chip com cinco alturas (20, 22, 24, 26, 28 px) e três tipos de link-button; os botões principais saem com peso 400 enquanto o resto da interface usa 600.
4. **Os tokens existem, mas não são obrigatórios.** 22 tamanhos de fonte soltos, 147 espaçamentos em `rem` literal, 71 hexadecimais e 9 sombras fora de `:root` em `styles.css`.
5. **Correções localizadas.** Padrões novos (asterisco de obrigatório, formulário inline, seção recolhível, ação em ícone) nasceram em uma parte do app e não foram levados às outras. Exemplo: o asterisco de campo obrigatório vale só dentro de `.inline-form` (`styles.css:3713`).

## 3. Inventário por categoria

Legenda de caminhos: `S` é `frontend/src/styles.css`; `A` é `frontend/src/app`. Linha entre parênteses indica o ponto da evidência.

### 3.1 Botões

| Tipo | Definição | Evidência e variações |
| --- | --- | --- |
| Primário | `S:253` `.button-primary` | 40 px, raio 10, gradiente azul, **peso 400** (medido em `/clientes`, `/rmas`, `/relatorios`; o `button` base não declara peso, `S:169`). Chips, abas e link-button usam 600. 36 usos. |
| Secundário | `S:270` `.button-secondary` | 40 px, tintado azul. 81 usos. Em rodapé com primário vira cinza por contexto (`S:302`, seletor `:has`), então a mesma classe tem duas cores. |
| Secundário "small" | `S:321` `.button-secondary--small` | Altura 40 px, igual ao normal; só reduz a fonte (14,72 px contra 16 px, medido). 9 usos. O nome promete outro tamanho. |
| Perigo | `S:334` (secundário), `S:343` (primário) | Primário vermelho em 5 modais de exclusão; secundário vermelho em 1 lugar. Coerente. |
| Neutro/sucesso | `S:303`, `S:312` | Sucesso sem uso visível nos templates. |
| Link | `S:2036` `.link-button` | 3 variações: padrão (13 px, sublinha no hover), em cabeçalho de seção (`S:2065`, fundo tonal no hover) e título de notificação (23 px de altura, `A/pages/notifications/notifications.component.css:24`). Mais 6 classes locais (`diagnosis-trigger`, `repair-trigger`, `blocks-section__action`, `rma-detail__open-link`, `rma-detail__fold-all`, `blocks-section__history-toggle`). |
| Ícone | `S:2635` `.icon-button` + `A/shared/row-action` | 40 px, raio 10. 23 usos de `appRowAction`; as tabelas de cadastro usam sempre editar e excluir, nessa ordem. Padrão sólido. |
| Fechar modal | `S:1766` `.modal-close` | 40 px, redondo. 14 botões com o SVG de X copiado em cada template em vez de `app-icon`. |
| Variantes locais | `inbox-toggle`, `inbox-clear`, `kanban-filters__toggle`, `protocol-items__add`, `protocol-head__action`, `notification-detail__ghost`, `detail-block-flag` | Sete botões `button-secondary` que recebem outra classe da tela e redefinem aparência. |
| Ícone no rótulo | `A/pages/clients/clients.component.html:5-6` | "Novo cliente" tem ícone; "Importar CSV" ao lado, não. Em Relatórios (`reports.component.html:3-5`) e Notificações (`notifications.component.html:3`) a ação do cabeçalho tem ícone. |

### 3.2 Chips, selos e indicadores

| Tipo | Definição | Altura medida ou declarada |
| --- | --- | --- |
| `.status-chip` (status da OS) | `S:2541` | 26 px, fonte 12,5 px |
| `.mini-chip`, `.tag`, `.status-pill` | `S:352-390` | 28 px (`--control-height-xs`) |
| `.priority-tag` (barras) | `S:2596` | texto de 17 px, sem fundo |
| `.warranty-tag` | `S:3036` | 24 px |
| `.count-badge` | `S:2091` | 22 px, fonte 11,5 px |
| `.lock-badge` | `S:2219` | 22 px |
| `.item-row__chip` | `S:2838` | 22 px |
| `.notification-severity` (sobre `.mini-chip`) | `A/pages/notifications/notifications.component.css:25` | 20 px, fonte 11,2 px (abaixo do mínimo de 12 px do catálogo) |
| `.removable-chip` | `S:2235` | 28 px |
| `.tone-chip` | `S:2498` | 28 px |
| `.state-dot` | `S:3009` | ponto e texto |

Duas tabelas mostram a mistura. Na lista de OS (`/rmas`) uma linha tem status em pílula de 26 px, prioridade em texto de 17 px e garantia em pílula de 24 px. Na lista de peças (`parts.component.html:97-99`) o selo "Repor" usa `mini-chip priority-high` e "Inativa" usa `mini-chip warranty-off`: nomes de prioridade e garantia emprestados como cores genéricas. As notificações usam `mini-chip notification-severity priority-low` e `warranty-alert` pelo mesmo motivo. Ativo/Inativo aparece como ponto (`state-dot` em usuários, protocolos, notificações) e como chip (peças).

### 3.3 Cabeçalhos de página e de caixa

| Elemento | Definição | Observação |
| --- | --- | --- |
| Título de página | `A/shared/page-header`, `S:393-441` | Uniforme em todas as telas: 32 px, peso 800, faixa com degradê e barra azul. Há degradê radial e linear no fundo (`S:402-404`), competindo com o degradê da lateral. |
| Primeiro título de `.table-card`/`.form-panel` | `S:1113` | Faixa tonal com degradê e barra azul. |
| `legend` de `form-section` | `S:1462` | Faixa tonal **sólida** com a mesma barra azul; fundo `--brand-tint`, não o degradê do painel. |
| `.detail-card__title` | `S:3384` | Caixa alta, 12,8 px, peso 800, divisória, ícone azul-claro. |
| `.detail-card__header` | `S:3456` | Caixa alta, 12 px, peso 800, fundo `#f4f7fb` literal. |
| Título de modal | `S:1752` | 24 px, peso 800; no detalhe da OS é `h3` (`rmas.component.html:190`) ou `h2` (`rma-detail-modal.component.html:33`), com 24 px e peso 700 por CSS próprio. |
| Nível de título em painel | templates | `h2` em Relatórios e Notificações, `h3` em Dashboard, Peças e Kanban, `h2` numerado em Importação (`catalog-import.component.html:4,9,18`). |

Cinco estilos para "título de uma caixa" e níveis de título que variam sem razão.

### 3.4 Cartões, painéis e caixas

| Nome | Definição | Uso |
| --- | --- | --- |
| `.panel` | `S:234` | 21 templates. Contêiner base. |
| `.table-card` / `.table-card--list` | `S:1043-1136` | 11 usos; tabela, cabeçalho tonal, zebra, hover. |
| `.detail-card`, `.detail-tile`, `.detail-facts`, `.detail-summary` | `S:3367-3517` | Detalhe da OS. Borda `#cfdbe7` e sombra própria (`S:3368-3371`), fora dos tokens. |
| `.record-card`, `.item-row` | `S:1704`, `S:2747` | Histórico e itens expansíveis. |
| `.form-section` | `S:1443` | Grupo de formulário, fundo `--surface-alt`. |
| `.status-card`, `.timeline-card` | `S:888-924` | Ainda em uso: mensagem de erro e sucesso em OS e Kanban, auditoria do Dashboard. |
| `.queue-card`, `.module-card`, `.metric-card`, `.catalog-card`, `.report-card`, `.matrix-card`, `.form-panel`, `.stat-card`, `.kanban-column`, `.rma-card`, `.card-grid`, `.hero-tags`, `.kanban-toolbar` | `S:888-1297`, `S:1798-1839` | **Sem ocorrência nos templates** (busca por nome em `.html` e `.ts`). Código morto provável, na ordem de 400 linhas. |
| `.muted-box`, `.toggle-box`, `.delete-target`, `.import-card` | `S:1405`, `S:2119`, `S:2296`, `A/pages/catalog-import` | Caixas de uso único com fundos e bordas próprios. |
| `app-collapsible-section` | `A/shared/collapsible-section/...css:1` | O host tem borda e raio próprios. |

Níveis aninhados medidos por leitura:

- Detalhe da OS (lista): `section.modal-panel.panel` > `div.detail-card.detail-card--body` > `article.detail-tile` (três níveis de caixa, `rmas.component.html:169, 223, 244`).
- Detalhe da OS (Kanban): `section.detail-card` > `app-collapsible-section` (host com borda) > `li.detail-tile` (`rma-detail-modal.component.html:56-70`). A moldura dupla precisa ser conferida no navegador.
- Modais de cadastro: `section.modal-panel.panel` > `fieldset.form-section` (borda e fundo) > campos, e no usuário `permission-picker` com linhas tonais dentro.

### 3.5 Formulários

| Item | Definição | Evidência |
| --- | --- | --- |
| Campo | `S:1340-1393` `.field-group` | Padrão claro: 40 px, raio 10, foco e erro tokenizados. |
| Rótulo | `S:1345` | Semibold, tamanho do corpo (16 px) no cadastro; 14 px semibold no formulário inline (`S:3711`). Dois tamanhos de rótulo. |
| Obrigatório | `S:3713` `.field-group--required` | Só dentro de `.inline-form`. 126 `field-group` nos templates, 16 com `--required`. Modais de cadastro sem marcação; Peças escreve "(obrigatório)" por extenso em `parts.component.html:346` e `:454`. |
| Erro | `S:1396` `.field-error` | Padrão único. |
| Grupos | `S:1443` `form-section` | Usado em 6 modais de cadastro. Cabeçalho do grupo igual em todos, bom. |
| Ajuda | `.field-hint` (`A/pages/users/users.component.ts`), `.form-section__hint` (`protocols.component.ts`), `<small>` (`catalog-import.component.html:11`) | Três jeitos de escrever apoio de campo. |
| Rodapé | `.form-actions` | Cancelar neutro à esquerda, primário à direita. Padrão sólido. |
| Grade | `S:1431` `.form-grid` | Duas colunas; inline com `gap` diferente (12 px contra 13,6 px, `S:1434` e `S:3709`). |

### 3.6 Tabelas

| Item | Evidência |
| --- | --- |
| Cabeçalho | `S:1071` faixa `--brand-tint`, 12,8 px, peso 700 em `.table-card`; relatórios repetem o padrão. |
| Zebra, divisória e hover juntos | `S:1065`, `S:1087`, `S:1095`. Três sinais para separar linhas ao mesmo tempo. A OS ainda troca o hover por outra cor (`.rma-table-row:hover`, `rmas.component.ts`). |
| Vazio | `.empty-state` em todas, com ícone, título e, às vezes, ação. Dashboard usa só frase, sem título (`dashboard.component.html:29,65,91`). |
| Ações | Coluna `.table-actions-col` com ícones. Padrão sólido. |
| Linha clicável | Só OS e Dashboard; as demais abrem por ícone. |

### 3.7 Estados vazio, carregando e erro

| Estado | Situação |
| --- | --- |
| Vazio | `.empty-state` com variantes `--centered` e `.panel.empty-state`; a regra é redefinida 9 vezes em `S` (linhas 1941, 1949, 1953, 1957, 1961, 2322, 2326, 2626, 3609). |
| Carregando | Overlay global (`A/app.html:5`) mais `<div aria-busy="true"></div>` **vazio** em mais de 25 lugares (clientes, produtos, usuários, perfis, protocolos, peças, OS, Kanban, notificações, auditoria...). O Dashboard e os relatórios mostram um `.panel` vazio (`dashboard.component.html:11`, `reports.component.html:172,177`). Nenhum esqueleto. |
| Erro de carga | `.empty-state role="alert"` com "Tentar novamente"; Relatórios usa `.panel.empty-state` (`reports.component.html:73`). |
| Erro de ação | `.alert-banner--error`, 16 usos; OS e Kanban usam `.status-card.panel` com `h3` como mensagem (`rmas.component.html:54`, `kanban.component.html:25`). |
| Sucesso | `.alert-banner--success` nos cadastros; OS usa `.status-card.success-card` (`rmas.component.html:60`). Os dois verdes são literais diferentes dos tokens `--success-*` (`S:926`, `S:1907`). |

### 3.8 Modais

| Item | Evidência |
| --- | --- |
| Estrutura | `.modal-overlay` > `.modal-panel.panel` com `appModalFocus` em todos. Consistente. |
| Larguras | 560 (`--narrow`, 9 usos), 920 (padrão), 1080 (`--form-wide` e `--wide`), mais `user-form-modal` 780 (`users.component.ts:48`), `profile-form-modal` 860 (`profiles.component.ts:37`) e `history-panel` 720 (`parts.component.ts:78`). Seis larguras. |
| Padding | Padrão `1.1rem .8rem 1.1rem 1.1rem` (`S:1574`, assimétrico por causa da barra de rolagem); detalhe do Kanban `1.25rem .9rem 1.5rem 1.5rem` (`rma-detail-modal.component.css:4`). |
| Cabeçalho | Título em `h3` de 24 px; Perfis envolve o título em `div` extra (`profiles.component.html:120`); o detalhe da OS tem barra com código e Fechar, depois título. Usuários reescreve o padding e a divisória do cabeçalho em CSS próprio (`users.component.ts:51`). |
| Rodapé | `.form-actions` padronizado nos cadastros. |
| Fundo | Cadastros brancos; detalhe da OS com canvas `#eaf0f6` (`S:3322`) e cartões brancos. |

### 3.9 Listas, abas e filtros

- **Abas:** duas aparências. Sublinhada (`S:1646`, Notificações, Peças, Relatórios) e elevada (`S:3581`, detalhe da OS).
- **Filtros:** três implementações. `catalog-toolbar--filters` (Clientes, Produtos, Usuários, Peças, Protocolos, Relatórios, Auditoria, OS), `kanban-filters__bar` (Kanban) e `inbox-filters` (Notificações, que estende a primeira). Perfis usa `catalog-toolbar` sem `--filters` (`profiles.component.html:6`). A OS neutraliza o formulário com `display: contents` (`rmas.component.ts`). O seletor da visualização salva do Kanban mede 44 px (`kanban.component.css:143`), os demais 40 px. A skill `navitas-ui` diz que o padrão é o do Kanban, mas só uma tela o usa.
- **Notificações:** lista de linhas com filete (`notifications.component.css:12-17`), enquanto o documento [affordance das notificações](2026-11-14-affordance-notificacoes.md) descreve cartões brancos com chevron para o painel do sino. O mesmo item tem duas aparências (sino e caixa de entrada) e o título é um link de 23 px de altura em cerca de cem linhas.
- **Indicadores:** `.page-summary` (OS, Kanban, Peças, Relatórios) contra `.dashboard-summary__item` (cartões com degradê e ícone sólido, `dashboard.component.ts:70-134`).

### 3.10 Tipografia, cores, espaçamento, sombras e raios

Contagens em `S` fora de `:root` (linhas 140 em diante):

| Categoria | Achado |
| --- | --- |
| Tamanho de fonte | 22 valores literais em `rem` (0,66; 0,7; 0,72; 0,75; 0,76; 0,78; 0,8; 0,82; 0,85; 0,86; 0,88; 0,9; 0,92; 0,95; 0,98; 1; 1,2; 1,35; 1,45; 1,5; 1,8; 1,9) contra 21 usos de `var(--font-size-*)`. O mais repetido é 0,82 rem (9 vezes). Três valores (0,66, 0,7 e 0,72 rem) ficam abaixo de 12 px. |
| Peso | 16 `600` e 9 `700` literais ao lado de 17 usos de token; peso `800` em cinco lugares (título de página, título de modal, rótulos de detalhe). |
| Cor | 71 hexadecimais e 50 `rgba()` fora de `:root`, mais 42 literais em CSS de componentes. `#ffffff` aparece 22 vezes onde existe `--surface`. Login tem paleta própria (`login.component.css:13,93,163,176,202`). Três azuis de borda ou fundo repetidos como literal: `#cfdbe7`, `#f4f7fb`, `#eaf0f6`. |
| Espaçamento | 147 declarações de `margin`, `padding` ou `gap` com `rem` ou `px` literal em `S`, 44 em CSS de componente e 21 componentes com `styles: []` inline. Valores como 0,15; 0,2; 0,35; 0,45; 0,55; 0,6; 0,65; 0,85; 0,9 rem. `--space-7` é referenciado (`S:1945`, `S:1950`) sem estar definido. |
| Raio | 16 usos de `--radius-sm` e 13 de `--radius-pill`, mas também `999px` (16x), `14px`, `9px`, `11px`, `5px`, `8px`, `2px`, `1px` literais. |
| Sombra | `--shadow` e `--btn-primary-shadow`, mais pelo menos 9 sombras literais diferentes (`S:345`, `S:1313`, `S:1550`, `S:2161`, `S:3371`, `S:3600`, entre outras). |
| Especificidade | Zero `!important`. Mas há seletores dobrados para ganhar peso: `.button-secondary.button-secondary` (`S:290`), `.link-button.link-button` (`S:2084`), `.custom-select__trigger.custom-select__trigger` (`S:3559`), `.tab-list.tab-list--raised` (`S:3581`), `.empty-state.empty-state--centered` (`S:3609`), cadeias `:is()` de seis termos (`S:3509-3562`). `fieldset.form-section` é declarado duas vezes (`S:1443`, `S:1447`). |
| Ícones | Conjunto único `app-icon`, traço de 2 px. Exceção: o X de fechar copiado em SVG em 14 templates. |
| Dicas | `appTip` e o tooltip de `appRowAction` compartilham a mesma classe (`row-action__tip`, `tip.directive.ts:41`); a distância difere (8 px contra 6 px). Nenhum uso de `title` HTML nas telas. Padrão sólido. |
| Responsivo | Quebras em 1180, 900, 720, 600 e 480 px; a skill documenta 1180, 900, 720 e 480. |

## 4. Duplicações de conceito

Telas ou componentes com a mesma função e visuais diferentes.

| Conceito | Variantes encontradas | Onde |
| --- | --- | --- |
| Detalhe da OS | (a) modal largo com cabeçalho de código, resumo em `dl`, abas elevadas e corpo em `detail-card--body`; (b) modal de duas colunas (principal e lateral de 348 px) com seções recolhíveis empilhadas, sem abas, com "Abrir na lista" e "Recolher tudo". Mesmos dados, mesmos componentes de campo, dois layouts. `.avatar` ainda é redefinido com 26 px contra o global de 28 px (`rma-detail-modal.component.css:52`). | `rmas.component.html:166-340`, `shared/rma-detail-modal` |
| Lista de cadastro | Clientes, Produtos e Usuários quase idênticos; Perfis com barra de filtro diferente e cabeçalho de modal em `div`; Protocolos com modal largo e itens expansíveis; Peças com abas e três painéis de tabela; Auditoria sem painel de filtro (`audit.component.html:3-9`). Vazio, carregando e erro repetidos à mão em cada template. | `pages/clients`, `products`, `users`, `profiles`, `protocols`, `parts`, `audit` |
| Formulário de cadastro x formulário inline | Cadastro: rótulo de 16 px, sem asterisco, grupos tonais. Inline: rótulo de 14 px, asterisco, sem grupos. Mesma intenção (preencher campos e salvar), dois visuais. | `S:1340`, `S:3709` |
| Indicadores no topo | Faixa simples (`page-summary`) e cartões coloridos (Dashboard). | `S:861`, `dashboard.component.ts:70` |
| Item de notificação | Cartão no sino, linha na caixa de entrada, modal de detalhe com botões próprios (`notification-detail__ghost`). | `shared/notification-bell`, `pages/notifications`, `shared/notification-detail-modal` |
| Mensagem de feedback | `alert-banner`, `status-card`, `.panel.empty-state`, `.empty-state` e `field-error`. | 16, 3, 1 e 13 ocorrências |
| Barra de filtros | Catálogo, Kanban, Notificações. | seção 3.9 |
| Painel com título | `table-card` (faixa tonal), `timeline-card` (sem faixa), `import-card` (sem faixa), `.report-card` morto. | `dashboard.component.html:62`, `catalog-import.component.html:3` |
| Estado ativo/inativo | Ponto (`state-dot`) e chip (`mini-chip warranty-off`). | `users`, `protocols`, `notifications`, `parts` |
| Abas | Sublinhadas e elevadas. | `S:1646`, `S:3581` |
| Relatórios | Painéis `table-card` com `h2`, mais gráficos `app-donut-chart`/`app-bar-chart` e tabelas; resumo em `page-summary`. Apenas aqui os números têm alinhamento à direita. | `pages/reports` |

## 5. Quadro de destoâncias

Tipos: **Bug** (erro objetivo de aparência ou usabilidade), **Inc.** (inconsistência entre telas ou componentes), **Dívida** (CSS ou estrutura que atrapalha manutenção sem aparecer sozinha). Impacto e esforço em A (alto), M (médio), B (baixo). Prioridade: P1 (fazer primeiro: impacto alto ou queixa recorrente), P2, P3.

| ID | Tipo | Onde | Padrão esperado | Correção proposta | Imp. | Esf. | Prio. |
| --- | --- | --- | --- | --- | --- | --- | --- |
| V-01 | Inc. | `rmas.component.html:169-244`, `rma-detail-modal.component.html:56-70`, `S:1443`, `S:3367` | Quatro níveis de superfície com regra: contêiner, grupo, item (padroes-visuais, seção 3.4) | Definir a regra de aninhamento, migrar `detail-tile` e subcaixas para fundo tonal sem sombra, raio concêntrico | A | M | P1 |
| V-02 | Inc. | `S:3713` (só inline), 6 modais de cadastro, `parts.component.html:346,454` | Asterisco de obrigatório em todo formulário | Mover `.field-group--required` para o escopo global, aplicar nos modais, remover "(obrigatório)" escrito | A | B | P1 |
| V-03 | Bug | `rma-detail-modal.component.html:56-70` com `collapsible-section.component.css:1` | Um único contorno por seção | Conferir no navegador; se houver moldura dupla, tirar a borda de `detail-card` ou do host | M | B | P1 |
| V-04 | Inc. | `S:352-390`, `S:2091`, `S:2219`, `S:2496-2541`, `S:2838`, `parts.component.html:97-99`, `notifications.component.css:25` | Duas alturas (chip 28, selo 22), famílias `.chip--*` com nome semântico próprio | Criar `.chip` e `.chip--danger/warning/success/neutral/brand`; migrar status, garantia, severidade, peças; subir selo de 11,2 para 12 px | A | M | P1 |
| V-05 | Inc. | `clients.component.html:6`, `products.component.html:6` | Ação de cabeçalho com ícone quando as irmãs têm | Adicionar ícone em "Importar CSV" ou decidir "sem ícone" para todas | B | B | P3 |
| V-06 | Bug | `S:321`, 9 usos | Um tamanho de botão (40 px) | Remover `.button-secondary--small` ou torná-lo realmente menor com a decisão do dono | M | B | P2 |
| V-07 | Bug | `parts.component.html:80-87`, `S:3728`, `reports.component.css:12` | Números e valores à direita, `tabular-nums` | Criar `.num` global em `S` e aplicar nas cinco colunas de Peças e demais tabelas | M | B | P2 |
| V-08 | Dívida | `S` (22 tamanhos), `rma-kanban-board.component.css` (0,98; 0,82; 0,72; 0,7 rem) | Escala de sete degraus, mínimo de 12 px | Mapear cada literal para o degrau mais próximo; criar `--font-size-display` e `--font-weight-heading` | A | M | P2 |
| V-09 | Dívida | `S` (147), CSS de componentes (44), `styles: []` de 21 componentes, `S:1945,1950` (`--space-7` indefinido) | Só `var(--space-*)` | Definir `--space-7`, substituir por busca guiada, bloquear com lint | M | A | P2 |
| V-10 | Dívida | `S:345`, `S:1313`, `S:1550`, `S:2161`, `S:3371`, `S:3600` e outras | Três níveis de elevação por token | Criar `--shadow-raised` e `--shadow-overlay`, trocar as literais | M | B | P3 |
| V-11 | Inc. | `users.component.ts:48`, `profiles.component.ts:37`, `parts.component.ts:78`, `S:1574`, `rma-detail-modal.component.css:4`, `profiles.component.html:120` | Três larguras (560, 760, 1080) e um cabeçalho e padding únicos | Unificar larguras e cabeçalho, remover `div` extra e CSS de cabeçalho por tela | M | M | P2 |
| V-12 | Dívida | `S:888-1297`, `S:1798-1839` (`queue-card`, `module-card`, `metric-card`, `catalog-card`, `report-card`, `matrix-card`, `form-panel`, `stat-card`, `kanban-column`, `rma-card`, `card-grid`, `hero-tags`, `kanban-toolbar`) | Só classes em uso | Confirmar ausência de uso dinâmico e remover cerca de 400 linhas; migrar `status-card` e `timeline-card` para `.panel` | M | B | P2 |
| V-13 | Inc. | mais de 25 `<div aria-busy="true"></div>`, `dashboard.component.html:11`, `reports.component.html:172,177` | Esqueleto de lista e de painel | Criar `.skeleton` e `app-skeleton-rows`; substituir as regiões vazias | A | M | P2 |
| V-14 | Dívida | 71 hex e 50 rgba em `S`, 42 em componentes, login | Cor por token | Criar tokens para `#cfdbe7`, `#f4f7fb`, `#eaf0f6`, `#ffffff`; documentar a paleta do login como exceção | M | M | P2 |
| V-15 | Inc. | `S:926`, `S:1907`, `S:1901` | Um verde e um vermelho de feedback, vindos de `--success-*` e `--danger-*` | Reescrever `alert-banner--*` e remover `success-card` com os tokens | B | B | P3 |
| V-16 | Inc. | `rmas.component.html:54,60`, `kanban.component.html:25`, `reports.component.html:73`, 16 `alert-banner` | Erro de ação em `alert-banner`; falha de carga em `empty-state` | Migrar os três usos de `status-card` e o painel de erro de Relatórios | A | B | P1 |
| V-17 | Inc. | `dashboard.component.html:62` (`timeline-card`), `catalog-import.component.html:3,8,17` (`import-card`), `h2` x `h3` | Todo painel com título usa o mesmo cabeçalho e o mesmo nível | Migrar para `table-card` ou novo `.panel--titled`; uniformizar `h2` | A | B | P1 |
| V-18 | Inc. | `S:861`, `dashboard.component.ts:70-134`, `S:1798` | Um componente de indicadores | Decidir o visual (decisão 11) e criar `app-kpi` ou ajustar `page-summary` | M | M | P2 |
| V-19 | Inc. | `rmas.component.html:166-340`, `shared/rma-detail-modal`, `rma-detail-modal.component.css:52` | Um único detalhe da OS | Unificar layout (decisão 3), reaproveitar seções e campos, remover o `.avatar` duplicado | A | A | P1 |
| V-20 | Inc. | `S:1841`, `kanban.component.html:31-87`, `notifications.component.html:54`, `profiles.component.html:6`, `kanban.component.css:143` | Uma barra de filtros | Extrair `app-filter-bar` com busca, seletores de 40 px, avançados recolhidos e ações no fim | A | M | P1 |
| V-21 | Bug | `notifications.component.css:24` (título de 23 px, cerca de 100 itens), `:25` (selo de 11,2 px), `:12-17`, `notification-bell` | Alvo de 40 px, selo de 12 px, um item para sino e caixa | Área inteira do item clicável, selo como ícone de severidade, componente de item compartilhado (decisão 10) | A | M | P1 |
| V-22 | Bug | `S:241-251`, `S:169` | Botão em semibold, como tab, link e chip | Declarar `font-weight: var(--font-weight-semibold)` em `.button-primary` e `.button-secondary` | A | B | P1 |
| V-23 | Dívida | `S:290`, `S:2084`, `S:3559`, `S:3581`, `S:3609`, `S:3509-3562`, `S:1443/1447`, nove `.empty-state` | Seletor simples, uma definição por componente | Reorganizar na ordem base, variante e contexto; apagar duplicatas | M | M | P3 |
| V-24 | Inc. | `S:302`, `inbox-toggle`, `inbox-clear`, `kanban-filters__toggle`, `protocol-items__add`, `protocol-head__action`, `notification-detail__ghost` | Variante de botão por modificador do catálogo, não por classe da tela | Trocar o `:has()` implícito por `.button-secondary--neutral` explícito; mapear as sete variantes locais | M | M | P2 |
| V-25 | Inc. | `S:2036`, `S:2065`, `notifications.component.css:24`, seis classes locais de link | Um `.link-button` com um alvo de 40 px e um estado de hover | Consolidar em duas variantes (texto e cabeçalho de seção) | M | B | P2 |
| V-26 | Inc. | `parts.component.html:97` contra `users.component.html:106`, `protocols.component.html:74` | Ativo/Inativo com o mesmo visual | Escolher `state-dot` ou chip neutro e aplicar nas quatro telas | B | B | P3 |
| V-27 | Inc. | `S:1065,1087,1095`, `rmas.component.ts` (`.rma-table-row`) | Um sinal de linha (divisória) e um hover, ou zebra sem divisória | Dois sinais no máximo; um só hover para linha clicável | B | B | P3 |
| V-28 | Inc. | `rmas.component.html:241`, `S:436`, `S:1761`, `catalog-import.component.html:5` | Sem texto explicativo no topo de caixa e de modal | Remover os parágrafos de apoio e deixar o rótulo curto; dica por `appTip` | M | B | P2 |
| V-29 | Inc. | `S:3320`, `S:3581` | Mesmo fundo de modal e mesma aba | Decidir entre canvas cinza e branco no detalhe; escolher abas sublinhadas ou elevadas | M | M | P3 |
| V-30 | Inc. | `S:1121`, `S:1472`, `S:3384`, `S:3456`, `collapsible-section.component.css`, `S:402` | Um cabeçalho de caixa (decisão 2) | Definir um `.box-header` com fundo, borda e título; usar nos painéis, grupos, cartões de detalhe e seções recolhíveis | A | M | P1 |
| V-31 | Inc. | `S:2009` (caixa alta, 11 px), `S:3384` (caixa alta, 13 px), `S:3439` (normal, 13 px), `S:3469` (caixa alta, 11,5 px), `S:1526` | Um rótulo de par rótulo/valor | Escolher uma forma (recomendada: normal, 13 px, `--muted`) para `meta-list`, `detail-facts`, `detail-tile` | M | B | P2 |
| V-32 | Dívida | 14 templates com `.modal-close` e SVG copiado | `app-icon name="close"` | Criar `app-modal-close` ou usar `app-icon` | B | B | P3 |
| V-33 | Dívida | `S` em 5 quebras (1180, 900, 720, 600, 480), skill com 4 | Quebras documentadas | Incluir 600 na documentação ou migrar para 720 | B | B | P3 |
| V-34 | Dívida | `tip.directive.ts:3` (8 px), `row-action.component.ts:5` (6 px) | Uma distância | Escolher 6 ou 8 px | B | B | P3 |

## 6. Os 10 problemas mais graves

Ordenados pelo efeito direto nas queixas do dono.

1. **Não há regra de superfícies nem de cabeçalho de caixa** (V-01, V-30, V-17). Quinze nomes de cartão e cinco cabeçalhos diferentes; o detalhe da OS aninha três níveis; painéis sem título viram bloco de texto. É a causa-raiz do "cara de bloco de texto".
2. **O detalhe da OS existe em dois layouts** (V-19). A tela mais importante do produto muda de aparência conforme se chega por lista ou por Kanban.
3. **Chips sem família** (V-04). Dez tipos, cinco alturas, nomes de prioridade e garantia usados como cores genéricas e selo de 11 px na caixa de notificações.
4. **O asterisco de obrigatório só existe nos formulários inline** (V-02). O mesmo objetivo, preencher e salvar, tem dois visuais e o cadastro principal não indica o que é obrigatório.
5. **Três implementações de barra de filtros** (V-20), com altura de seletor diferente no Kanban e um filtro de Perfis fora do padrão.
6. **Mensagens de erro e sucesso em quatro componentes** (V-16): `alert-banner`, `status-card`, `panel empty-state` e `empty-state`.
7. **Cartões de indicador diferentes entre Dashboard e as demais telas** (V-18), com degradê colorido só no Dashboard.
8. **Notificações com alvo de clique de 23 px, selo de 11 px e dois visuais para o mesmo item** (V-21).
9. **Botões sem peso e com variantes soltas** (V-22, V-24, V-25, V-06): o botão primário sai em peso 400, `--small` tem 40 px, sete botões locais e três links diferentes.
10. **Tokens sem uso obrigatório** (V-08, V-09, V-14, V-10): 22 tamanhos de fonte, 147 espaçamentos, 71 hexadecimais e 9 sombras literais. Sem trava, cada correção visual reabre a divergência.

Fora do top 10, mas com efeito visível: carregamento sem esqueleto (V-13), números à esquerda em Peças (V-07) e larguras de modal (V-11).

## 7. Pesquisa de modelos

Referências consultadas em novembro de 2026 e o que se aplica ao Navitas. O texto abaixo é paráfrase; os detalhes estão nas páginas citadas. As páginas oficiais do Material 3, do Stripe e do Atlassian Design System foram lidas só em parte (resultados de busca e trechos), então tratam de princípios gerais e precisam de conferência antes de virar regra.

### 7.1 Como separar informações sem virar um bloco de caixas

- **NN/g, proximidade e região comum.** A proximidade é um dos sinais de agrupamento mais fortes e pode vencer cor e forma ([NN/g: proximidade](https://www.nngroup.com/articles/gestalt-proximity/)); um limite visível faz os itens dentro dele serem lidos como um grupo ([NN/g: região comum](https://www.nngroup.com/videos/common-region-gestalt/)). Aplicação: espaço de 8 px dentro do grupo e de 16 a 24 px entre grupos resolvem a maior parte; use caixa quando o agrupamento precisar ser inequívoco, reforçada por tipografia. Isso reconcilia "mais caixas" com "sem caixa dentro de caixa".
- **Polaris (Shopify).** Orienta usar seção para uma região normal de página e cartão para composições reutilizáveis, evitar embrulhar todo bloco em cartão, não colocar um fundo só para reproduzir cada limite antigo, evitar tabela sozinha em cartão e dar raio menor às superfícies internas ([layout e organização espacial](https://polaris.shopify.com/design/layout/spacial-organization), [migração do componente Card](https://shopify.dev/docs/apps/build/app-home/migrate-from-polaris-react/card)). Aplicação: nível 2 e 3 do Navitas com fundo tonal e raio concêntrico; `table-card--list` já segue a ideia de "tabela é o conteúdo do painel".
- **Material 3, tipos de cartão.** Elevado separa mais do fundo, preenchido separa pouco, contornado separa por borda e não por sombra. A página oficial não pôde ser lida; a descrição vem da documentação de plataforma ([Compose: Card](https://developer.android.com/develop/ui/compose/components/card)) e do guia de [cartões do Material 3](https://m3.material.io/components/cards/guidelines). Aplicação: painel de página como contornado com sombra leve (já é) e item interno como preenchido (fundo tonal, sem borda).
- **Linear.** O redesenho recente parte de que nem todo elemento de uma interface densa deve ter o mesmo peso: o que serve à tarefa atual fica forte e a navegação e a orientação recuam ([redesenho de 2026](https://linear.app/now/behind-the-latest-design-refresh); série anterior em [How we redesigned the Linear UI](https://linear.app/blog/how-we-redesigned-the-linear-ui)). Aplicação: no Navitas competem a lateral azul saturada, o degradê do cabeçalho de página, a faixa tonal de cada painel e a faixa de cada grupo de formulário. Reduzir o degradê do cabeçalho de página e usar uma só faixa de cabeçalho de caixa (V-30).

### 7.2 Hierarquia, botões e affordance de clique

- **Primer (GitHub).** Variantes padrão, primária, perigo, invisível e link; um primário por página sempre que possível; primário no fim do grupo e acompanhado de secundário; perigo só para ação destrutiva, normalmente com confirmação; botão grande é exceção ([Primer: Button](https://primer.style/components/button)). Aplicação: confirma o catálogo atual do Navitas e sustenta remover `--small` (V-06) e consolidar link-button em "invisível" (V-25).
- **Carbon.** Tabela de dados com cinco alturas de linha, cabeçalho no mesmo tamanho da linha, ordenação indicada no cabeçalho, mais largura para dado denso ([uso da tabela](https://carbondesignsystem.com/components/data-table/usage/), [estilo](https://carbondesignsystem.com/components/data-table/style)). Na versão 9 a tabela básica usa divisória e não zebra. Aplicação: definir duas densidades (compacta e confortável) e escolher um sinal de linha (V-27).
- **Material 3, listas.** Ícone, título, texto de apoio e ação em posições previsíveis ([listas](https://m3.material.io/components/lists/overview), já citado na [affordance das notificações](2026-11-14-affordance-notificacoes.md)). Aplicação: item de notificação e item de histórico com a mesma gramática.
- **GitHub e Linear, caixa de entrada.** Notificações como espaço de triagem ([Linear](https://linear.app/docs/inbox), [GitHub](https://docs.github.com/en/subscriptions-and-notifications/how-tos/viewing-and-triaging-notifications/managing-notifications-from-your-inbox)). Aplicação: item inteiro como ação, ponto de não lida, hora na mesma área.

### 7.3 Telas de detalhe e edição inline

- **Jira.** A visão do item removeu o botão Editar: clicar no campo edita no lugar; o layout separa campos de descrição, campos de contexto e campos ocultos, com contexto agrupado ao lado ([novidades da visão do item](https://community.atlassian.com/t5/Jira-articles/Updates-to-Jira-Cloud-s-new-issue-view-in-the-past-year/ba-p/1696849), [layout de campos](https://confluence.atlassian.com/display/JIRASOFTWARECLOUD/Configure+field+layout+in+the+issue+view)). Aplicação: o detalhe do Kanban já tem coluna principal e lateral de 348 px; essa estrutura deveria valer também para a lista (V-19).
- **Stripe.** Página de detalhe com título, ações da página, coluna primária e secundária, cada uma feita de módulos ([DetailPage](https://docs.stripe.com/stripe-apps/components/detailpage)). Aplicação: módulo é o nível 2 do Navitas; a lateral recebe status, responsável, prioridade, prazo e garantia.

### 7.4 Exemplos concretos propostos por tela

| Tela | Proposta |
| --- | --- |
| Detalhe da OS | Uma estrutura só: barra com código, "Abrir na lista" (somente no Kanban) e Fechar; título e cliente; coluna principal com seções recolhíveis (falha, produtos, diagnóstico, reparo, peças, protocolos, histórico) e lateral com pares rótulo/valor editáveis (status, responsável, prioridade, prazo, garantia). Seções no mesmo cabeçalho de caixa; item de produto em fundo tonal sem borda. Em tela estreita a lateral passa para o topo. |
| Listas de cadastro | Um modelo de página: cabeçalho com ação primária, barra de filtros única, painel de tabela com cabeçalho tonal, números à direita, Ativo/Inativo com o mesmo selo, ações em ícone, vazio e carregando com esqueleto. Clientes, Produtos, Usuários, Perfis, Protocolos e Peças deixam de diferir. |
| Formulários e modais | Três larguras (560, 760, 1080), cabeçalho igual (título e Fechar), grupos com a mesma faixa, asterisco de obrigatório, rodapé com Cancelar neutro e ação primária. Inline só para um ou dois campos. |
| Dashboard | Indicadores com o mesmo componente da faixa das outras telas (ou cartões em todas, decisão 11); três painéis com o mesmo cabeçalho; "Auditoria" deixa de ser `timeline-card`. |
| Notificações | Lista agrupada por dia em cartões brancos sobre fundo tonal, severidade em ícone, título sem link de 23 px, item inteiro clicável com chevron, mesmo componente no sino e na caixa; filtros na barra única. |
| Relatórios | Cada indicador em um painel com título e a mesma faixa, gráfico mais tabela, números à direita, filtros na barra única e carregamento com esqueleto. |
| Kanban | Mantém o padrão de filtros como referência; seletor da visualização salva com 40 px; mensagens por `alert-banner`. |

## 8. Plano de correção, em fases

Estimativa em dias de uma pessoa de desenvolvimento, incluindo specs e conferência em 4201 (320 px e desktop). Nada disso começa antes de validadas as decisões.

| Fase | Conteúdo | Itens | Esforço | Risco e mitigação |
| --- | --- | --- | --- | --- |
| 0. Decisões | Reunião de validação das decisões da seção 9 e congelamento de telas novas até a Fase 3 | todos | 0,5 dia | Sem decisão, cada fase se perde. Registrar as respostas neste documento. |
| 1. Fundação | Tokens (escala de fonte, `--space-7`, sombras, cores literais), peso do botão, remover `--small`, família `.chip`, link-button, remover CSS morto, `app-icon` no fechar, números à direita | V-05 a V-10, V-12, V-14, V-15, V-22, V-25, V-32, V-34 | 4 a 5 dias | Mudança global de aparência. Comparar a [galeria de telas](2026-11-07-galeria-telas.md) antes e depois; rodar specs e build com zero avisos; entregar em commits por categoria. |
| 2. Superfícies e estados | Regra de níveis, `.box-header` único, painel com título, feedback único, estado vazio e esqueleto, tabela (hover, sinal de linha, `.num`), rótulo de par | V-01, V-03, V-13, V-16, V-17, V-27, V-28, V-30, V-31 | 4 dias | O cabeçalho de caixa aparece em todas as telas: fazer atrás de uma classe nova e migrar tela a tela. |
| 3. Formulários, modais e filtros | Asterisco global, larguras e cabeçalho de modal, `app-filter-bar`, Perfis e Auditoria no padrão, variantes de botão locais | V-02, V-11, V-20, V-24, V-26 | 4 dias | Filtros mexem em lista, paginação e testes; migrar uma tela, validar, repetir. |
| 4. Telas com duplicação | Detalhe da OS unificado, indicadores, notificações (item e sino), abas e fundo do detalhe, relatórios | V-18, V-19, V-21, V-29 | 7 a 9 dias | Detalhe da OS tem muitas specs (`rmas.component.*.spec.ts`) e permissões; manter os componentes `app-rma-*` e mexer só no esqueleto de layout. |
| 5. Trava | Lint de estilos (hex, `px`/`rem` de espaçamento e fonte fora de token, seletor dobrado), script de contagem usado nesta auditoria, checklist no roteiro de conferência | V-23 e prevenção | 2 dias | Lint ruidoso no começo; ligar como aviso e depois como erro. |

Total estimado: 21 a 25 dias de uma pessoa. As fases 1 e 2 sozinhas já mudam a percepção de "bloco de texto" (cabeçalho, níveis, chips, botão em semibold) e custam cerca de 8 a 9 dias.

Regra de execução: a cada fase, antes de editar, listar por busca todas as ocorrências do padrão; ao entregar, anexar a lista com o que foi migrado e o que ficou. Isso evita repetir o problema de corrigir só o caso apontado.

## 9. Decisões que o dono precisa tomar

1. **Aninhamento (V-01).** Aceita que "sem caixa dentro de caixa" signifique "sem borda e sombra dentro de borda": subgrupos dentro de um painel usam fundo tonal e raio menor, sem contorno? Alternativa: nenhum subgrupo visual, só divisórias.
2. **Cabeçalho de caixa (V-30).** Mantém a faixa tonal com barra azul em painéis e grupos, ou prefere uma versão mais calma (título e divisória, sem faixa), no espírito do Linear? Em qualquer caso será um único estilo.
3. **Detalhe da OS (V-19).** Qual layout vale para lista e Kanban: duas colunas com seções recolhíveis (hoje do Kanban) ou abas (hoje da lista)? A recomendação é duas colunas, com abas só se o dono quiser separar Peças e Protocolos.
4. **Obrigatório (V-02).** Asterisco vermelho em todos os formulários, conforme o inline? Recomendado.
5. **Filtros (V-20).** O padrão do Kanban (barra com avançados recolhidos) vale para todas as listas, ou as listas simples ficam com busca e seletores sempre visíveis?
6. **Botões (V-06, V-22).** Confirma tamanho único de 40 px (sem "small") e botão em semibold? Isso muda a aparência de todo o app, de forma sutil.
7. **Chips (V-04, V-26).** Aprova duas alturas (chip 28 px, selo 22 px), nomes novos de cor e Ativo/Inativo com o mesmo visual (ponto ou chip)?
8. **Escala tipográfica (V-08).** Aprova consolidar os 22 tamanhos em sete degraus, com mínimo de 12 px? Valores mudam em até 1 px.
9. **Carregamento (V-13).** Aprova esqueleto de linhas nas listas e nos painéis no lugar da região em branco?
10. **Notificações (V-21).** Caixa de entrada em cartões com chevron (como o documento de affordance descreve) ou em linhas compactas? O sino e a caixa passam a compartilhar o item.
11. **Indicadores (V-18).** Faixa simples (`page-summary`) em todas as telas, inclusive o Dashboard, ou cartões coloridos em todas?
12. **Larguras de modal (V-11).** Três larguras (560, 760, 1080) para todos os cadastros, mais o detalhe? Perfis, Usuários e Histórico de peças se ajustam.
13. **Código morto (V-12).** Autoriza apagar as classes de cartão sem uso (cerca de 400 linhas) depois de conferência?
14. **Processo.** Concorda em congelar telas novas durante as fases 1 a 3 e com a regra "corrigir a família, não o caso" nas revisões de PR?

## 10. Limites desta auditoria

- Capturas de tela não foram anexadas: a renderização do painel do navegador expirou nesta sessão. Medições (altura, raio, peso, fonte) foram feitas por estilos calculados em seis rotas.
- Detalhe da OS, modais de cadastro, Protocolos, Peças, Perfis, Usuários, Produtos e Auditoria foram auditados só pelo código.
- Contagens por busca de texto; classes dinâmicas e `ngClass` podem esconder usos. Confirmar antes de apagar CSS.
- A pesquisa externa usou fontes públicas e algumas páginas oficiais só foram lidas em trecho (indicado na seção 7).
