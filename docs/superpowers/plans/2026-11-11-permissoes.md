# Permissões por perfil personalizado (etapa 8A): plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Trocar o enum `UserRole` por perfis personalizados (nome + permissões de um catálogo fixo) com permissões extras por usuário, sem mudar o que os 4 perfis atuais podem fazer.

**Architecture:**
- O catálogo é o enum `Permission`. Perfis e extras ficam em tabelas novas (Flyway V8–V10, expand/contract; V11 opcional).
- O login concede como authorities os códigos efetivos (perfil ∪ extras), e um filtro os recalcula a cada requisição. `SecurityConfig` passa a usar `hasAuthority`.
- Uma matriz de equivalência com cobertura total, escrita **antes** da troca, prova que nada mudou.
- O frontend ganha `PermissionService`, `permissionGuard` e `authErrorInterceptor`, a tela Perfis, e seletor de perfil e extras em Usuários.

**Tech Stack:** Spring Boot 3.2.5 (Spring Security 6.2.4), JPA/Hibernate, Flyway (MySQL 8.0; H2 `MODE=MySQL` nos testes), Java 17, Maven; Angular 21 (signals, reactive forms), Vitest via `@angular/build:unit-test`.

**Spec:** `docs/superpowers/specs/2026-11-11-permissoes-design.md` ("spec §n"). Revisão incorporada: `docs/superpowers/plans/2026-11-11-permissoes-revisao.md`.

## Global Constraints

- **Catálogo e perfis.** Códigos, rótulos, módulos e permissões dos 4 perfis seguem exatamente a spec §3 (20 permissões; A=19, S=11, T=11, V=5).
  - Permissão → endpoint, rota ou ação: exatamente §3.1 e §3.2.
  - As leituras `GET` de clients, products, parts e protocols continuam `authenticated()` (D2).
  - Perfis migrados: `Administrador`/`ADMIN`, `Atendimento`/`SERVICE_DESK`, `Técnico`/`TECHNICIAN`, `Consulta`/`VIEWER`.
- **Migrations.**
  - Novas: `V8__create_access_profiles.sql`, `V9__notification_recipient_profiles.sql`, `V10__relax_legacy_role_columns.sql` e, opcional, `V11__drop_legacy_role_columns.sql`.
  - Não reaproveite V2/V3/V5 nem edite V1–V7.
  - FKs e índices com os nomes da spec §2.
  - Não use `GROUP_CONCAT` nem id explícito. Cada `MODIFY COLUMN` leva o comentário do equivalente PostgreSQL.
- **Mensagens.** As existentes ficam idênticas, em inglês. As novas são as da spec §4.2 e §4.4, em português.
- **Telas novas** seguem a estrutura e as classes de `pages/users/`: `app-page-header`, `app-custom-select` (`placeholder="Selecione o perfil"`), `.checkbox-field`, `appModalFocus`, `app-pagination`, `empty-state`, `alert-banner`, `modal-feedback` e `appRowAction`.
  - A carga usa o pop-up global, sem texto solto.
  - Opções de perfil e catálogo são carregados uma vez por tela, com `shareReplay`.
- **Testes de integração** que criam usuários ou perfis os apagam no `@AfterEach`, porque o H2 é compartilhado.
- **Commits.** Um por tarefa, em português, com `git add` por caminho, sem trailer `Co-Authored-By` e sem mencionar IA ou agente. Sem push.
- **Comandos de teste** (na raiz do repo, em PowerShell):
  - backend focado: `mvn -B -ntp -f backend/pom.xml test "-Dtest=<Classe>"`;
  - backend completo: `mvn -B -ntp -f backend/pom.xml verify`;
  - frontend: `npm --prefix frontend test -- --watch=false --runner-config 'C:\Users\joseh\AppData\Local\Temp\vitest-runner.config.mjs'`. Para focar, acrescente `--include 'src/app/<caminho>.spec.ts'`, relativo a `frontend/`. Se o builder recusar `--include`, rode a suíte inteira;
  - build: `npm --prefix frontend run build`.

## Conferência em MySQL (usada nas Tasks 3, 8 e 10)

Projeto Docker **isolado**. Nunca use o volume `mysql_data` nem a stack do desenvolvedor.

1. **Primeira vez (Task 3).**
   - Suba o banco isolado com senha que não seja de exemplo (o backend recusa senhas de exemplo fora do profile `local`):
     - `$env:MYSQL_PORT='3317'; $env:MYSQL_PASSWORD='navitas-mig-check'; $env:MYSQL_ROOT_PASSWORD='navitas-mig-root'`;
     - `docker compose -p navitas-mig up -d mysql`.
   - Crie os dados da V7: `git worktree add ..\navitas-v7 ec26e91` e rode esse backend **sem** profile `local` (o `local` usa `ddl-auto: update`) com:
     - `DB_URL=jdbc:mysql://127.0.0.1:3317/navitas_assist?createDatabaseIfNotExist=true&useSSL=false&allowPublicKeyRetrieval=true&serverTimezone=UTC`;
     - `DB_USER=navitas_app`, `DB_PASSWORD=navitas-mig-check`, `SERVER_PORT=8091`.
   - Espere o Flyway aplicar a V7 e pare o backend.
   - Via `docker compose -p navitas-mig exec mysql mysql -unavitas_app -pnavitas-mig-check navitas_assist -e "..."`, insira 4 usuários (um por role, `password_hash` qualquer de 60 caracteres) e rode `UPDATE notification_rules SET recipient_roles = 'ADMIN,VIEWER' WHERE event_type = 'SLA_WARNING'`.
2. **Antes de cada migration nova:**
   - `docker compose -p navitas-mig exec mysql mysqldump -uroot -pnavitas-mig-root navitas_assist > $env:TEMP\navitas-mig\antes-V<versão>.sql` (crie a pasta antes);
   - rode o backend do branch da tarefa com as mesmas variáveis e confira que ele sobe (Flyway aplicado, `validate` ok);
   - rode as consultas da tarefa.
3. **Se falhar,** siga a spec §6 "Falha de migration no MySQL": restaure o dump, ou apague os objetos parciais e faça `DELETE FROM flyway_schema_history WHERE success = 0`. Depois corrija a migration e repita.
4. **Fim da etapa (Task 19):** `docker compose -p navitas-mig down -v` (só esse projeto) e `git worktree remove ..\navitas-v7`.

## Review Focus

1. **Perfil personalizado sem `rma.ver` acessando `/`.** O guard não pode entrar em laço com `/dashboard` e deve cair em `/notificacoes`. Teste: Task 13, `redirects to notifications when no nav route is allowed`.
2. **Administrador único edita o próprio perfil e tira `perfis.gerir`.** A API recusa com a mensagem padrão, e as permissões dele seguem as mesmas na requisição seguinte. Teste: Task 7, `rejectsRemovingAdminPermissionFromLastAdministratorsProfile`.
3. **Permissão retirada de um perfil com usuário logado.** Vale já na próxima requisição desse usuário, sem 401. Teste: Task 5, `profileChangeAppliesOnNextRequestWithoutLogout`. No frontend, o 403 dispara `refreshSession`: Task 12, `refreshes the session on 403`.
4. **Extra igual a uma permissão do perfil.** É guardada sem erro, e o usuário a mantém se o perfil a perder. A tela não reenvia extras já incluídas. Testes: Task 9, `keepsRedundantExtraWhenProfileLosesIt`; Task 17, `sends only extras not in the selected profile`.
5. **Nome duplicado.** Vale com outra caixa ("consulta"), com espaços nas pontas e na corrida que só o índice único pega. Testes: Task 7, `rejectsDuplicateNameIgnoringCase`, `trimsName` e `translatesUniqueViolationToDuplicateMessage`.

---

## Mapa de arquivos

**Backend novo:**
- `backend/src/main/java/br/com/navitasassist/access/`: `Permission.java`, `PermissionModule.java`, `AccessProfile.java`, `ProfileRequest.java`, `ProfileResponse.java`, `ProfileOptionResponse.java`, `ProfileSummary.java`, `PermissionModuleResponse.java`, `PermissionItemResponse.java`, `package-info.java`.
- `repository/AccessProfileRepository.java`.
- `service/`: `EffectivePermissionService.java`, `AdministratorGuard.java`, `PermissionGrantPolicy.java`, `AccessProfileService.java`.
- `auth/`: `EffectiveAuthoritiesFilter.java`, `LoginSessionDetails.java`.
- `controller/`: `ProfileController.java`, `PermissionController.java`.
- `user/CurrentUserResponse.java`.
- Migrations V8–V10 (V11 opcional).
- Testes em `backend/src/test/java/br/com/navitasassist/access/`: `PermissionTest`, `LegacyProfiles`, `AccessTestSupport`, `PermissionEquivalenceIntegrationTest`, `AccessProfileMigrationTest`, `EffectivePermissionServiceTest`, `EffectivePermissionIntegrationTest`, `EffectiveAuthoritiesFilterIntegrationTest`, `AdministratorGuardIntegrationTest`, `ProfileControllerIntegrationTest`.

**Frontend novo:**
- `frontend/src/app/core/`: `permissions.ts` (+ spec), `navigation.ts` (+ spec), `services/permission.service.ts` (+ spec), `services/profile.service.ts` (+ spec), `interceptors/auth-error.interceptor.ts` (+ spec).
- `guards/permission.guard.ts` e `testing/permission-fixtures.ts`.
- `pages/profiles/`: `profiles.component.{ts,html}`, `profiles.component.spec.ts` e `profiles.component.form.spec.ts`.

