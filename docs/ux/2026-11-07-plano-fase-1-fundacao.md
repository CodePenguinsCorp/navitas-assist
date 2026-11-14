# Fase 1 — Fundação: acabamentos globais Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Entregar os três ajustes globais de baixo risco decididos no estudo de UI/UX: ordem Cancelar → ação principal nos diálogos, rótulos visíveis no login e texto de relatórios sem justificativa técnica.

**Architecture:** Mudanças só em templates e CSS do Angular, sem alterar serviços, rotas, permissões ou contratos de API. Cada tarefa tem seu próprio teste Vitest (`ng test`) e vira um commit independente.

**Tech Stack:** Angular 21, Vitest 4 (`@angular/build:unit-test`), CSS global em `frontend/src/styles.css`.

**Spec:** `docs/ux/2026-11-06-estudo-ui-ux.md` (seção "Resumo para decisão", decisões 6 e 7, e "Candidatas à primeira entrega"). Decisões tomadas em 7 de novembro de 2026.

## Global Constraints

- Idioma da interface: português do Brasil. Manter os textos de ação já existentes ("Salvar alterações", "Cadastrar cliente", "Excluir cliente", etc.); só a ordem muda.
- Rodapé de diálogo: **Cancelar à esquerda, ação principal à direita**, em todos os diálogos de formulário e confirmação.
- Não remover permissões, validações, estados `disabled`, textos de "Salvando..." nem atributos de acessibilidade existentes.
- Rótulos de campo visíveis; `placeholder` não substitui rótulo. Manter `autocomplete="username"` e `autocomplete="current-password"`.
- Texto de implementação (formatos de exportação, documentação) não aparece para o usuário.
- Comandos assumem Git Bash ou PowerShell (sem `&&`); usar `npm --prefix frontend ...`.
- "Ação principal à direita" significa "depois de Cancelar" na ordem do DOM. **Não alterar CSS** de `.form-actions`; abaixo de 720 px os botões já empilham, com Cancelar em cima, como no Kanban.
- Fora de escopo: card do Kanban, filtros, abas do detalhe, paleta e tipografia (fases seguintes).
- Shell (usuário no rodapé da lateral e sino com contador) **já está entregue** no commit `71d51ba`; não há tarefa para isso.

## Pré-requisito

Existem restos não commitados de uma tentativa interrompida: cinco specs modificados, `frontend/src/app/pages/protocols/protocols.component.spec.ts` e `frontend/src/app/testing/dialog-actions.ts`. Antes da Tarefa 1, o usuário decide se descarta ou aproveita. Todos os commits listam os arquivos explicitamente (nunca `git add frontend/src/app`).

## Review Focus

- Botão principal com `disabled` durante envio continua desabilitado depois de trocar a ordem (Tarefa 1).
- Diálogo de exclusão: "Excluir X" continua com a classe `button-primary--danger` e o foco/ordem de Tab segue Cancelar → Excluir (Tarefa 1).
- Foco do teclado: ao inverter a ordem no DOM, Enter no formulário ainda dispara o `submit` do botão `type="submit"` (Tarefa 1).
- Login: rótulo visível não quebra o layout em 320 px e continua associado ao campo por `for`/`id` (Tarefa 2).
- Login: mensagem de falha e validação de campos obrigatórios continuam como estão (Tarefa 2).

---

### Task 1: Cancelar à esquerda nos diálogos restantes

**Files:**
- Modify: `frontend/src/app/pages/clients/clients.component.html:224-231` (formulário) e `:285-302` (exclusão)
- Modify: `frontend/src/app/pages/products/products.component.html:251-258` e `:310-327`
- Modify: `frontend/src/app/pages/users/users.component.html:226-233` e `:285-302`
- Modify: `frontend/src/app/pages/parts/parts.component.html:262-265` e `:303-306`
- Modify: `frontend/src/app/pages/protocols/protocols.component.html:194-197`
- Modify: `frontend/src/app/shared/rma-protocols/rma-protocols.component.html:70-73`
- Create: `frontend/src/app/testing/dialog-actions.ts`
- Create: `frontend/src/app/pages/protocols/protocols.component.spec.ts` (não existe no HEAD; TestBed com `ProtocolService` e `CatalogService` como mocks, `protocols.component.ts:61-62`; chamar `openCreateModal()` e `fixture.detectChanges()`)
- Test: specs existentes de clients, products, users (estender `users.component.pending.spec.ts`), parts (adicionar `openCreateModal` ao `PartsHarness`, papel `SERVICE_DESK`) e rma-protocols (papel `ADMIN` ou `TECHNICIAN`)

