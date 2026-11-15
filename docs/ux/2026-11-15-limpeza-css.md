# Limpeza de CSS e correção responsiva

Busca literal em todos os arquivos HTML, TypeScript (incluindo specs e templates inline) e CSS de `frontend/src/app`. A lista abaixo registra cada classe candidata com zero ocorrências antes da remoção:

| Classe | Ocorrências |
| --- | ---: |
| auth-brand | 0 |
| auth-layout | 0 |
| auth-panel | 0 |
| auth-panel--compact | 0 |
| card-grid | 0 |
| catalog-card | 0 |
| catalog-grid | 0 |
| catalog-list | 0 |
| catalog-toolbar__result | 0 |
| detail-grid | 0 |
| empty-state--centered | 0 |
| form-footer | 0 |
| form-grid--inline | 0 |
| form-panel | 0 |
| hero-tags | 0 |
| info-row | 0 |
| matrix-card | 0 |
| matrix-row | 0 |
| metric-card | 0 |
| metric-label | 0 |
| metric-value | 0 |
| metrics-grid | 0 |
| module-card | 0 |
| module-card--compact | 0 |
| module-grid | 0 |
| muted-box | 0 |
| policy-item | 0 |
| policy-list | 0 |
| queue-card | 0 |
| queue-entry | 0 |
| queue-list | 0 |
| report-card | 0 |
| report-list | 0 |
| report-meta | 0 |
| report-summary | 0 |
| search-field__heading | 0 |
| stats-grid--four | 0 |
| stats-grid--three | 0 |
| summary-list | 0 |
| support-line | 0 |
| timeline-list | 0 |

Verificados também `[class.x]`, `[class]`, `ngClass`, `classList`, concatenações e atributos `data-*`. As classes calculadas encontradas pertencem a status, prioridade, garantia e tons, sem gerar as famílias acima. Classes do Angular (`ng-dirty`, `ng-touched`) foram preservadas. O diff registra os seletores derivados, incluindo descendentes, modificadores e pseudoclasses.

`.repair-voided` aparece somente em `rma-detail-modal.component.spec.ts`, numa asserção `toBeNull()`. Não há atribuição estática ou dinâmica; removida a regra. `.repair-entry`, `.repair-line*`, `.alert-banner--success` e `.success-card` já não tinham regras no CSS global nem nos componentes. As ocorrências de `alert-banner--success` são asserções negativas.

Preservados blocos mistos com `.kanban-*` ou `.board-*`, mesmo contendo classes antigas. Preservados seletores com `:is(...)` para limitar o diff. Nenhum atributo `data-*` removido. Os estilos de componentes foram examinados para as famílias conhecidas; nenhuma remoção adicional foi comprovada.

As declarações de `.empty-state p` e `.empty-state h3` foram reunidas por seletor, mantendo largura máxima, cor, fonte e margens. A regra base `.empty-state` já era única; as variantes usadas mantêm seus valores. `--space-7: 40px` preserva o fallback anterior de 2,5rem na configuração atual (raiz de 16px), depois de 24 e 32px na escala.

Antes: 94.901 bytes e 3.756 linhas. Depois: 90.284 bytes e 3.475 linhas. Redução de 4.617 bytes e 281 linhas. A comparação da árvore CSS com PostCSS encontrou 88 ocorrências de seletores sem correspondente final, além de regras redundantes das mesmas famílias. Confirmou que todos os seletores `.board-*` e `.kanban-*` mantêm declarações e contexto de media query. Nos 587 seletores restantes em uso, as declarações foram preservadas, exceto o token novo; nas duas consolidações, a comparação considerou o conjunto das declarações.

Build sem avisos: bundle inicial de 488,52 kB e CSS global de 64,19 kB (antes: 67,67 kB). Nenhum aviso de orçamento de CSS por componente.

Suíte completa com `TZ=UTC`, `--watch=false` e o runner solicitado: 129 arquivos e 1.856 testes aprovados. O processo terminou com código 1 por erros `socket hang up` (`ECONNRESET`), sem falhas de asserção na execução final. Essa limitação impede considerar a execução totalmente limpa. No PowerShell, foi usado `npm.cmd` para preservar os argumentos do comando. Uma execução intermediária falhou na busca textual de `.shell.is-collapsed` enquanto o espaçamento do CSS estava sendo corrigido; a execução final passou esse teste.

`node scripts/test-rma-responsive-css.mjs` falhou antes e passou depois da correção A. Confere regras de quebra e restrição da grade; não calcula layout. Diagnóstico, Impedimentos, Peças, Componentes trocados, Movimentos, Protocolos, Intervenções, Tempo por etapa e as seções dos dois detalhes usam `app-collapsible-section`. As ações são projetadas no mesmo slot.

Não houve medição em navegador da rolagem de 29px, comparação visual ou prova de ausência de overflow a 320px. A suíte usa DOM sem cálculo de layout.