**Remoções:**
- Backend: `user/UserRole.java` e `notification/UserRoleSetConverter.java`.
- Frontend: `guards/role.guard.ts`; `ROLE_LABELS`, `ROLE_OPTIONS` e `MODULE_CARDS` em `core/mock-data.ts`; `UserRole` e `ModuleCard` em `core/models.ts`; `AuthService.hasAnyRole`.
- Campo provisório `role` das respostas (Task 19).

---

### Task 1: Catálogo de permissões

**Files:**
- Create: `backend/src/main/java/br/com/navitasassist/access/Permission.java`, `PermissionModule.java` e `package-info.java` (siga `user/package-info.java`).
- Test: `backend/src/test/java/br/com/navitasassist/access/PermissionTest.java`.

**Interfaces:**
- Produces: `enum PermissionModule { RMA("RMAs"), CADASTROS("Clientes e produtos"), PECAS("Peças"), PROTOCOLOS("Protocolos técnicos"), RELATORIOS("Relatórios"), ADMINISTRACAO("Administração"); String label(); }`.
- Produces: `enum Permission` com os métodos:
  - `String code()`, `PermissionModule module()` e `String label()`;
  - `static Optional<Permission> fromCode(String)`;
  - `static Set<Permission> fromCodes(Collection<String>)`, que ignora códigos desconhecidos;
  - `static Set<String> codes(Collection<Permission>)`.
- Constantes do enum, na ordem da spec §3: `RMA_VER, RMA_ABRIR, RMA_EDITAR, RMA_STATUS, RMA_RESPONSAVEL, RMA_ATRIBUIVEL, RMA_DIAGNOSTICAR, RMA_IMPEDIMENTOS, CADASTROS_VER, CADASTROS_EDITAR, PECAS_VER, PECAS_MOVIMENTAR, PECAS_RESERVAR, PROTOCOLOS_VER, PROTOCOLOS_EXECUTAR, PROTOCOLOS_CATALOGO, RELATORIOS_VER, USUARIOS_GERIR, PERFIS_GERIR, NOTIFICACOES_REGRAS`.
- Produces: `public static final class Permission.Codes`, com uma constante `String` por código (ex.: `RMA_VER = "rma.ver"`), para uso em `SecurityConfig`. O enum usa essas constantes para não duplicar literais.

- [ ] **Step 1: Write the failing test** `PermissionTest`:
  - `codesMatchSpecCatalogInOrder`: a lista de códigos é igual à lista literal da spec §3, na ordem.
  - `modulesAndLabelsMatchSpec`, com 3 amostras:
    - `rma.atribuivel` → RMA / "Pode ser responsável por RMAs";
    - `pecas.reservar` → PECAS / "Reservar e aplicar peças nos RMAs";
    - `notificacoes.regras` → ADMINISTRACAO / "Configurar regras de notificação";
    - e a ordem de `PermissionModule.values()`.
  - `fromCodesIgnoresUnknown`.
- [ ] **Step 2: Run** `mvn -B -ntp -f backend/pom.xml test "-Dtest=PermissionTest"`. Expected: FAIL (compilação).
- [ ] **Step 3: Implement** os dois enums com os rótulos exatos da spec §3.
- [ ] **Step 4: Run** o mesmo comando. Expected: PASS.
- [ ] **Step 5: Commit**
```bash
git add backend/src/main/java/br/com/navitasassist/access backend/src/test/java/br/com/navitasassist/access/PermissionTest.java
git commit -m "feat(permissoes): catálogo fixo de permissões (etapa 8A)"
```

**Aceite:** os 20 códigos existem com o módulo e o rótulo da spec.

---

### Task 2: Rede de segurança (matriz de equivalência com cobertura total)

**Files:**
- Create: `backend/src/test/java/br/com/navitasassist/access/AccessTestSupport.java`, `LegacyProfiles.java` e `PermissionEquivalenceIntegrationTest.java`.
- Modify: os 20 arquivos de teste com `.roles(` (`grep -rln "\.roles(" backend/src/test/java`).

**Interfaces:**
- Produces: `AccessTestSupport.asProfile(String username, String legacyCode) : RequestPostProcessor`. Nesta tarefa devolve `user(username).roles(legacyCode)`.
- Produces: `AccessTestSupport.saveAccount(UserAccountRepository, PasswordEncoder, String username, String legacyCode) : UserAccount` (ativo, senha `password123`). Nesta tarefa usa `setRole`.
- Produces: `AccessTestSupport.deleteAccounts(UserAccountRepository, String... usernames)`.
- Produces: `LegacyProfiles.PERMISSIONS : Map<String, Set<String>>` (spec §3) e `LegacyProfiles.authorities(String code) : String[]`.

- [ ] **Step 1: Write the test** `PermissionEquivalenceIntegrationTest` (`@SpringBootTest @AutoConfigureMockMvc @ActiveProfiles("test")`).
  - **Usuários:** `@BeforeEach` cria `equiv.admin`, `equiv.desk`, `equiv.tech` e `equiv.viewer` via `saveAccount`; `@AfterEach` os apaga com `deleteAccounts`.
  - **Linha da matriz:** `record Row(HttpMethod method, String pattern, String samplePath, Set<String> allowed, Kind kind)`, com `Kind` ∈ `PUBLIC`, `MAPPED`, `UNMAPPED`.
  - **`enforcesCurrentAccess(Row, String profile)`** (`@ParameterizedTest`):
    - principal: `user(userDetailsService.loadUserByUsername(usernameOf(profile)))`, mais `csrf()`;
    - corpo `"{}"` JSON em POST, PUT e PATCH;
    - se o perfil está em `allowed`, o status não pode ser 401 nem 403; senão, deve ser 403.
  - **`anonymousIsUnauthorized(Row)`** (exceto `PUBLIC`, com `csrf()`): espera 401.
  - **`everyHandlerMappingIsInMatrix`:**
    - percorre `RequestMappingHandlerMapping.getHandlerMethods()` (menos `/error`);
    - para cada par (método, padrão), exige uma linha `MAPPED` ou `PUBLIC` com o mesmo método e padrão, por exemplo `/api/rmas/{id}/status`;
    - falha listando os que faltarem.
  - **Matriz literal:** as 76 linhas abaixo, com id `999999` e corpo inválido, para nunca alterar dados. `POST /api/notifications/read-all` só afeta o próprio usuário de teste.
    - **PUBLIC:** `GET /health`, `GET /api/auth/csrf`, `POST /api/auth/login`.
    - **Todos (autenticado):**
      - `GET /api/auth/me`;
      - clients: `GET /api/clients`, `/options`, `/summary`, `/{id}`;
      - products: `GET /api/products`, `/options`, `/summary`, `/{id}`;
      - kanban-views: `GET /api/kanban-views`, `POST /api/kanban-views`, `PUT /api/kanban-views/{id}`, `PATCH /api/kanban-views/{id}/default`, `DELETE /api/kanban-views/{id}`;
      - notifications: `GET /api/notifications`, `/summary`, `POST /api/notifications/{id}/read`, `POST /api/notifications/read-all`, `POST /api/notifications/{id}/snooze`, `GET /api/notifications/preferences`, `PUT /api/notifications/preferences/{eventType}`;
      - parts: `GET /api/parts`, `/pending`, `/replenishment`, `/{id}`, `/{id}/movements`;
      - protocols: `GET /api/protocols/templates`, `/templates/{id}`, `/rmas/{rmaId}/executions`;
      - rmas: `GET /api/rmas`, `/summary`, `/board`, `/history`, `/{id}`, `/code/{code}`, `GET /api/rmas/{rmaId}/parts`;
      - `GET /api/users/assignable`.
    - **Só A:**
      - `GET /api/notification-rules`, `PUT /api/notification-rules/{eventType}`, `GET /api/notification-rules/failures`;
      - `GET /api/users`, `GET /api/users/summary`, `POST /api/users`, `PUT /api/users/{id}`, `DELETE /api/users/{id}`;
      - `POST /api/protocols/templates`, `PUT /api/protocols/templates/{id}`.
    - **A, T, V:** `GET /api/reports/rmas`.
    - **A, S:**
      - `POST /api/clients`, `PUT /api/clients/{id}`, `DELETE /api/clients/{id}`;
      - `POST /api/products`, `PUT /api/products/{id}`, `DELETE /api/products/{id}`;
      - `POST /api/rmas`, `PUT /api/rmas/{id}`, `PATCH /api/rmas/{id}/assignee`;
      - `POST /api/parts`, `PUT /api/parts/{id}`, `POST /api/parts/{id}/movements`, `POST /api/parts/movements/{movementId}/reversal`.
    - **A, T:**
      - `PUT /api/rmas/{id}/diagnosis`;
      - `POST /api/rmas/{rmaId}/parts`, `POST /api/rmas/{rmaId}/parts/{reservationId}/allocate`, `/consume`, `/cancel`;
      - `POST /api/protocols/rmas/{rmaId}/executions`, `POST /api/protocols/executions/{executionId}/items/{itemId}/results`, `POST /api/protocols/executions/{executionId}/complete`.
    - **A, S, T:** `PATCH /api/rmas/{id}/status`, `PATCH /api/rmas/{id}/bulk-status`, `POST /api/rmas/{id}/blocks`, `PATCH /api/rmas/{id}/blocks/{blockId}`.
    - **UNMAPPED:** `PATCH /api/products` (só A; recebe 405), `DELETE /api/protocols/templates/{id}` (ninguém).