Registrados para a fase seguinte, **fora** desta tarefa: rodapé do `rma-block-panel` (só tem "Fechar" no cabeçalho), Cancelar na confirmação de estorno em `parts.component.html:373-376` e a ordem "Buscar / Limpar" do filtro de ordens de serviço (`rmas.component.html:64-67`, é filtro, não diálogo).

Já estão corretos e **não** devem ser alterados: `kanban.component.html` (3 diálogos), `rmas.component.html:478` e `:541`, `kanban-bulk-actions.component.html:53`. O botão "Cancelar" de `rma-parts-panel.component.html:58` é ação de linha, não rodapé de diálogo; ignorar.

**Interfaces:**
- Produces: `expectCancelBeforePrimary(container: HTMLElement): void` em `frontend/src/app/testing/dialog-actions.ts`. Procura o `.form-actions` do diálogo aberto e falha se o botão cujo `textContent.trim()` é "Cancelar" não vier antes do `.button-primary` (inclui `--danger`) no mesmo bloco; também exige que Cancelar tenha `type="button"` e que o form tenha um único `[type=submit]`, o `.button-primary`. **Não usa globais de teste** (`tsconfig.app.json` inclui `src/**/*.ts` com `types: []`): falha com `throw new Error(...)`.

- [ ] **Step 1: Escrever o helper e um teste que falha**

Criar `dialog-actions.ts` com `expectCancelBeforePrimary`. Em cada spec dos seis componentes, abrir o diálogo por clique ou pelo harness, **sempre seguido de `fixture.detectChanges()`**, e chamar `expectCancelBeforePrimary(fixture.nativeElement)`. Nomes dos testes: `shows Cancelar before the primary action in the form dialog` e, onde existir exclusão, `shows Cancelar before the delete action`. Cobrir: clientes (form e exclusão), produtos (form e exclusão), usuários (form e exclusão), peças (cadastro e movimento), protocolos (form) e execução de protocolo (registrar resultado).

- [ ] **Step 2: Rodar e ver falhar**

Run: `npm --prefix frontend test -- --watch=false`
Expected: os testes novos FAIL com a mensagem do helper nomeando o componente; os demais continuam passando.

- [ ] **Step 3: Inverter a ordem nos seis templates**

Em cada bloco listado em **Files**, mover o `<button ... class="button-secondary">Cancelar</button>` para antes do botão principal. Não alterar classes, `disabled`, `(click)` nem o texto; o botão principal segue `type="submit"` (ou `button-primary--danger` na exclusão).

- [ ] **Step 4: Rodar e ver passar**

Run: `npm --prefix frontend test -- --watch=false`
Expected: PASS em toda a suíte.

- [ ] **Step 5: Commit**

```bash
git add <os templates e specs listados em Files, um a um>
git commit -m "fix: padronizar Cancelar à esquerda nos diálogos (NAV-98)"
```

### Task 2: Rótulos visíveis no login

**Files:**
- Modify: `frontend/src/app/pages/login/login.component.html:12-16` e `:28-31`
- Modify: `frontend/src/app/pages/login/login.component.css:87-110`
- Test: `frontend/src/app/pages/login/login.component.spec.ts`

**Interfaces:** nenhuma dependência de outras tarefas.

- [ ] **Step 1: Escrever o teste que falha**

Em `login.component.spec.ts`, adicionar `shows visible labels for usuário and senha`. Assertions: `label[for="username"]` e `label[for="password"]` existem, têm textos "Usuário" e "Senha", e **não** têm a classe `sr-only`; `#username` mantém `autocomplete="username"` e `#password` mantém `autocomplete="current-password"`.

- [ ] **Step 2: Rodar e ver falhar**

Run: `npm --prefix frontend test -- --watch=false`
Expected: FAIL em `shows visible labels...` (labels ainda com `sr-only`).

- [ ] **Step 3: Implementar**

No template, trocar `sr-only` por `login-label` nos dois `<label>`. Remover o `placeholder` dos dois campos (linhas 19 e 33). No CSS: remover `.login-field input::placeholder` (103-105) e o `.sr-only` local (218-228, já existe um global em `styles.css`); estilizar `.login-label` com cor `#ffffff`, 14/20, peso 600, **sem margem** (o `.login-field` já é grid com `gap: 0.4rem`). O fundo do login é um gradiente azul (`#0b5cab` a `#1599ef`, `login.component.css:11-13`); medir o contraste do rótulo sobre o ponto real do fundo em 320 px e em desktop. **Se ficar abaixo de 4,5:1, parar e pedir decisão de design** (escurecer o fundo atrás do formulário ou usar painel). Não mudar o botão de mostrar/ocultar senha nem o bloco de erro.

