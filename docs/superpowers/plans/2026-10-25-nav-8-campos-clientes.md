# NAV-8 — Campos de clientes — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` to implement this plan inline, task-by-task. Steps use checkbox syntax for tracking. Do not dispatch subagents for these dependent changes.

**Goal:** Remover o nome do contato de clientes em todas as camadas e concluir os ajustes de campos da NAV-8.

**Architecture:** Alterar o fluxo existente de CRUD, mantendo os endpoints e os padrões Angular/Spring. Remover o campo do contrato e do schema inicial; reaproveitar os validadores, componentes e suítes existentes.

**Tech Stack:** Angular 21, TypeScript, Vitest/happy-dom, Spring Boot 3.2, Java 17, Maven, Flyway, H2 de testes e MySQL no Compose.

**Spec:** [Desenho e decisões confirmadas](../specs/2026-10-25-nav-8-campos-clientes-design.md).

## Global Constraints

- Telefone: 30 caracteres; endereço: 255; razão social: 120, sem contar espaços e traços. Documento mantém limite de 18 e chave `documentNumber`.
- Remover `contactName` de interface, API e entidade e `contact_name` de V1; não criar migration incremental nem apagar volumes.
- Preservar autorização no backend, filtros existentes, alterações de outras issues e eventual paginação da NAV-28 incorporada à main.
- Execução inline, em worktree isolado a partir da main atualizada, branch `fix/NAV-8-campos-clientes`. Usar `superpowers:using-git-worktrees` na execução.
- Os dois documentos de planejamento ainda estão sem commit. Copiá-los para os mesmos caminhos no worktree de execução e incluí-los como documentação da NAV-8, preservando os originais.
- Atualizar a descrição da NAV-8 com os limites e o alcance confirmados, manter o responsável conectado e movê-la para Em andamento antes de editar código.
- Terminar com issue Em Revisão, PR aberto e CI verde. Não fazer merge, homologação, deploy ou conclusão da issue.

## Review Focus

- Cliente sem telefone/e-mail: fallbacks corretos e nenhum nome de contato residual na tela ou na busca.
- POST e PUT: validações de limite efetivas nos dois caminhos, sem gravação parcial após rejeição.
- GET individual e lista: chave de contato ausente; documento, telefone, e-mail e demais campos preservados.
- Payload Angular de edição: sem propriedade obsoleta ou controle invisível de contato.
- Banco vazio e atualização da base: schema sem coluna removida; testes e UI não regridem após eventual integração da NAV-28.

## Task 1 — Contrato e persistência

**Files:** `backend/src/main/java/br/com/navitasassist/client/{Client.java,ClientRequest.java,ClientResponse.java}`, `backend/src/main/java/br/com/navitasassist/service/ClientService.java`, `backend/src/main/resources/db/migration/V1__create_schema.sql`.

**Tests:** `backend/src/test/java/br/com/navitasassist/client/ClientControllerIntegrationTest.java` e `backend/src/test/java/br/com/navitasassist/migration/DatabaseMigrationTest.java`.

**Interfaces:** POST/PUT `/api/clients` e `/api/clients/{id}` consomem `ClientRequest` sem `contactName`; todas as respostas `ClientResponse` deixam de conter essa chave. Demais rotas e campos mantêm o contrato.

- [ ] Acrescentar regressão HTTP: criar, editar, listar e consultar cliente sem contato; verificar ausência real da chave JSON, por exemplo `assertFalse(objectMapper.readTree(responseBody).has("contactName"))`, e preservação de documento, telefone e e-mail. Na lista, verificar cada item. Não usar somente `doesNotExist()`: uma chave presente com valor null também precisa reprovar o teste.
- [ ] Reaproveitar os casos existentes de POST com 120/121 caracteres significativos, telefone 30/31 e endereço 255/256. Acrescentar cobertura equivalente de PUT: limite válido aceito; excesso retorna 400 e conserva os valores persistidos anteriores.
- [ ] Ampliar o teste de V1 com `assertFalse(columnExists(connection, "clients", "contact_name"))`, tamanhos 30 para `phone`, 255 para `address` e 18 para `document_number`.
- [ ] Executar `mvn -B -ntp -Dtest=ClientControllerIntegrationTest,DatabaseMigrationTest test` em `backend`; confirmar que as novas verificações de ausência falham na implementação atual.
- [ ] Remover atributo, componente dos records, acessores e atribuição do serviço; retirar somente a coluna de contato de V1. Não alterar a política Jackson ou as regras de segurança.
- [ ] Repetir os testes focados; exigir saída 0 e ausência de falhas. Usar Maven 3.9.9/Java 17 via Docker se não houver Maven local, conforme o fluxo já utilizado no projeto.