- [ ] **Step 2: Run** `mvn -B -ntp -f backend/pom.xml test "-Dtest=PermissionEquivalenceIntegrationTest"`. Expected: PASS sobre o código atual. Se falhar, corrija a **linha** comparando com `SecurityConfig.java:76-104`. Nunca mude o código.
- [ ] **Step 3: Sweep.**
  - Troque `user(X).roles(Y)` por `asProfile(X, Y)` (regex `user\(([^()]*)\)\.roles\(([^()]*)\)` → `asProfile($1, $2)`), o que cobre 223 ocorrências.
  - A 224ª, em `NotificationIntegrationTest.java:365`, é manual.
  - Acrescente `import static br.com.navitasassist.access.AccessTestSupport.asProfile;`.
- [ ] **Step 4: Run** `mvn -B -ntp -f backend/pom.xml verify`. Expected: tudo PASS, sem mudança de asserções.
- [ ] **Step 5: Commit**
```bash
git add backend/src/test/java
git commit -m "test(permissoes): matriz de equivalência com cobertura total e auxiliares de acesso (etapa 8A)"
```

**Aceite:** a matriz cobre os 76 mapeamentos (o teste de cobertura garante) e está verde sobre o código atual. Nenhum teste chama `.roles(` diretamente, e os usuários de teste são apagados no fim.

---

### Task 3: Modelo de perfis e migração V8 (comportamento idêntico)

**Files:**
- Create: `db/migration/V8__create_access_profiles.sql`, `access/AccessProfile.java`, `repository/AccessProfileRepository.java`; teste `access/AccessProfileMigrationTest.java`.
- Modify:
  - `user/UserAccount.java`: ganha `profile` e `extraPermissions`, e mantém `role`;
  - `service/UserAccountService.java:65-104`: a ponte grava também `profile = findByLegacyCode(role.name())`;
  - `repository/UserAccountRepository.java:21-23`: confira que `findByUsernameIgnoreCaseForUpdate` continua sem join;
  - `AccessTestSupport` e os `setRole(` de teste (`grep -rn "setRole(" backend/src/test/java`, 13 arquivos).

**Interfaces:**
- Produces: `AccessProfile { Long id; String name; String legacyCode; Set<String> permissions; }`, `extends AuditableEntity`.
- Produces: `AccessProfileRepository`:
  - `findByLegacyCode(String)`, `existsByNameIgnoreCase(String)` e `findByNameIgnoreCase(String)`;
  - `findAllByOrderByNameAscIdAsc()`;
  - `@Lock(PESSIMISTIC_WRITE) @Query("select p from AccessProfile p order by p.id") List<AccessProfile> findAllForUpdate()`;
  - `@Lock(PESSIMISTIC_WRITE) findByIdForUpdate(Long)`;
  - `Page<AccessProfile> search(String query, Pageable)`, ordenado por `lower(name), id`.
- Produces: em `UserAccount`, `getProfile()/setProfile` e `getExtraPermissions()/setExtraPermissions` (inicia em `new HashSet<>()`). Os mapeamentos levam `@Fetch(FetchMode.SELECT)` (spec §2).
- Produces: `AccessTestSupport.saveAccount(UserAccountRepository, AccessProfileRepository, PasswordEncoder, String username, String legacyCode)` e `assignProfile(AccessProfileRepository, UserAccount, String legacyCode)`. Gravam `role` e `profile`.

- [ ] **Step 1: Write the failing test** `AccessProfileMigrationTest` (JUnit puro).
  - Helper `migrateTo(url, target)` com `Flyway.configure().dataSource(url, "sa", "").locations("classpath:db/migration").target(target).load().migrate()`, sobre a URL `jdbc:h2:mem:mig_<uuid>;MODE=MySQL;DB_CLOSE_DELAY=-1`.
  - `seedsLegacyProfilesWithExactPermissions`: nomes, permissões iguais a `LegacyProfiles.PERMISSIONS` e totais 19/11/11/5. Os totais são literais do teste, conferidos de forma independente.
  - `mapsEveryUserRoleToItsProfile`: migra até a V7, insere 4 usuários, migra até a V8. Cada `profile_id` corresponde ao role, e inserir sem `profile_id` falha.
- [ ] **Step 2: Run** `mvn -B -ntp -f backend/pom.xml test "-Dtest=AccessProfileMigrationTest"`. Expected: FAIL.
- [ ] **Step 3: Write V8** conforme a spec §6:
  - as tabelas com `fk_access_profile_permissions_profile` e `fk_user_extra_permissions_user`;
  - os 4 perfis e os 20 `INSERT … SELECT`;
  - `ADD COLUMN profile_id` e o `UPDATE … = (SELECT p.id FROM access_profiles p WHERE p.legacy_code = user_accounts.role)`;
  - `MODIFY COLUMN profile_id BIGINT NOT NULL -- PostgreSQL: ALTER COLUMN profile_id SET NOT NULL`;
  - `CREATE INDEX idx_user_accounts_profile ON user_accounts (profile_id)` e `fk_user_accounts_profile`.
- [ ] **Step 4: Run** o teste de migração. Expected: PASS.
- [ ] **Step 5: Implement** a entidade, o repositório, os campos, a ponte e as trocas de `setRole` nos testes.
- [ ] **Step 6: Run** `mvn -B -ntp -f backend/pom.xml verify`. Expected: tudo PASS. As asserções de `UserAdminSafetyIntegrationTest` não mudam; só a forma de gravar o perfil muda.
- [ ] **Step 7: Conferência em MySQL** (seção própria, passo 1, depois o passo 2 com o dump `antes-V8.sql`). Consultas:
  - `SELECT legacy_code, COUNT(*) FROM access_profiles p JOIN access_profile_permissions pp ON pp.profile_id = p.id GROUP BY legacy_code` dá 19/11/11/5;
  - `SELECT u.role, p.legacy_code FROM user_accounts u JOIN access_profiles p ON p.id = u.profile_id` mostra os pares iguais;
  - `SHOW CREATE TABLE user_accounts` mostra `idx_user_accounts_profile` e `fk_user_accounts_profile`.
- [ ] **Step 8: Commit**
```bash
git add backend/src/main/resources/db/migration/V8__create_access_profiles.sql backend/src/main/java/br/com/navitasassist/access/AccessProfile.java backend/src/main/java/br/com/navitasassist/repository/AccessProfileRepository.java backend/src/main/java/br/com/navitasassist/user/UserAccount.java backend/src/main/java/br/com/navitasassist/service/UserAccountService.java backend/src/test/java
git commit -m "feat(permissoes): tabelas de perfis, perfis prontos e vínculo do usuário (etapa 8A)"
```

**Aceite:** a V8 aplica no H2 e no MySQL 8.0 real, e todo usuário tem perfil. API e autorização seguem iguais.

---

### Task 4: Permissão efetiva e autorização por permissão

**Files:**
- Create: `service/EffectivePermissionService.java`; testes `access/EffectivePermissionServiceTest.java` e `access/EffectivePermissionIntegrationTest.java`.
- Modify:
  - `auth/NavitasUserDetailsService.java:26-32`;
  - `config/SecurityConfig.java:75-105`;
  - `service/NotificationVisibilityPolicy.java:15-21`;
  - `service/NotificationService.java`: as 5 chamadas `canView(user.getRole(), …)` viram `canView(user, …)`;
  - `AccessTestSupport.asProfile`.

**Interfaces:**
- Consumes: `Permission.fromCodes`, `Permission.Codes.*` (Task 1); `UserAccount.getProfile()` e `getExtraPermissions()` (Task 3).
- Produces: `@Component EffectivePermissionService` com:
  - `Set<Permission> effectivePermissions(UserAccount)`;
  - `Set<Permission> effectivePermissions(Set<String> profilePermissions, Set<String> extras)`;
  - `boolean has(UserAccount, Permission)` e `boolean isAdministrator(UserAccount)`;
  - `boolean isAdministrator(Set<Permission>)`.
- Produces: `NotificationVisibilityPolicy.canView(UserAccount user, NotificationEventType type)`.
- Produces: `asProfile(username, code)` = `user(username).authorities(LegacyProfiles.authorities(code))`.

- [ ] **Step 1: Write failing tests:**
  - **`EffectivePermissionServiceTest`:** `unionOfProfileAndExtras`, `ignoresUnknownCodes` e `administratorNeedsBothAdminPermissions`.
  - **`EffectivePermissionIntegrationTest`** (usuários e perfis apagados no `@AfterEach`):
    - `viewerWithExtraCanOpenRma`;
    - `customProfileOnlyReports`: perfil só com `relatorios.ver` recebe 200 em `GET /api/reports/rmas`, 403 em `GET /api/rmas` e 200 em `GET /api/clients`, `GET /api/parts` e `GET /api/protocols/templates` (D2);
    - `customProfileWithoutRmaVerSeesNoNotifications`;
    - `authoritiesAreExactlyEffectiveCodes`;
    - `legacyProfilesMatchMigratedSeed`: o seed do banco de teste é igual a `LegacyProfiles.PERMISSIONS`, o que valida os mocks de `asProfile`.
- [ ] **Step 2: Run** `mvn -B -ntp -f backend/pom.xml test "-Dtest=EffectivePermission*"`. Expected: FAIL.
- [ ] **Step 3: Implement.**
  - `SecurityConfig` linha a linha conforme a spec §3.1, mantendo `authenticated()` nos GETs de clients, products, parts e protocols.
  - Catch-all: `.requestMatchers("/api/**").access(AuthorizationManagers.allOf(AuthorityAuthorizationManager.hasAuthority(USUARIOS_GERIR), AuthorityAuthorizationManager.hasAuthority(PERFIS_GERIR)))`. Se a inferência falhar, use `AuthorizationManagers.<RequestAuthorizationContext>allOf(...)`.