- [ ] **Step 4: Rodar e ver passar**

Run: `npm --prefix frontend test -- --watch=false`
Expected: PASS, incluindo os testes existentes de falha de login e validação.

- [ ] **Step 5: Verificar em 320 px e desktop**

Run: `npm --prefix frontend start` e abrir `/login` na largura de 320 px e em desktop.
Expected: dois rótulos visíveis acima dos campos, sem rolagem horizontal, e o botão de mostrar senha alinhado ao campo.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/app/pages/login
git commit -m "fix: exibir rótulos de usuário e senha no login (NAV-98)"
```

### Task 3: Texto de relatórios sem justificativa técnica

**Files:**
- Modify: `frontend/src/app/pages/reports/reports.component.html:142`
- Test: `frontend/src/app/pages/reports/reports.component.spec.ts`

**Interfaces:** nenhuma dependência de outras tarefas.

- [ ] **Step 1: Escrever o teste que falha**

Adicionar `does not expose export implementation details in the report hint`. Há três `.report-hint` no template (linhas 20, 37 e 142); selecionar `:scope > p.report-hint` filho direto de `section.page-surface` (o último), cujo `textContent.trim()` deve ser exatamente `Consulta em tela.`. Afirmar também que o `textContent` da página inteira não contém "PDF", "CSV" nem "documentação". Chamar `respond()` antes, pois o `afterEach` faz `http.verify()` (`reports.component.spec.ts:38,54`).

- [ ] **Step 2: Rodar e ver falhar**

Run: `npm --prefix frontend test -- --watch=false`
Expected: FAIL (texto atual cita PDF, CSV e documentação).

- [ ] **Step 3: Implementar**

Substituir o conteúdo do `<p class="report-hint">` por `Consulta em tela.`. Não criar botão de exportação.

- [ ] **Step 4: Rodar e ver passar**

Run: `npm --prefix frontend test -- --watch=false`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/app/pages/reports
git commit -m "fix: remover justificativa técnica da exportação em relatórios (NAV-98)"
```

### Task 4: Verificação final e atualização do estudo

**Files:**
- Modify: `docs/ux/2026-11-06-estudo-ui-ux.md` (resumo, decisão 7 e "Candidatas à primeira entrega")

**Interfaces:** consome as Tarefas 1 a 3 concluídas.

- [ ] **Step 1: Suíte e build completos**

Run: `npm --prefix frontend test -- --watch=false && npx ng build`
Expected: todos os testes PASS e build sem erro.

- [ ] **Step 2: Conferência manual**

Run: `npm --prefix frontend start`. Abrir e fechar um diálogo de cada módulo da Tarefa 1; submeter um formulário com Enter; abrir `/login` e `/relatorios`.
Expected: Cancelar à esquerda em todos, Enter ainda envia, rótulos visíveis, texto "Consulta em tela.".

- [ ] **Step 3: Atualizar o estudo**

No resumo, marcar a decisão 7 como "entregue no commit `71d51ba`"; em "Candidatas à primeira entrega", riscar o item do shell e registrar os commits das Tarefas 1 a 3. Corrigir também o estudo na linha 85 (fala em ordem inversa nos rodapés) e na linha 414 (aponta `app-shell.component.html:44` como divergência), ambas já resolvidas.

- [ ] **Step 4: Commit**

```bash
git add docs/ux/2026-11-06-estudo-ui-ux.md
git commit -m "docs: registrar entrega da fase 1 no estudo de UI/UX"
```

## Critérios de aceite da fase

1. Todo diálogo de formulário e exclusão mostra Cancelar antes da ação principal; Enter continua enviando o formulário.
2. O login mostra "Usuário" e "Senha" acima dos campos, sem rolagem horizontal em 320 px.
3. Relatórios mostra apenas "Consulta em tela." e nenhum texto sobre formatos ou documentação.
4. `ng test` e `ng build` passam; nenhuma permissão, validação ou rota mudou.

## Próxima fase (fora deste plano)

Piloto do Kanban: card enxuto (decisão 1), prioridade com rótulo curto (decisão 4), cabeçalho curto e filtros (decisão 3). Plano a ser escrito depois de validar a fase 1.
