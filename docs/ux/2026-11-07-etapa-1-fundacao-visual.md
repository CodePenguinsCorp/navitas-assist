# Etapa 1 — Fundação visual comum: recorte e critérios de aceite

7 de novembro de 2026. Proposta para revisão; nada foi implementado. Referências: [estudo global](2026-11-06-estudo-ui-ux.md) e [plano da fase 1](2026-11-07-plano-fase-1-fundacao.md), já entregue.

## Roteiro das etapas

| # | Escopo | Estado |
| --- | --- | --- |
| 0 | Acabamentos: shell, ordem dos botões nos diálogos, rótulos do login, texto de relatórios | Entregue (`71d51ba`, `d954dc4`, `b0d569b`, `1b46f36`) |
| 1 | Fundação visual comum (este documento) | Em revisão |
| 2 | Piloto do Kanban: cabeçalho, indicadores, filtros, card | Depois da etapa 1 |
| 3 | Cadastros: clientes, produtos, usuários, catálogo de protocolos | |
| 4 | Ciclo da OS: lista, histórico, abertura, diagnóstico e os dois detalhes | |
| 5 | Operações: estoque, reposição, movimentos, reservas, impedimentos, protocolos | |
| 6 | Comunicação e análise: dashboard, notificações, relatórios | |
| 7 | Conferência global: telas, perfis, teclado e largura estreita | |

Cada etapa segue o ciclo: recorte e critérios, revisão sua, implementação, testes e build, conferência no navegador (inclusive 320 px) e relato das pendências antes de avançar.

## Divergência já resolvida: card do Kanban

A decisão 1 do resumo do estudo já foi tomada em 7 de novembro: **card enxuto** (SLA saudável e falha saem do card; cliente, exceções de SLA/bloqueio, prioridade, avatar e chave ficam). A recomendação conservadora anterior foi superada. Isso é tratado na etapa 2, não aqui. Se quiser reabrir a decisão, deve ser antes da etapa 2.

## Estado atual da base (inspeção de `frontend/src/styles.css`, 2191 linhas)

- **Tokens existentes:** cores (`--brand-blue`, `--text`, `--muted`, `--line`, `--surface`, estados de sucesso/aviso/perigo), raios (`--radius-sm/md/lg` = 10/12/16 px), sombra e `--focus-ring`. Fonte já é Segoe UI/Aptos.
- **Sem tokens:** altura de controle, espaçamento e tipografia. Os valores estão repetidos em cada regra.
- **Alturas de controle inconsistentes:** botão 40 px, campo 42 px, aba 40 px, `.button-secondary--small` 34 px, ícones de 28 a 46 px.
- **Valores soltos:** `border-radius: 10px` literal ao lado de `var(--radius-sm)`; 70 cores hexadecimais em `styles.css` e 36 nos CSS dos componentes, parte delas fora dos tokens.
- **Código morto provável:** `.top-user`, `.shell-logout` e `.eyebrow` não aparecem em nenhum template nem `.ts` após o commit `71d51ba`.
- **Já bom:** checkbox único, select/data compartilhados em `shared/form-controls`, estados de foco, `.field-group`, `.form-actions`.

## Recorte proposto da etapa 1

1. **Tokens, sem mudar o visual.** Introduzir variáveis para altura de controle, espaçamento (4/8/12/16/24/32), escala tipográfica e raios, com os valores atuais mais próximos. Trocar os valores literais por tokens nos controles compartilhados (botões, campos, abas, chips, ações de linha).
2. **Alinhamento de geometria.** Botão, campo, select e aba compartilham a mesma altura. Escolha pendente (ver abaixo).
3. **Estados dos componentes.** Hover, foco, desabilitado e erro consistentes em botão, campo, select, checkbox e aba. Hoje só o foco e o desabilitado estão padronizados.
4. **Mensagens.** `.field-error` e feedbacks com a mesma cor, ícone e posição; sem banner global para atualização pequena.
5. **Limpeza.** Remover CSS morto confirmado (`.top-user`, `.shell-logout`, `.eyebrow`) e hexadecimais que duplicam um token existente.

**Fora do recorte:** layout de qualquer tela, cabeçalhos de página, cards, tabelas, Kanban, modais de OS, cores novas, tema escuro, ícones novos e reordenação de campos.

## Decisões que preciso de você

1. **Altura dos controles.** O estudo propõe 36 px; hoje há 40/42 px. Opções: manter 40 px unificado (menor risco, quase sem mudança visual), ou ir para 36 px (mais denso, muda todas as telas de uma vez). Recomendo **40 px** nesta etapa e reavaliar a densidade depois do piloto.
2. **Paleta.** As cores do estudo (`#172B4D`, `#566171`, `#F7F8FA` etc.) diferem das atuais (`#1f3550`, `#63778d`, `#f4f7fb`). Recomendo **manter as atuais** nesta etapa, para não alterar a identidade antes de validar com operadores.
3. **Escala de espaçamento.** Aceitar 4/8/12/16/24/32 px como tokens, mapeando os `rem` atuais para o mais próximo.

## Critérios de aceite

1. Existem tokens para altura, espaçamento, tipografia e raios; botão, campo, select e aba usam a mesma altura.
2. Nenhuma tela muda de layout; a diferença visual entre antes e depois fica restrita a ajustes de poucos pixels nos controles.
3. Nenhum seletor removido é usado em algum template ou componente (verificado por busca).
4. Estados hover, foco, desabilitado e erro existem e se comportam igual em botão, campo, select, checkbox e aba.
5. `ng test` e `ng build` passam; os dois avisos de orçamento já existentes não pioram.
6. Conferência no navegador: login, e as telas internas que o ambiente permitir (exige backend), em 1440 px e 320 px, sem rolagem horizontal e sem quebra de alinhamento nos formulários.

## Como validar

- Testes unitários dos componentes compartilhados (`form-controls`) e dos specs que já tocam botões e abas.
- Comparação de capturas antes e depois nas mesmas larguras.
- O backend (`localhost:8080`) precisa estar de pé para ver as telas internas; sem ele, a conferência cobre só o login.