- [ ] **Step 4: Run** `mvn -B -ntp -f backend/pom.xml verify`. Expected: PASS. `PermissionEquivalenceIntegrationTest` passa **sem alteração**; se precisar mudar a matriz, pare e reporte.
- [ ] **Step 5: Commit**
```bash
git add backend/src/main/java/br/com/navitasassist/service/EffectivePermissionService.java backend/src/main/java/br/com/navitasassist/auth/NavitasUserDetailsService.java backend/src/main/java/br/com/navitasassist/config/SecurityConfig.java backend/src/main/java/br/com/navitasassist/service/NotificationVisibilityPolicy.java backend/src/main/java/br/com/navitasassist/service/NotificationService.java backend/src/test/java
git commit -m "feat(permissoes): autorização da API por permissão efetiva (etapa 8A)"
```

**Aceite:** não sobra `hasRole`/`hasAnyRole` em `backend/src/main`, e a matriz segue inalterada e verde.

---

### Task 5: Recálculo das permissões a cada requisição

**Files:**
- Create: `auth/EffectiveAuthoritiesFilter.java`, `auth/LoginSessionDetails.java`; teste `access/EffectiveAuthoritiesFilterIntegrationTest.java`.
- Modify:
  - `auth/AuthController.java:47-70`: o login grava o token com `LoginSessionDetails`;
  - `config/SecurityConfig.java:64-75`: `addFilterAfter(effectiveAuthoritiesFilter, SecurityContextHolderFilter.class)`;
  - `service/UserAccountService.java:85-89`: `accessChanged` passa a ser só nome de usuário, `active` ou senha;
  - `auth/SessionRevocationIntegrationTest.java:97-130`;
  - `README.md:330`.

**Interfaces:**
- Consumes: `EffectivePermissionService` (Task 4); `SecurityContextRepository` (bean existente).
- Produces: `record LoginSessionDetails(String remoteAddress) implements Serializable` e `EffectiveAuthoritiesFilter extends OncePerRequestFilter`.
- Regra do filtro: spec §4.1. Só age em `Authentication` com detalhes `LoginSessionDetails`, troca o token só se as authorities mudaram e grava com `saveContext`.

- [ ] **Step 1: Write failing tests** (sessões reais via `/api/auth/login`):
  - `profileChangeAppliesOnNextRequestWithoutLogout`: um Técnico logado faz `PUT /api/rmas/999999/diagnosis` e recebe ≠ 403. O teste tira `rma.diagnosticar` do perfil pelo repositório; a mesma sessão agora recebe 403, sem 401.
  - `grantingPermissionAppliesOnNextRequest`.
  - `mockUsersAreNotRecalculated`: `asProfile("admin", "VIEWER")` continua recebendo 403 em `GET /api/users`, apesar de existir `admin` no banco.
  - `SessionRevocationIntegrationTest`: o caso `"role"` vira `"profile"`. As sessões continuam válidas, com `GET /api/users` 403 e `GET /api/products` 200.
- [ ] **Step 2: Run** `mvn -B -ntp -f backend/pom.xml test "-Dtest=EffectiveAuthoritiesFilterIntegrationTest,SessionRevocationIntegrationTest"`. Expected: FAIL.
- [ ] **Step 3: Implement** o filtro, os detalhes do login e o novo `accessChanged`. No README, a frase da linha 330 passa a dizer que mudar perfil ou extras vale na próxima requisição, e que só nome de usuário, senha, situação ativa ou exclusão encerram sessões.
- [ ] **Step 4: Run** `mvn -B -ntp -f backend/pom.xml verify`. Expected: PASS.
- [ ] **Step 5: Commit**
```bash
git add backend/src/main/java/br/com/navitasassist/auth backend/src/main/java/br/com/navitasassist/config/SecurityConfig.java backend/src/main/java/br/com/navitasassist/service/UserAccountService.java backend/src/test/java README.md
git commit -m "feat(permissoes): permissões recalculadas a cada requisição sem derrubar sessões (etapa 8A)"
```

**Aceite:** mudar o acesso de um usuário logado vale na requisição seguinte, e mudar o perfil não revoga sessões.

---

### Task 6: Proteção do último administrador

**Files:**
- Create: `service/AdministratorGuard.java`; teste `access/AdministratorGuardIntegrationTest.java`.
- Modify:
  - `service/UserAccountService.java:78-120, 161-172`;
  - `repository/UserAccountRepository.java`: acrescenta `@Lock(PESSIMISTIC_WRITE) @Query("select a from UserAccount a where a.active = true order by a.id") List<UserAccount> findAllActiveForUpdate()` e remove `findActiveByRoleForUpdate` e `countByRoleAndActiveTrue`.

**Interfaces:**
- Consumes: `EffectivePermissionService` (Task 4); `AccessProfileRepository.findAllForUpdate()` (Task 3).
- Produces: `@Service AdministratorGuard` com:
  - `void lockAccessGraph()`;
  - `void ensureRemainsAfterUserChange(UserAccount current, AccessProfile newProfile, Set<String> newExtras, boolean newActive)`;
  - `void ensureRemainsAfterUserDeletion(UserAccount current)`;
  - `void ensureRemainsAfterProfileChange(AccessProfile profile, Set<String> newPermissions)`.

  A regra e a mensagem estão na spec §4.3.

- [ ] **Step 1: Write failing tests** `AdministratorGuardIntegrationTest` (dados criados e apagados no `@BeforeEach`/`@AfterEach`):
  - `rejectsDemotingLastAdministrator`, via API ainda com `role`;
  - `rejectsDeactivatingLastAdministrator`;
  - `rejectsRemovingAdminPermissionFromLastAdministratorsProfile`, chamando o guard direto;
  - `extrasCountAsAdministrator`;
  - `inactiveAdministratorDoesNotCount`;
  - `allowsChangeWhenNoAdministratorExists`;
  - `concurrentDemotionsKeepOneAdministrator`, no padrão `CountDownLatch` de `UserAdminSafetyIntegrationTest`.
- [ ] **Step 2: Run** `mvn -B -ntp -f backend/pom.xml test "-Dtest=AdministratorGuardIntegrationTest"`. Expected: FAIL.
- [ ] **Step 3: Implement** e aplique em `update` e `delete`. `getEntityForAdministration` chama `lockAccessGraph()` antes de `findByIdForUpdate`.
- [ ] **Step 4: Run** `mvn -B -ntp -f backend/pom.xml verify`. Expected: PASS, com `UserAdminSafetyIntegrationTest` sem mudança.
- [ ] **Step 5: Commit**
```bash
git add backend/src/main/java/br/com/navitasassist/service/AdministratorGuard.java backend/src/main/java/br/com/navitasassist/service/UserAccountService.java backend/src/main/java/br/com/navitasassist/repository/UserAccountRepository.java backend/src/test/java/br/com/navitasassist/access/AdministratorGuardIntegrationTest.java
git commit -m "feat(permissoes): proteção do último administrador por permissões (etapa 8A)"
```

**Aceite:** nenhuma verificação de administrador depende de `UserRole.ADMIN`.

---

### Task 7: API de perfis, catálogo e regra anti-escalada

**Files:**
- Create:
  - `access/ProfileRequest.java`, `ProfileResponse.java`, `ProfileOptionResponse.java`, `ProfileSummary.java`, `PermissionModuleResponse.java` e `PermissionItemResponse.java`;
  - `service/AccessProfileService.java` e `service/PermissionGrantPolicy.java`;
  - `controller/ProfileController.java` e `controller/PermissionController.java`;
  - teste `access/ProfileControllerIntegrationTest.java`.
- Modify:
  - `config/SecurityConfig.java`: 3 regras novas da spec §3.1, antes do catch-all;
  - `repository/UserAccountRepository.java`: `long countByProfile_Id(Long)`;
  - `PermissionEquivalenceIntegrationTest`: 7 linhas `MAPPED` novas, todas só A: `GET /api/profiles`, `GET /api/profiles/options`, `GET /api/profiles/{id}`, `POST /api/profiles`, `PUT /api/profiles/{id}`, `DELETE /api/profiles/{id}` e `GET /api/permissions`. O teste de cobertura exige essas linhas.

**Interfaces:**
- Consumes: `AdministratorGuard` (Task 6); `EffectivePermissionService` (Task 4).
- Produces os records:
  - `ProfileRequest(@NotBlank @Size(max = 60) String name, @NotNull Set<@NotBlank String> permissions)`;
  - `ProfileResponse(Long id, String name, List<String> permissions, long userCount, Instant createdAt, Instant updatedAt)`;
  - `ProfileOptionResponse(Long id, String name, List<String> permissions)`;
  - `ProfileSummary(Long id, String name)`, com `static from(AccessProfile)`;
  - `PermissionModuleResponse(String module, String label, List<PermissionItemResponse> permissions)` e `PermissionItemResponse(String code, String label)`.
- Produces: `PermissionGrantPolicy.ensureCanGrant(String actorUsername, Set<Permission> granted)`, conforme a spec §4.4.
- Produces: `AccessProfileService` com:
  - `search(String query, Integer page, Integer size)`, `options()` e `get(Long)`;
  - `create(ProfileRequest, String actor)`, `update(Long, ProfileRequest, String actor)` e `delete(Long)`;
  - `AccessProfile getEntity(Long)`, que lança 400 `"Perfil não encontrado: {id}."`.
- Rotas da spec §4.2. O controller passa `Principal.getName()` como ator.