## Task 2 — Interface e contrato TypeScript

**Files:** `frontend/src/app/core/models.ts`, `frontend/src/app/pages/clients/clients.component.{ts,html,spec.ts}`, `frontend/src/app/core/services/catalog.service.spec.ts`.

**Interfaces:** `ClientRequest` e `ClientResponse` TypeScript espelham os records Java sem `contactName`; `CatalogService` mantém métodos e URLs. Trocar `clientsWithContact` por `clientsWithPhone`.

- [ ] Adicionar testes de criação e edição no componente: `expect(payload).not.toHaveProperty('contactName')`, demais campos preservados e nenhum input ou texto de nome de contato no DOM.
- [ ] Cobrir labels CPF/CNPJ, coluna Telefone / e-mail, indicador Com telefone, valores vazios e manutenção dos filtros de documento/e-mail. A busca não deve usar contato legado, mesmo se um fixture representar uma resposta antiga com uma propriedade extra.
- [ ] Cobrir formulário com telefone 30/31, endereço 255/256 e razão social 120/121 caracteres significativos, incluindo espaços e traços. Verificar `maxlength` 30 e 255 no template e manutenção da mensagem de erro da razão social, sem a dica estática.
- [ ] Executar `npm.cmd test -- --watch=false` em `frontend`; verificar falha das novas expectativas de contrato/interface antes da alteração.
- [ ] Remover contato dos tipos, fixtures, união de controles, formulário, reset, carregamento de edição, busca e montagem do payload. Ajustar indicador, coluna e labels conforme a spec. Reaproveitar as validações existentes, sem criar helpers ou controles novos.
- [ ] Atualizar o fixture de transporte de clientes e acrescentar a verificação de PUT, mantendo os caminhos POST/PUT existentes. Repetir a suíte Angular e exigir saída 0.

## Task 3 — Validação e entrega

- [ ] Atualizar a base remota e revisar qualquer integração nova da NAV-28. Se houver conflito, preservar paginação/filtros e aplicar somente a remoção do contato; repetir os testes afetados após a resolução.
- [ ] Executar `mvn -B -ntp verify` em `backend`, com perfil de testes/H2, e confirmar suíte completa e JAR aprovados.
- [ ] Executar sequencialmente em `frontend`: `npm.cmd test -- --watch=false`, `npm.cmd run test:sla`, `npm.cmd run build`. Não rodar teste Angular e build simultaneamente: houve execução local sem progresso nessa condição em trabalho anterior.
- [ ] Validar `docker compose --env-file .env.example config --quiet` e `docker compose --env-file .env.prod.example -f compose.prod.yaml config --quiet` na raiz do repo. Não subir stack nem remover volumes para essa validação.
- [ ] Revisar diff, contrato Java/TypeScript, ausência de campo na UI e schema, segurança e escopo; executar `git diff --check` e verificar a lista de arquivos staged. Nenhum `.env`, credencial ou artefato gerado deve entrar no commit.
- [ ] Criar commit Conventional Commits: `fix(clientes)!: remover contato e ajustar campos (NAV-8)`, com footer `BREAKING CHANGE: remove contactName da API de clientes e contact_name do schema inicial.` Explicar no PR que bancos de desenvolvimento já inicializados precisarão ser recriados conforme o README; não executar essa recriação.
- [ ] Enviar a branch e abrir PR para main com link da NAV-8, resumo, áreas, comandos/resultados e limitações de H2/ausência de MySQL real ou validação manual, quando aplicáveis. Não declarar verificações não executadas como aprovadas.
- [ ] Comentar o PR e validações na NAV-8, movê-la para Em Revisão e acompanhar os checks do último commit. Corrigir falhas causadas pela mudança e aguardar todos os checks aplicáveis aprovarem. Em timeout de escrita no Jira, consultar o estado antes de repetir para evitar comentários duplicados.

## Estado deste documento

Planejamento baseado na main `548ff79`, conferida em 2026-10-25. As decisões de limites e remoção completa foram confirmadas pelo usuário. Nenhuma alteração de implementação, teste executado, commit de implementação ou transição da NAV-8 foi realizada durante o planejamento.