- [ ] **Step 1: Write failing tests** `ProfileControllerIntegrationTest`. Os perfis e usuários criados são apagados no `@AfterEach`. A cobertura:
  - **Listagem e catálogo:** `listsPagedWithUserCount`, `optionsSortedByNameWithPermissions`, `catalogReturnsSixModulesInOrder`.
  - **Criação e validação:** `createsAndTrimsName`/`trimsName`, `rejectsBlankOrLongName`, `rejectsDuplicateNameIgnoringCase`, `translatesUniqueViolationToDuplicateMessage` (simula a corrida, com o repositório lançando `DataIntegrityViolationException` no `saveAndFlush`), `rejectsUnknownPermission`.
  - **Atualização:** `updatePermissionsAppliesToLoggedUsersWithoutLogout`, `rejectsRemovingAdminPermissionFromLastAdministratorsProfile`.
  - **Anti-escalada:** `nonAdminCannotGrantPermissionItLacks` (usuário com só `perfis.gerir` e `rma.ver` tenta criar perfil com `rma.abrir` → 400 `"Você não pode conceder permissões que não possui."`), `nonAdminCanGrantSubsetOfOwnPermissions`.
  - **Exclusão:** `deleteBlockedWhenProfileHasUsers`, `deletesUnusedProfile`.
  - **Concorrência:**
    - `concurrentProfileAndUserReductionsKeepOneAdministrator`: tira `perfis.gerir` do perfil do admin A enquanto rebaixa o admin B; exatamente uma requisição falha;
    - `concurrentLoginAndProfileUpdateDoNotDeadlock`: login e `PUT /api/profiles/{id}` em paralelo, ambos concluem.
- [ ] **Step 2: Run** `mvn -B -ntp -f backend/pom.xml test "-Dtest=ProfileControllerIntegrationTest"`. Expected: FAIL.
- [ ] **Step 3: Implement.** Em `update`:
  1. `lockAccessGraph()`;
  2. trava o alvo;
  3. valida nome e códigos e chama `ensureCanGrant`;
  4. se as permissões mudaram, chama `ensureRemainsAfterProfileChange`;
  5. faz `saveAndFlush`, traduzindo `DataIntegrityViolationException` para a mensagem de nome duplicado.

  Não há revogação de sessões (D8).
- [ ] **Step 4: Run** `mvn -B -ntp -f backend/pom.xml verify`. Expected: PASS.
- [ ] **Step 5: Commit**
```bash
git add backend/src/main/java/br/com/navitasassist/access backend/src/main/java/br/com/navitasassist/service/AccessProfileService.java backend/src/main/java/br/com/navitasassist/service/PermissionGrantPolicy.java backend/src/main/java/br/com/navitasassist/controller/ProfileController.java backend/src/main/java/br/com/navitasassist/controller/PermissionController.java backend/src/main/java/br/com/navitasassist/config/SecurityConfig.java backend/src/main/java/br/com/navitasassist/repository/UserAccountRepository.java backend/src/test/java/br/com/navitasassist/access
git commit -m "feat(permissoes): API de perfis, catálogo e regra anti-escalada (etapa 8A)"
```

**Aceite:** o CRUD segue a spec §4.2, e as regras 4.3 e 4.4 são respeitadas.

---

### Task 8: Regras de notificação por perfil (V9)

**Files:**
- Create: `db/migration/V9__notification_recipient_profiles.sql`.
- Modify:
  - `notification/NotificationRule.java:47-49`, `NotificationRuleRequest.java`, `NotificationRuleResponse.java`;
  - `service/NotificationRuleService.java:44-53` e `service/NotificationDispatcher.java:85-90`;
  - `repository/UserAccountRepository.java`: `findAllByActiveTrueAndProfileInOrderByFullNameAsc(Collection<AccessProfile>)` no lugar de `…RoleIn…`;
  - `notification/NotificationIntegrationTest.java`, os testes que enviam `recipientRoles` e `AccessProfileMigrationTest`.
- Delete: `notification/UserRoleSetConverter.java`.

**Interfaces:**
- Consumes: `AccessProfileService.getEntity(Long)` e `ProfileSummary` (Task 7).
- Produces: `NotificationRule.getRecipientProfiles()`, `NotificationRuleRequest.recipientProfileIds : Set<Long>` e `NotificationRuleResponse.recipientProfiles : List<ProfileSummary>`.

- [ ] **Step 1: Write failing tests:**
  - **`AccessProfileMigrationTest.mapsRuleRolesToProfiles`:** até a V8, mais `UPDATE … recipient_roles = 'ADMIN, VIEWER' WHERE event_type = 'SLA_WARNING'`, depois a V9. Resultado esperado:
    - `RMA_CREATED` → {Administrador, Atendimento};
    - `RMA_ASSIGNED` → {};
    - `SLA_WARNING` → {Administrador, Consulta};
    - `SLA_OVERDUE` → {Administrador, Atendimento};
    - `recipient_roles` continua existindo.
  - **`NotificationIntegrationTest`:** os payloads passam a usar `recipientProfileIds`. Casos novos: `notifiesUsersOfRecipientProfiles`, `rejectsUnknownRecipientProfile` e `deletingProfileRemovesItFromRules`.
- [ ] **Step 2: Run** `mvn -B -ntp -f backend/pom.xml test "-Dtest=AccessProfileMigrationTest,Notification*"`. Expected: FAIL.
- [ ] **Step 3: Implement** a V9 como na spec §6: tabela com `idx_rule_recipient_profiles_profile`, `fk_rule_recipient_profiles_rule` e `fk_rule_recipient_profiles_profile`, e os 4 `INSERT … SELECT` com literal fixo. Depois o mapeamento `@ManyToMany(fetch = EAGER) @JoinTable(name = "notification_rule_recipient_profiles", joinColumns = @JoinColumn(name = "rule_id"), inverseJoinColumns = @JoinColumn(name = "profile_id"))`, o serviço, o dispatcher e os DTOs. `recipient_roles` deixa de ser mapeada.
- [ ] **Step 4: Run** `mvn -B -ntp -f backend/pom.xml verify`. Expected: PASS.
- [ ] **Step 5: Conferência em MySQL** (passo 2, dump `antes-V9.sql`). Consulta `SELECT r.event_type, p.legacy_code FROM notification_rule_recipient_profiles rp JOIN notification_rules r ON r.id = rp.rule_id JOIN access_profiles p ON p.id = rp.profile_id`, com os mesmos pares do teste.
- [ ] **Step 6: Commit**
```bash
git add backend/src/main/resources/db/migration/V9__notification_recipient_profiles.sql backend/src/main/java/br/com/navitasassist/notification backend/src/main/java/br/com/navitasassist/service/NotificationRuleService.java backend/src/main/java/br/com/navitasassist/service/NotificationDispatcher.java backend/src/main/java/br/com/navitasassist/repository/UserAccountRepository.java backend/src/test/java
git commit -m "feat(notificacoes): destinatários das regras por perfil (etapa 8A)"
```

**Aceite:** não sobra `UserRole` no pacote `notification`, e a V9 foi conferida no MySQL.

---

### Task 9: API de usuários por perfil e extras (ponte para `role`)

**Files:**
- Modify:
  - `user/UserAccountRequest.java`, `UserAccountUpdateRequest.java`, `UserAccountResponse.java`;
  - `controller/UserController.java:35-74`: filtro `profileId` e ator via `Principal`;
  - `service/UserAccountService.java` (create, update, search, summarize e assignable);
  - `repository/UserAccountRepository.java`: `search(query, Long profileId, active, pageable)`, `long countDistinctProfiles()` e `List<UserAccount> findAllByActiveTrueOrderByFullNameAsc()`;
  - testes `user/*`, `auth/SessionRevocationIntegrationTest`, `auth/PasswordBoundaryIntegrationTest` e `pagination/PaginationIntegrationTest`.

**Interfaces:**
- Consumes: `AccessProfileService.getEntity`, `ProfileSummary` e `PermissionGrantPolicy` (Task 7); `AdministratorGuard` (Task 6).
- Produces:
  - `UserAccountRequest(username, fullName, password, @NotNull Long profileId, Set<String> extraPermissions, boolean active)`. O `toString` continua com `[REDACTED]`.
  - `UserAccountUpdateRequest`: idem, com senha opcional.
  - `UserAccountResponse(Long id, String username, String fullName, ProfileSummary profile, List<String> extraPermissions, String role /* provisório: legacy_code ou null */, boolean active, Instant createdAt, Instant updatedAt)`.
- Ponte: a entidade ainda grava `role = legacyCode != null ? UserRole.valueOf(legacyCode) : UserRole.VIEWER`, porque a coluna segue NOT NULL até a Task 10.
- Assignable: usuários ativos com `rma.atribuivel` efetiva. Summary conforme spec D13.

- [ ] **Step 1: Write failing tests** (usuários criados são apagados no `@AfterEach`):
  - **`UserControllerIntegrationTest`:**
    - create e update com `profileId` e `extraPermissions`;
    - `rejectsUnknownProfile`, `rejectsUnknownExtraPermission`, `nullExtrasMeansEmpty`;
    - `responseHasProfileExtrasAndProvisionalRole`, `keepsRedundantExtraWhenProfileLosesIt`;
    - `nonAdminCannotGrantPermissionItLacks`: usuário com só `usuarios.gerir` atribui o perfil Atendimento → 400;
    - `nonAdminCanAssignProfileWithinOwnPermissions`;
    - `nonAdminCannotEditUserWithMorePermissions`.
  - **`PaginationIntegrationTest`:** filtro `profileId` (o caso da linha 214 passa a usar o id do Técnico) e `profileId=abc` → 400 (antes era `role=INVALID`, linha 145).
  - **`SessionRevocationIntegrationTest`:** os payloads passam a usar `profileId`. Mudar `extraPermissions` não revoga a sessão e vale na requisição seguinte.
  - **`UserAdminSafetyIntegrationTest`:** os payloads passam a usar `profileId`. Caso novo `rejectsRemovingLastAdministratorsExtras`.
  - **Assignable:** `viewerWithAtribuivelExtraIsAssignable` e `administratorIsNotAssignable`.
- [ ] **Step 2: Run** `mvn -B -ntp -f backend/pom.xml test "-Dtest=User*,Pagination*,SessionRevocation*,PasswordBoundary*"`. Expected: FAIL.
- [ ] **Step 3: Implement.** No create e no update: valida os códigos, depois `ensureCanGrant(ator, permissões do perfil ∪ extras)`, depois o guard. Ajuste os JSONs de teste que enviam `"role"`.
- [ ] **Step 4: Run** `mvn -B -ntp -f backend/pom.xml verify`. Expected: PASS.
- [ ] **Step 5: Commit**
```bash
git add backend/src/main/java backend/src/test/java
git commit -m "feat(usuarios): perfil e permissões extras no cadastro de usuários (etapa 8A)"
```

**Aceite:** a API de usuários segue a spec §4.2, com o `role` provisório na resposta.

---

### Task 10: V10 (colunas legadas nulas) e remoção de `UserRole`

**Files:**
- Create: `db/migration/V10__relax_legacy_role_columns.sql`.
- Modify:
  - `user/UserAccount.java`: remove o campo `role`;
  - `UserAccountResponse.from`: `role` = `profile.getLegacyCode()`;
  - `service/UserAccountService.java`: remove a ponte;
  - `repository/UserAccountRepository.java`: remove os métodos por role restantes, inclusive `findAllByActiveTrueAndRoleNotOrderByFullNameAsc`, `findAllByActiveTrueAndRoleOrderByFullNameAsc` e `countByRole`;
  - `config/EnumPersistenceIntegrationTest.java`: remove `shouldStoreEveryRoleAsItsName` (linhas ~104-112; o `setRole` da linha 55 já virou `assignProfile` na Task 3);
  - `AccessTestSupport` e `AccessProfileMigrationTest`.
- Delete: `user/UserRole.java`.

- [ ] **Step 1: Write failing test** `AccessProfileMigrationTest.relaxesLegacyColumnsAtV10`: depois da V10, inserir em `user_accounts` sem `role` e atualizar `notification_rules` com `recipient_roles = NULL` funcionam, e `ck_user_accounts_role` não existe mais (`INFORMATION_SCHEMA`).
- [ ] **Step 2: Run** `mvn -B -ntp -f backend/pom.xml test "-Dtest=AccessProfileMigrationTest"`. Expected: FAIL.
- [ ] **Step 3: Implement** a V10 (spec §6, com o comentário PostgreSQL em cada `MODIFY COLUMN`) e as remoções.
- [ ] **Step 4: Run** `mvn -B -ntp -f backend/pom.xml verify`. Expected: PASS. `grep -rn "UserRole" backend/src` não encontra nada.
- [ ] **Step 5: Conferência em MySQL** (passo 2, dump `antes-V10.sql`). `SHOW CREATE TABLE user_accounts` e `SHOW CREATE TABLE notification_rules` mostram `role` e `recipient_roles` nulas e sem o CHECK. Um usuário criado pela API (`POST /api/users`, sessão de um admin criado por SQL com hash BCrypt conhecido; opcional) fica com `role` NULL.
- [ ] **Step 6: Commit**
```bash
git add backend/src/main/resources/db/migration/V10__relax_legacy_role_columns.sql backend/src/main/java backend/src/test/java
git commit -m "refactor(permissoes): remove UserRole e torna legadas as colunas de role (etapa 8A)"
```

**Aceite:** `UserRole` não existe no código, e as colunas antigas ficam nulas e sem uso.

---

### Task 11: Login e /me com permissões efetivas

**Files:**
- Create: `user/CurrentUserResponse.java`.
- Modify: `auth/AuthController.java:47-75`, `service/UserAccountService.java:146-149` e `auth/AuthSecurityIntegrationTest.java`.

**Interfaces:**
- Produces: `CurrentUserResponse(Long id, String username, String fullName, ProfileSummary profile, List<String> extraPermissions, List<String> permissions, String role /* provisório */, boolean active, Instant createdAt, Instant updatedAt)` e `UserAccountService.getCurrentUser(String) : CurrentUserResponse`.

- [ ] **Step 1: Write failing tests:**
  - `loginReturnsEffectivePermissions`: um Técnico recebe `$.permissions` igual, em ordem, aos 11 códigos, `$.profile.name == "Técnico"` e `$.role == "TECHNICIAN"` (provisório).
  - `meIncludesExtras`.
  - `meReflectsProfileChangeWithoutLogin`.
- [ ] **Step 2: Run** `mvn -B -ntp -f backend/pom.xml test "-Dtest=AuthSecurityIntegrationTest"`. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `mvn -B -ntp -f backend/pom.xml verify`. Expected: PASS.
- [ ] **Step 5: Commit**
```bash
git add backend/src/main/java/br/com/navitasassist/user/CurrentUserResponse.java backend/src/main/java/br/com/navitasassist/auth/AuthController.java backend/src/main/java/br/com/navitasassist/service/UserAccountService.java backend/src/test/java/br/com/navitasassist/auth/AuthSecurityIntegrationTest.java
git commit -m "feat(auth): login e sessão devolvem as permissões efetivas (etapa 8A)"
```

**Aceite:** o contrato de `/api/auth/me` segue a spec §4.2. O backend da etapa fica completo, exceto pela limpeza do `role` provisório.

---

### Task 12: Permissões no cliente, sessão atualizável e tratamento de 401/403

**Files:**
- Create: `core/permissions.ts` (+ spec), `core/services/permission.service.ts` (+ spec), `core/interceptors/auth-error.interceptor.ts` (+ spec) e `testing/permission-fixtures.ts`.
- Modify:
  - `core/models.ts`: `ProfileRef` e `CurrentUserResponse`; `UserSession` ganha `profileName` e `permissions`; `AuthUserResponse = CurrentUserResponse`. `role?: UserRole` fica opcional nos dois até a Task 19;
  - `core/services/auth.service.ts:77-83` (`toSession` e `refreshSession`);
  - `app.config.ts`: registra o interceptor ao lado de `loadingInterceptor`;
  - `pages/login/login.component.{ts,html}`: aviso de `reason=expired`;
  - specs `core/services/auth.service.spec.ts`, `pages/login/login.component.spec.ts` e `pages/login/login-submissions.spec.ts`. As fixtures `AuthUserResponse` desses arquivos ganham `profile` e `permissions`.

**Interfaces:**
- Produces: `PERMISSIONS`, `type Permission` e `isPermission`.
- Produces: `PermissionService { permissions; hasPermission; hasAll; hasAny }`.
- Produces: `AuthService.refreshSession(): Observable<UserSession | null>`.
- Produces: `authErrorInterceptor: HttpInterceptorFn`, conforme a spec §5.
- Produces: `LEGACY_PROFILE_PERMISSIONS`, `providePermissions(perms)` e `profilePermissions(code)`.

- [ ] **Step 1: Write failing tests:**
  - **`permissions.spec.ts`:** a lista literal da spec §3.
  - **`permission.service.spec.ts`:** vazio, parcial e reação à troca de sessão.
  - **`auth.service.spec.ts`:** `toSession` com `profileName` e sem códigos desconhecidos; `refreshSession` faz uma única chamada a `/api/auth/me` mesmo com duas inscrições simultâneas.
  - **`auth-error.interceptor.spec.ts`:**
    - `redirects to login with expired notice on 401` (`/login?redirectTo=%2Frmas&reason=expired`, sessão zerada);
    - `ignores 401 from login`;
    - `ignores 401 without session`;
    - `refreshes the session on 403` (e repassa o erro);
    - `does not refresh on 403 from /api/auth/*`.
  - **`login.component.spec.ts`:** `shows expired notice` ("Sua sessão expirou. Entre novamente.").
- [ ] **Step 2: Run** com `--include 'src/app/core/**/*.spec.ts'` e `--include 'src/app/pages/login/**/*.spec.ts'`. Expected: FAIL.
- [ ] **Step 3: Implement.** `hasAnyRole` continua até a Task 15.
- [ ] **Step 4: Run** a suíte inteira. Expected: PASS.
- [ ] **Step 5: Commit**
```bash
git add frontend/src/app/core/permissions.ts frontend/src/app/core/permissions.spec.ts frontend/src/app/core/services/permission.service.ts frontend/src/app/core/services/permission.service.spec.ts frontend/src/app/core/interceptors/auth-error.interceptor.ts frontend/src/app/core/interceptors/auth-error.interceptor.spec.ts frontend/src/app/testing/permission-fixtures.ts frontend/src/app/core/models.ts frontend/src/app/core/services/auth.service.ts frontend/src/app/core/services/auth.service.spec.ts frontend/src/app/app.config.ts frontend/src/app/pages/login/login.component.ts frontend/src/app/pages/login/login.component.html frontend/src/app/pages/login/login.component.spec.ts frontend/src/app/pages/login/login-submissions.spec.ts
git commit -m "feat(permissoes): serviço de permissões e tratamento de sessão expirada no frontend (etapa 8A)"
```

**Aceite:**
- `PermissionService` e o interceptor estão testados.
- Sessão expirada leva ao login com aviso.
- 403 atualiza a sessão.

---

### Task 13: Rotas, guard e menus por permissão

**Files:**
- Create: `guards/permission.guard.ts`, `core/navigation.ts` (+ spec).
- Modify:
  - `app.routes.ts:18-97`: `data.permissions` da spec §3.2; `notificacoes` sem guard;
  - `core/mock-data.ts:101-224`: `NAV_GROUPS` com `permissions` e Perfis; remove `MODULE_CARDS`;
  - `core/models.ts`: `NavItem.permissions`; remove `ModuleCard`;
  - `layout/app-shell.component.ts:38-51` (`visibleNavGroups`; `currentRoleLabel` em :48) e `.html:36`;
  - specs `guards/guards.spec.ts`, `app.routes.spec.ts` e `layout/app-shell.component.spec.ts`.
- Delete: `guards/role.guard.ts`.

**Interfaces:**
- Consumes: `PermissionService.hasAll` e `AuthService.restoreSession` (Task 12).
- Produces: `permissionGuard: CanActivateFn`. Espera `restoreSession()` e redireciona para `firstAllowedRoute(permissions)` (spec §5).
- Produces: `firstAllowedRoute(permissions: PermissionService): string`.

- [ ] **Step 1: Write failing tests:**
  - **`guards.spec.ts`:**
    - `allows when all route permissions are held`;
    - `waits for session restore before deciding`;
    - `redirects to the first allowed nav route` (só `pecas.ver` → `/pecas`);
    - `redirects to notifications when no nav route is allowed`.
  - **`navigation.spec.ts`:** ignora itens com `permissions` vazio, e os 4 perfis levam a `/dashboard`.
  - **`app.routes.spec.ts`:** o `data.permissions` exato de cada rota.
  - **`app-shell.component.spec.ts`:** menus dos 4 perfis (A vê Perfis; S vê Clientes e Produtos e não vê Relatórios; T e V sem o grupo Cadastros) e o rodapé com `profileName`.
- [ ] **Step 2: Run** com `--include 'src/app/{guards,layout,core}/**/*.spec.ts'` e `--include 'src/app/app.routes.spec.ts'`. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** a suíte inteira. Expected: PASS.
- [ ] **Step 5: Commit**
```bash
git add frontend/src/app/guards frontend/src/app/core/navigation.ts frontend/src/app/core/navigation.spec.ts frontend/src/app/app.routes.ts frontend/src/app/app.routes.spec.ts frontend/src/app/core/mock-data.ts frontend/src/app/core/models.ts frontend/src/app/layout
git commit -m "feat(permissoes): rotas, guard e menus por permissão (etapa 8A)"
```

**Aceite:** as rotas seguem a spec §3.2, e não há laço de redirecionamento.

---

### Task 14: Ações de RMA, Kanban e dashboard por permissão

**Files:**
- Modify:
  - `pages/rmas/rmas.component.ts:568-574`;
  - `pages/kanban/kanban.component.ts:251-256, 344, 349` e `.html:253-301` (inclusive `[bulkSelectionEnabled]` em `:272`);
  - `shared/kanban-bulk-actions/kanban-bulk-actions.component.ts:33-34,130` e `.html:12`;
  - `pages/dashboard/dashboard.component.ts:173`;
  - specs: `pages/rmas/*.spec.ts`, `pages/kanban/kanban.component.spec.ts`, `kanban.component.states.spec.ts`, `kanban.component.profiles.spec.ts`, `pages/dashboard/*.spec.ts` e `shared/kanban-bulk-actions/kanban-bulk-actions.component.spec.ts`.

**Interfaces:**
- Consumes: `PermissionService`, `providePermissions` e `profilePermissions` (Task 12).
- Produces: `KanbanBulkActionsComponent` com as entradas `canUpdateStatus`, `canUpdatePriority` e `canUpdateAssignee` (`canManage` removida).
- Produces: `KanbanComponent.canUpdatePriority` (`rma.editar`) e `canBulkEdit` (`hasAny` das três), usado em `toggleBulkSelection`, `selectVisibleRmas`, `[bulkSelectionEnabled]` e no bloco `.html:253`.

- [ ] **Step 1: Troca só de mock (oráculo antigo).** Em todas as specs listadas, troque o mock `AuthService.hasAnyRole` por `providePermissions(profilePermissions(code))`, mantendo o perfil simulado e **sem mudar asserções**.
- [ ] **Step 2: Run** com `--include` dessas pastas. Expected: FAIL, porque os componentes ainda chamam `hasAnyRole`.
- [ ] **Step 3: Implement** a injeção de `PermissionService` e os `computed`. Rode de novo: as asserções antigas devem passar.
- [ ] **Step 4: Testes novos:**
  - `kanban.component.profiles.spec.ts`: só `rma.responsavel` → lote visível, com Responsável e sem Status ou Prioridade;
  - `kanban-bulk-actions.component.spec.ts`: `priority action follows canUpdatePriority` e `assignee action follows canUpdateAssignee`.
- [ ] **Step 5: Run** a suíte inteira. Expected: PASS.
- [ ] **Step 6: Commit**
```bash
git add frontend/src/app/pages/rmas frontend/src/app/pages/kanban frontend/src/app/pages/dashboard frontend/src/app/shared/kanban-bulk-actions
git commit -m "feat(permissoes): ações de RMA, Kanban e dashboard por permissão (etapa 8A)"
```

**Aceite:** essas telas não chamam `hasAnyRole`, e as asserções antigas passam sem mudança.

---

### Task 15: Peças, impedimentos, protocolos e notificações por permissão

**Files:**
- Modify:
  - `pages/parts/parts.component.ts:141`;
  - `shared/rma-block-panel/rma-block-panel.component.ts:37`;
  - `shared/rma-parts-panel/rma-parts-panel.component.ts:151`;
  - `shared/rma-protocols/rma-protocols.component.ts:140`;
  - `pages/notifications/notifications.component.ts:288-310`: `isAdmin` vira `canManageRules` = `notificacoes.regras`;
  - `core/services/auth.service.ts`: remove `hasAnyRole`;
  - specs de `pages/parts/`, `shared/rma-block-panel/`, `shared/rma-parts-panel/`, `shared/rma-protocols/`, `pages/notifications/` e `core/services/auth.service.spec.ts`.

- [ ] **Step 1: Troca só de mock**, sem mudar asserções (como na Task 14).
- [ ] **Step 2: Run** com `--include` dessas pastas. Expected: FAIL.
- [ ] **Step 3: Implement** e remova `AuthService.hasAnyRole`. Rode de novo: PASS.
- [ ] **Step 4: Testes novos:** `it.each` dos 4 perfis onde ainda não houver:
  - `parts.canManage`: A, S;
  - `rma-block-panel.canEdit`: A, S, T;
  - `rma-parts-panel.canReserve`: A, T;
  - `rma-protocols.canExecute`: A, T;
  - aba Regras: só A.
- [ ] **Step 5: Run** a suíte inteira. Expected: PASS. `grep -rn "hasAnyRole" frontend/src` não encontra nada.
- [ ] **Step 6: Commit**
```bash
git add frontend/src/app/pages/parts frontend/src/app/shared/rma-block-panel frontend/src/app/shared/rma-parts-panel frontend/src/app/shared/rma-protocols frontend/src/app/pages/notifications frontend/src/app/core/services/auth.service.ts frontend/src/app/core/services/auth.service.spec.ts
git commit -m "feat(permissoes): peças, impedimentos, protocolos e notificações por permissão (etapa 8A)"
```

**Aceite:** toda checagem de tela passa por `PermissionService`.

---

### Task 16: Tela Perfis

**Files:**
- Create: `core/services/profile.service.ts` (+ spec), `pages/profiles/profiles.component.ts`, `profiles.component.html`, `profiles.component.spec.ts` e `profiles.component.form.spec.ts`.
- Modify:
  - `core/models.ts`: `ProfileResponse`, `ProfileOption`, `ProfileRequest`, `PermissionModuleResponse` e `PermissionItem`;
  - `app.routes.ts`: rota `perfis` com `['perfis.gerir']` e título `Perfis | Navitas Assist`;
  - `app.routes.spec.ts`.

**Interfaces:**
- Consumes: as rotas da spec §4.2 (Task 7), `PermissionService` e `AuthService.refreshSession` (Task 12).
- Produces: `ProfileService` com:
  - `list(filters: { query?: string } & PageQuery): Observable<PageResponse<ProfileResponse>>`;
  - `options(): Observable<ProfileOption[]>` e `permissionCatalog(): Observable<PermissionModuleResponse[]>`, ambos com `shareReplay({ bufferSize: 1, refCount: false })` e `invalidateOptions()`;
  - `create`, `update` e `delete`.

- [ ] **Step 1: Write failing tests:**
  - **`profile.service.spec.ts`:** URL, método e params de cada chamada; o catálogo faz uma única requisição em duas inscrições.
  - **`profiles.component.spec.ts`:**
    - `lists profiles with permission and user counts` ("19 de 20");
    - `shows load failure with retry`;
    - `shows empty states with and without search`;
    - `paginates with totals`;
    - `blocks delete when profile has users`;
    - nenhum texto de carregamento no DOM.
  - **`profiles.component.form.spec.ts`:**
    - `groups permissions by module with counters` (6 `fieldset`; "3 de 8" em RMAs);
    - `uses checkbox-field for each permission`;
    - `requires name`;
    - `creates profile with checked permissions`;
    - `edits profile and refreshes own session after save`;
    - `duplicates as "Cópia de X" with same permissions`;
    - `truncates duplicate name to 60 chars`;
    - `shows server error in modal-feedback`;
    - `confirms and deletes`;
    - `loads catalog once per screen` (abrir o modal duas vezes gera 1 requisição);
    - `disables submit when catalog fails`.
- [ ] **Step 2: Run** com `--include 'src/app/{pages/profiles,core/services}/**/*.spec.ts'`. Expected: FAIL.
- [ ] **Step 3: Implement** espelhando `pages/users/` (signals de estado, utilitários de paginação, componentes obrigatórios) e os textos da spec §5.
- [ ] **Step 4: Run** a suíte inteira e o build. Expected: PASS, sem avisos novos.
- [ ] **Step 5: Commit**
```bash
git add frontend/src/app/core/services/profile.service.ts frontend/src/app/core/services/profile.service.spec.ts frontend/src/app/pages/profiles frontend/src/app/core/models.ts frontend/src/app/app.routes.ts frontend/src/app/app.routes.spec.ts
git commit -m "feat(perfis): tela de perfis com permissões por módulo (etapa 8A)"
```

**Aceite:** é possível listar, criar, editar, duplicar e apagar perfis, nos padrões atuais.

---

### Task 17: Tela Usuários com perfil e permissões extras

**Files:**
- Modify:
  - `pages/users/users.component.ts`;
  - `users.component.html:20-28,97,195-214`;
  - `core/services/catalog.service.ts:34-37,102-127`: `UserFilters.role` vira `profileId`;
  - `core/models.ts`: `UserAccountResponse.profile` e `extraPermissions`; os requests passam a usar `profileId` e `extraPermissions`;
  - specs `pages/users/*.spec.ts` e `core/services/catalog.service.spec.ts`.

**Interfaces:**
- Consumes: `ProfileService.options()` e `permissionCatalog()` (Task 16), e `AuthService.refreshSession` (Task 12).

- [ ] **Step 1: Write failing tests:**
  - `requires a profile without default` (`app-custom-select` com `placeholder="Selecione o perfil"`; mensagem "Selecione o perfil.");
  - `marks profile permissions as included and disabled`;
  - `sends only extras not in the selected profile`;
  - `switching profile drops extras now included`;
  - `filters list by profileId`;
  - `shows profile name and extras count`;
  - `disables submit when profile options fail`;
  - `refreshes own session after saving`;
  - `loads options once per screen`;
  - `catalog.service.spec.ts`: param `profileId`.
- [ ] **Step 2: Run** com `--include 'src/app/pages/users/**/*.spec.ts'`. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** a suíte inteira. Expected: PASS.
- [ ] **Step 5: Commit**
```bash
git add frontend/src/app/pages/users frontend/src/app/core/services/catalog.service.ts frontend/src/app/core/services/catalog.service.spec.ts frontend/src/app/core/models.ts
git commit -m "feat(usuarios): seletor de perfil e permissões extras (etapa 8A)"
```

**Aceite:** a tela de Usuários segue a spec §5.

---

### Task 18: Regras de notificação com perfis destinatários

**Files:**
- Modify:
  - `pages/notifications/notifications.component.ts:7,268,283-284,437-490`;
  - `notifications.component.html:312+`;
  - `core/models.ts:364`;
  - `pages/notifications/notifications.component.rules.spec.ts`.

**Interfaces:**
- Consumes: `ProfileService.options()` (Task 16).

- [ ] **Step 1: Write failing tests:**
  - `lists profiles as recipient checkboxes`;
  - `prefills checked profiles from rule`;
  - `submits recipientProfileIds`;
  - `summarizes recipients by profile name plus assignee`;
  - `warns when no recipients`;
  - `shows error when profiles fail to load`.
- [ ] **Step 2: Run** com `--include 'src/app/pages/notifications/**/*.spec.ts'`. Expected: FAIL.
- [ ] **Step 3: Implement.** O grupo `roles` vira `FormControl<number[]>`, e as opções são carregadas uma vez ao abrir a aba Regras.
- [ ] **Step 4: Run** a suíte inteira. Expected: PASS.
- [ ] **Step 5: Commit**
```bash
git add frontend/src/app/pages/notifications frontend/src/app/core/models.ts
git commit -m "feat(notificacoes): regras com perfis destinatários na tela (etapa 8A)"
```

**Aceite:** não sobra uso de `ROLE_OPTIONS` nem de `ROLE_LABELS` em notificações.

---

### Task 19: Limpeza do `role` provisório, README e verificação final

**Files:**
- Modify:
  - Backend:
    - `user/UserAccountResponse.java` e `user/CurrentUserResponse.java`: remove `role`;
    - `auth/AuthSecurityIntegrationTest.java`: `$.role` passa a não existir.
  - Frontend:
    - `core/models.ts`: remove `UserRole` e os `role?`;
    - `core/mock-data.ts`: remove `ROLE_LABELS` e `ROLE_OPTIONS`;
    - specs que ainda os importem.
  - `README.md`:
    - `:69` atribuição, `:81` relatórios, `:95` impedimentos, `:107` lote, `:131` filtro `profileId`, `:346-359` "Autorização da API" e `:503-504` protocolos passam a falar de permissões;
    - `:340` "Contas de acesso": o INSERT do primeiro administrador passa a `INSERT … (…, profile_id) VALUES (…, (SELECT id FROM access_profiles WHERE legacy_code = 'ADMIN'))`;
    - subseção nova "Perfis e permissões", com a tabela da spec §3, o backup obrigatório antes da V8 e o rollback da spec §6.

- [ ] **Step 1: Teste.** Ajuste `loginReturnsEffectivePermissions` para `$.role` não existir. Rode `mvn -B -ntp -f backend/pom.xml test "-Dtest=AuthSecurityIntegrationTest"` → FAIL. Implemente → PASS.
- [ ] **Step 2: Busca.** `grep -rn -E "UserRole|ROLE_LABELS|ROLE_OPTIONS|hasAnyRole|roleGuard" frontend/src backend/src` não encontra nada.
- [ ] **Step 3: Run** `mvn -B -ntp -f backend/pom.xml verify`, a suíte frontend inteira e `npm --prefix frontend run build`. Expected: tudo PASS, sem avisos novos.
- [ ] **Step 4: Encerre a Conferência em MySQL** (passo 4).
- [ ] **Step 5: Commit**
```bash
git add README.md backend/src/main/java/br/com/navitasassist/user backend/src/test/java/br/com/navitasassist/auth/AuthSecurityIntegrationTest.java frontend/src/app
git commit -m "docs(permissoes): README de perfis e permissões; remove resquícios de role (etapa 8A)"
```

**Aceite:** suítes e build verdes, sem resquícios de role, e o README atualizado.

---

### Task 20 (opcional, só depois da conferência do dono do produto): V11 contract

**Files:** Create `db/migration/V11__drop_legacy_role_columns.sql`. Modify `AccessProfileMigrationTest` e `README.md` (o rollback passa a exigir backup).

- [ ] **Step 1:** Teste `dropsLegacyColumnsAtV11`: as colunas `role` e `recipient_roles` não existem mais. Run → FAIL.
- [ ] **Step 2:** `ALTER TABLE user_accounts DROP COLUMN role;` e `ALTER TABLE notification_rules DROP COLUMN recipient_roles;`. Run `mvn -B -ntp -f backend/pom.xml verify` → PASS.
- [ ] **Step 3:** Confira num MySQL isolado recriado a partir do dump `antes-V10.sql`.
- [ ] **Step 4: Commit**
```bash
git add backend/src/main/resources/db/migration/V11__drop_legacy_role_columns.sql backend/src/test/java/br/com/navitasassist/access/AccessProfileMigrationTest.java README.md
git commit -m "refactor(permissoes): remove as colunas legadas de role (etapa 8A)"
```

**Aceite:** as colunas legadas foram removidas, com a autorização explícita do dono.

---

## Self-review (feito)

- **Cobertura da spec:**

  | Spec | Tarefas |
  |:---|:---|
  | §2 | T3, T8, T10 (T20 opcional) |
  | §3 | T1; matriz em T2, T4 e T7 |
  | §3.2 | T13–T15 |
  | §4.1 | T4 e T5 |
  | §4.2 | T7, T9, T11 |
  | §4.3 | T6 (usado em T7 e T9) |
  | §4.4 | T7 e T9 |
  | §5 | T12–T18 |
  | §6 | T3, T8, T10, T20; MySQL real em T3, T8 e T10 |
  | §7 | testes de cada tarefa |
  | R4/R5 | seção "Conferência em MySQL" |

  Os 20 itens da revisão estão aplicados. Itens 1/D3 em §4.4, T7 e T9; 3 nas Global Constraints e em T2; 4 em T12; 5 no `role` provisório de T9/T11/T19; 6 em T13; 7 em §4.1/§4.3 e T7; 8 em T14; 9 em T3, T8 e T10; 10 em T19; 11 em T7; 12 em T9/T10; 13 em §6; 14 em T2, T4, T14 e T15; 15 em T4; 16 em T3; 17 em T12; 18 nas Global Constraints, T16 e T17; 19 em T7; 20 em T8.
- **Consistência de nomes:** os mesmos nomes valem em todas as tarefas: `asProfile`, `saveAccount`, `assignProfile`, `deleteAccounts`, `LegacyProfiles`, `EffectivePermissionService.effectivePermissions`, `LoginSessionDetails`, `EffectiveAuthoritiesFilter`, `AdministratorGuard.*`, `PermissionGrantPolicy.ensureCanGrant`, `AccessProfileService.getEntity`, `ProfileSummary`, `PermissionService.hasPermission/hasAll/hasAny`, `AuthService.refreshSession`, `providePermissions`, `profilePermissions` e `firstAllowedRoute`.
- **Ordem que mantém as suítes verdes a cada commit:**
  - A ponte `role` → `profile` (T3 até T9) permite trocar autorização, guard e APIs antes de remover `UserRole` (T10).
  - O `role` provisório nas respostas (T9 até T19) mantém a leitura do frontend antigo funcionando.
  - `hasAnyRole` só sai em T15, depois que as telas migram.
  - O cadastro de usuários pela tela antiga fica sem funcionar entre T9 e T17, só no branch de desenvolvimento (spec R9).
