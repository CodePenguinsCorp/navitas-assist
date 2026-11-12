# Permissões por perfil personalizado (etapa 8A): plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Trocar o enum `UserRole` por perfis personalizados (nome + permissões de um catálogo fixo) com permissões extras por usuário, sem mudar o que os 4 perfis atuais podem fazer.

**Architecture:** O catálogo é o enum `Permission`. Perfis e extras ficam em tabelas novas (Flyway V8–V10). O login concede como authorities os códigos efetivos (perfil ∪ extras), e `SecurityConfig` passa a `hasAuthority`. Uma matriz de equivalência escrita **antes** da troca prova que nada mudou. O frontend ganha `PermissionService` + `permissionGuard`, a tela Perfis e o seletor de perfil/extras em Usuários.

**Tech Stack:** Spring Boot 3.2.5 (Spring Security 6.2), JPA/Hibernate, Flyway (MySQL 8.0; H2 `MODE=MySQL` nos testes), Java 17, Maven; Angular 21 (signals, reactive forms), Vitest via `@angular/build:unit-test`.

**Spec:** `docs/superpowers/specs/2026-11-11-permissoes-design.md` (as seções citadas como "spec §n").

## Global Constraints

- Catálogo, códigos, rótulos, módulos e permissões dos 4 perfis: exatamente a tabela da spec §3 (20 permissões; A=19, S=11, T=11, V=5).
- Permissão → endpoint/rota/ação: exatamente as tabelas da spec §3.1 e §3.2.
- Perfis migrados: `Administrador`/`ADMIN`, `Atendimento`/`SERVICE_DESK`, `Técnico`/`TECHNICIAN`, `Consulta`/`VIEWER`.
- Migrations novas: `V8__create_access_profiles.sql`, `V9__notification_recipient_profiles.sql` e `V10__drop_user_role.sql`. Não reaproveite V2/V3/V5 e não edite V1–V7.
- Mensagens existentes ficam idênticas, em inglês. As mensagens novas são as da spec §4.2, em português.
- Telas novas seguem `pages/users/` em estrutura e classes: `appModalFocus`, `app-pagination`, `empty-state`, `alert-banner`, `modal-feedback`, `appRowAction`. A carga usa o pop-up global; não há texto solto de carregamento.
- Commits: um por tarefa, em português, `git add` por caminho, sem trailer `Co-Authored-By` e sem mencionar IA/agente. Sem push.
- Teste backend focado (na raiz do repo, PowerShell): `mvn -B -ntp -f backend/pom.xml test "-Dtest=<Classe>"`. Suíte completa: `mvn -B -ntp -f backend/pom.xml verify`.
- Teste frontend: `npm --prefix frontend test -- --watch=false --runner-config 'C:\Users\joseh\AppData\Local\Temp\vitest-runner.config.mjs'`. Para focar num arquivo, acrescente `--include 'src/app/<caminho>.spec.ts'` (relativo a `frontend/`). Se o builder recusar `--include`, rode a suíte inteira.

## Review Focus

1. Um perfil personalizado **sem `rma.ver`** acessando `/`: o guard não pode entrar em laço com `/dashboard` e deve cair em `/notificacoes` (Task 11, teste `redirects to notifications when no nav route is allowed`).
2. **O administrador edita o próprio perfil** e retira `perfis.gerir` sendo o único administrador: a API recusa com a mensagem padrão, e nenhuma sessão é revogada, porque a transação reverte (Task 6, teste `rejectsRemovingAdminPermissionFromLastAdministratorsProfile`).
3. **Extra igual a uma permissão do perfil**: guardada sem erro. Se o perfil a perder depois, o usuário a mantém. A tela Usuários não reenvia extras já incluídas no perfil (Task 8 `keepsRedundantExtraWhenProfileLosesIt`; Task 15 `sends only extras not in the selected profile`).
4. **Código de permissão desconhecido no banco** (ex.: inserido manualmente) não quebra o login e é ignorado (Task 4 `ignoresUnknownCodes`). Na API é recusado (Task 6 `rejectsUnknownPermission`).
5. **Nome de perfil duplicado com outra caixa** ("consulta" vs "Consulta") e nome com espaços nas pontas: recusado ou aparado (Task 6 `rejectsDuplicateNameIgnoringCase`, `trimsName`).

---

## Mapa de arquivos

Backend, código novo:

- `backend/src/main/java/br/com/navitasassist/access/`: `Permission.java`, `PermissionModule.java`, `AccessProfile.java`, `ProfileRequest.java`, `ProfileResponse.java`, `ProfileOptionResponse.java`, `ProfileSummary.java`, `PermissionModuleResponse.java`, `PermissionItemResponse.java`, `package-info.java`.
- `backend/src/main/java/br/com/navitasassist/repository/AccessProfileRepository.java`
- `backend/src/main/java/br/com/navitasassist/service/`: `EffectivePermissionService.java`, `AdministratorGuard.java`, `AccessProfileService.java`.
- `backend/src/main/java/br/com/navitasassist/controller/`: `ProfileController.java`, `PermissionController.java`.
- `backend/src/main/java/br/com/navitasassist/user/CurrentUserResponse.java`
- Migrations `backend/src/main/resources/db/migration/V8…V10`.
- Testes em `backend/src/test/java/br/com/navitasassist/access/`: `PermissionTest`, `LegacyProfiles`, `AccessTestSupport`, `PermissionEquivalenceIntegrationTest`, `AccessProfileMigrationTest`, `EffectivePermissionServiceTest`, `EffectivePermissionIntegrationTest`, `AdministratorGuardIntegrationTest`, `ProfileControllerIntegrationTest`.

Frontend, código novo:

- `frontend/src/app/core/permissions.ts` (+ spec), `core/services/permission.service.ts` (+ spec), `core/services/profile.service.ts` (+ spec), `core/navigation.ts` (+ spec), `guards/permission.guard.ts`, `testing/permission-fixtures.ts`.
- `pages/profiles/profiles.component.{ts,html}` + `profiles.component.spec.ts` e `profiles.component.form.spec.ts`.

Remoções: `user/UserRole.java`, `notification/UserRoleSetConverter.java`, `guards/role.guard.ts`, `ROLE_LABELS`/`ROLE_OPTIONS`/`MODULE_CARDS` em `core/mock-data.ts`, `UserRole`/`ModuleCard` em `core/models.ts`, `AuthService.hasAnyRole`.

---

### Task 1: Catálogo de permissões

**Files:**
- Create: `backend/src/main/java/br/com/navitasassist/access/Permission.java`, `PermissionModule.java`, `package-info.java` (siga `user/package-info.java`)
- Test: `backend/src/test/java/br/com/navitasassist/access/PermissionTest.java`

**Interfaces:**
- Produces: `enum PermissionModule { RMA("RMAs"), CADASTROS("Clientes e produtos"), PECAS("Peças"), PROTOCOLOS("Protocolos técnicos"), RELATORIOS("Relatórios"), ADMINISTRACAO("Administração"); String label(); }`
- Produces: `enum Permission { RMA_VER("rma.ver", RMA, "Ver RMAs, Kanban e dashboard"), … NOTIFICACOES_REGRAS(…); String code(); PermissionModule module(); String label(); static Optional<Permission> fromCode(String); static Set<Permission> fromCodes(Collection<String>) /* ignora desconhecidos */; static Set<String> codes(Collection<Permission>); }`. Constantes nomeadas pelo código: `RMA_VER, RMA_ABRIR, RMA_EDITAR, RMA_STATUS, RMA_RESPONSAVEL, RMA_ATRIBUIVEL, RMA_DIAGNOSTICAR, RMA_IMPEDIMENTOS, CADASTROS_VER, CADASTROS_EDITAR, PECAS_VER, PECAS_MOVIMENTAR, PECAS_RESERVAR, PROTOCOLOS_VER, PROTOCOLOS_EXECUTAR, PROTOCOLOS_CATALOGO, RELATORIOS_VER, USUARIOS_GERIR, PERFIS_GERIR, NOTIFICACOES_REGRAS`.
- Produces: em `Permission`, as constantes `String` públicas para uso em `SecurityConfig`: `public static final class Codes { public static final String RMA_VER = "rma.ver"; … }`, com o mesmo conteúdo. O construtor do enum usa `Codes.*` para não duplicar literais.

- [ ] **Step 1: Write the failing test** `PermissionTest`:
  - `codesMatchSpecCatalogInOrder`: `Arrays.stream(Permission.values()).map(Permission::code).toList()` igual à lista literal dos 20 códigos da spec §3, na ordem.
  - `modulesAndLabelsMatchSpec`: confere módulo e rótulo de 3 amostras (`rma.atribuivel` → RMA/"Pode ser responsável por RMAs"; `pecas.reservar` → PECAS/"Reservar e aplicar peças nos RMAs"; `notificacoes.regras` → ADMINISTRACAO/"Configurar regras de notificação"); `PermissionModule.values()` na ordem RMA, CADASTROS, PECAS, PROTOCOLOS, RELATORIOS, ADMINISTRACAO.
  - `fromCodesIgnoresUnknown`: `fromCodes(List.of("rma.ver", "xpto"))` → `{RMA_VER}`; `fromCode("xpto")` vazio.
- [ ] **Step 2: Run** `mvn -B -ntp -f backend/pom.xml test "-Dtest=PermissionTest"`. Expected: FAIL (compilação, a classe não existe).
- [ ] **Step 3: Implement** os dois enums em `access/`, com os rótulos exatos da spec §3.
- [ ] **Step 4: Run** o mesmo comando. Expected: PASS.
- [ ] **Step 5: Commit**
```bash
git add backend/src/main/java/br/com/navitasassist/access backend/src/test/java/br/com/navitasassist/access/PermissionTest.java
git commit -m "feat(permissoes): catálogo fixo de permissões (etapa 8A)"
```

**Aceite:** os 20 códigos existem com módulo e rótulo da spec, e nada mais muda.

---

### Task 2: Rede de segurança (matriz de equivalência + auxiliares de teste)

**Files:**
- Create: `backend/src/test/java/br/com/navitasassist/access/AccessTestSupport.java`, `LegacyProfiles.java`, `PermissionEquivalenceIntegrationTest.java`
- Modify: os 20 arquivos de teste com `.roles(` (lista: `grep -rln "\.roles(" backend/src/test/java`)

**Interfaces:**
- Produces: `AccessTestSupport.asProfile(String username, String legacyCode) : RequestPostProcessor`. Nesta tarefa devolve `user(username).roles(legacyCode)`; a Task 4 troca a implementação.
- Produces: `AccessTestSupport.saveAccount(UserAccountRepository users, PasswordEncoder encoder, String username, String legacyCode) : UserAccount` (ativo, senha `password123`). Nesta tarefa usa `setRole(UserRole.valueOf(legacyCode))`.
- Produces: `LegacyProfiles.PERMISSIONS : Map<String, Set<String>>`, com chaves `ADMIN`, `SERVICE_DESK`, `TECHNICIAN` e `VIEWER` e os códigos da spec §3. Também `LegacyProfiles.authorities(String code) : String[]`.

- [ ] **Step 1: Write the test** `PermissionEquivalenceIntegrationTest` (`@SpringBootTest @AutoConfigureMockMvc @ActiveProfiles("test")`):
  - `@BeforeAll`/`@BeforeEach` cria (se não existirem) `equiv.admin`, `equiv.desk`, `equiv.tech` e `equiv.viewer` via `saveAccount`.
  - `@ParameterizedTest(name = "{0} {1} as {3}") @MethodSource("matrix")` com `void enforcesCurrentAccess(HttpMethod method, String path, Set<String> allowed, String profile)`. O principal é `user(userDetailsService.loadUserByUsername(usernameOf(profile)))`, mais `csrf()` e corpo `"{}"` JSON em POST/PUT/PATCH. Se `allowed.contains(profile)`, o status não pode ser 401 nem 403; senão, deve ser 403.
  - `@ParameterizedTest @MethodSource("matrix") anonymousIsUnauthorized` (uma vez por linha, com `csrf()` para o filtro de CSRF não responder 403 antes) espera 401.
  - A matriz é literal: uma linha por endpoint da spec §3.1. Use ids `999999` e corpo inválido para nunca alterar dados. Linhas e perfis permitidos:
    - Todos: `GET /api/auth/me`, `GET /api/users/assignable`, `GET /api/kanban-views`, `GET /api/notifications`, `GET /api/clients`, `GET /api/products`, `GET /api/rmas`, `GET /api/rmas/board`, `GET /api/parts`, `GET /api/protocols/templates`.
    - Só A: `GET /api/notification-rules`, `GET /api/notification-rules/failures`, `PUT /api/notification-rules/RMA_CREATED`, `GET /api/users`, `GET /api/users/summary`, `POST /api/users`, `PUT /api/users/999999`, `DELETE /api/users/999999`, `POST /api/protocols/templates`, `PUT /api/protocols/templates/999999`, `PATCH /api/products` (rota não mapeada; A recebe 405).
    - A, T, V: `GET /api/reports/rmas`.
    - A, S: `POST /api/clients`, `POST /api/products`, `POST /api/rmas`, `PUT /api/clients/999999`, `PUT /api/products/999999`, `PUT /api/rmas/999999`, `DELETE /api/clients/999999`, `DELETE /api/products/999999`, `PATCH /api/rmas/999999/assignee`, `POST /api/parts`, `PUT /api/parts/999999`, `POST /api/parts/999999/movements`, `POST /api/parts/movements/999999/reversal`.
    - A, T: `PUT /api/rmas/999999/diagnosis`, `POST /api/rmas/999999/parts`, `POST /api/rmas/999999/parts/999999/allocate`, `POST /api/protocols/rmas/999999/executions`, `POST /api/protocols/executions/999999/items/999999/results`, `POST /api/protocols/executions/999999/complete`.
    - A, S, T: `PATCH /api/rmas/999999/status`, `PATCH /api/rmas/999999/bulk-status`, `POST /api/rmas/999999/blocks`, `PATCH /api/rmas/999999/blocks/999999`.
    - Ninguém: `DELETE /api/protocols/templates/999999`.
  - `POST /api/auth/logout` fica fora da matriz, porque invalida a sessão e já é coberto por `AuthSecurityIntegrationTest`.
- [ ] **Step 2: Run** `mvn -B -ntp -f backend/pom.xml test "-Dtest=PermissionEquivalenceIntegrationTest"`. Expected: PASS sobre o código atual. Se alguma linha falhar, a matriz está errada: corrija a linha comparando com `SecurityConfig.java:76-104`, nunca o código.
- [ ] **Step 3: Sweep** em todos os testes: `user(X).roles(Y)` → `asProfile(X, Y)` (regex `user\(([^()]*)\)\.roles\(([^()]*)\)` → `asProfile($1, $2)`, mais o caso manual `NotificationIntegrationTest.java:365`). Adicione `import static br.com.navitasassist.access.AccessTestSupport.asProfile;` e remova imports de `user` que ficarem sem uso.
- [ ] **Step 4: Run** `mvn -B -ntp -f backend/pom.xml verify`. Expected: tudo PASS, com o mesmo número de testes de antes mais os novos.
- [ ] **Step 5: Commit**
```bash
git add backend/src/test/java
git commit -m "test(permissoes): matriz de equivalência dos perfis atuais e auxiliares de acesso (etapa 8A)"
```

**Aceite:** a matriz cobre todas as linhas da spec §3.1 e está verde sobre o código atual. Nenhum teste chama `.roles(` diretamente.

---

### Task 3: Modelo de perfis e migração V8 (comportamento idêntico)

**Files:**
- Create: `backend/src/main/resources/db/migration/V8__create_access_profiles.sql`, `access/AccessProfile.java`, `repository/AccessProfileRepository.java`, test `access/AccessProfileMigrationTest.java`
- Modify: `user/UserAccount.java` (ganha `profile`, `extraPermissions`; mantém `role` por enquanto), `service/UserAccountService.java:65-104` (ao gravar `role`, grava também `profile = findByLegacyCode(role.name())`), `AccessTestSupport.saveAccount`, e os `setRole(` de testes: `grep -rn "setRole(" backend/src/test/java` (13 arquivos)

**Interfaces:**
- Produces: `AccessProfile { Long id; String name; String legacyCode; Set<String> permissions; }` (Lombok `@Getter @Setter @NoArgsConstructor`, `extends AuditableEntity`).
- Produces: `AccessProfileRepository extends JpaRepository<AccessProfile, Long>`: `Optional<AccessProfile> findByLegacyCode(String)`, `boolean existsByNameIgnoreCase(String)`, `Optional<AccessProfile> findByNameIgnoreCase(String)`, `List<AccessProfile> findAllByOrderByNameAscIdAsc()`, `@Lock(PESSIMISTIC_WRITE) @Query("select p from AccessProfile p order by p.id") List<AccessProfile> findAllForUpdate()`, `@Lock(PESSIMISTIC_WRITE) Optional<AccessProfile> findByIdForUpdate(Long)`, `Page<AccessProfile> search(String query, Pageable)` (`:query is null or lower(name) like …`, ordem `lower(name), id`).
- Produces: `UserAccount.getProfile()/setProfile(AccessProfile)`, `getExtraPermissions()/setExtraPermissions(Set<String>)` (inicial `new HashSet<>()`).
- Produces: `AccessTestSupport.saveAccount(UserAccountRepository, AccessProfileRepository, PasswordEncoder, String username, String legacyCode)` e `AccessTestSupport.assignProfile(AccessProfileRepository, UserAccount, String legacyCode)`. Grava `role` **e** `profile`.

- [ ] **Step 1: Write the failing test** `AccessProfileMigrationTest` (JUnit puro, sem Spring):
  - helper `migrateTo(String url, String target)` com `Flyway.configure().dataSource(url, "sa", "").locations("classpath:db/migration").target(target).load().migrate()`;
  - URL `jdbc:h2:mem:mig_<uuid>;MODE=MySQL;DB_CLOSE_DELAY=-1`;
  - `@Test seedsLegacyProfilesWithExactPermissions`: depois de `migrateTo(url, "8")`, para cada `legacy_code`, o nome é o da spec, e o conjunto de `access_profile_permissions` é igual a `LegacyProfiles.PERMISSIONS.get(code)`;
  - `@Test mapsEveryUserRoleToItsProfile`: `migrateTo(url, "7")`, insere 4 usuários (um por role, colunas `username, full_name, password_hash, role, active, created_at, updated_at`), `migrateTo(url, "8")`, e então o `profile_id` de cada um aponta para o perfil de `legacy_code = role`, a coluna é NOT NULL (inserção sem `profile_id` falha) e não existe extra.
- [ ] **Step 2: Run** `mvn -B -ntp -f backend/pom.xml test "-Dtest=AccessProfileMigrationTest"`. Expected: FAIL (a V8 não existe).
- [ ] **Step 3: Write V8** exatamente como na spec §6:
  - `CREATE TABLE` das 3 tabelas da spec §2;
  - `INSERT INTO access_profiles (name, legacy_code, created_at, updated_at, created_by, updated_by) VALUES ('Administrador','ADMIN',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP,'system','system'), …`;
  - 20 `INSERT INTO access_profile_permissions (profile_id, permission) SELECT id, '<código>' FROM access_profiles WHERE legacy_code IN (…)`, um por linha da tabela §3;
  - `ALTER TABLE user_accounts ADD COLUMN profile_id BIGINT;`;
  - `UPDATE user_accounts SET profile_id = (SELECT p.id FROM access_profiles p WHERE p.legacy_code = user_accounts.role);`;
  - `ALTER TABLE user_accounts MODIFY COLUMN profile_id BIGINT NOT NULL;`;
  - `ALTER TABLE user_accounts ADD CONSTRAINT fk_user_accounts_profile FOREIGN KEY (profile_id) REFERENCES access_profiles (id);`.
- [ ] **Step 4: Run** o teste de migração. Expected: PASS.
- [ ] **Step 5: Implement** a entidade, o repositório e os campos de `UserAccount`: `@ManyToOne(optional = false, fetch = EAGER) @JoinColumn(name = "profile_id")`; as coleções `@ElementCollection(fetch = EAGER)` com `@CollectionTable`/`@Column(name = "permission", length = 60)`. Inclua a ponte em `UserAccountService.create/update`. Troque os `setRole(...)` de teste por `assignProfile(profiles, account, "<CODE>")` e as chamadas de `saveAccount`.
- [ ] **Step 6: Run** `mvn -B -ntp -f backend/pom.xml verify`. Expected: tudo PASS (`ddl-auto: validate` aceita o mapeamento; a matriz continua verde).
- [ ] **Step 7: Commit**
```bash
git add backend/src/main/resources/db/migration/V8__create_access_profiles.sql backend/src/main/java/br/com/navitasassist/access/AccessProfile.java backend/src/main/java/br/com/navitasassist/repository/AccessProfileRepository.java backend/src/main/java/br/com/navitasassist/user/UserAccount.java backend/src/main/java/br/com/navitasassist/service/UserAccountService.java backend/src/test/java
git commit -m "feat(permissoes): tabelas de perfis, perfis prontos e vínculo do usuário (etapa 8A)"
```

**Aceite:** a V8 aplica no H2 e todo usuário tem perfil. API e autorização seguem iguais: a suíte e a matriz continuam verdes.

---

### Task 4: Permissão efetiva e autorização por permissão

**Files:**
- Create: `service/EffectivePermissionService.java`; tests `access/EffectivePermissionServiceTest.java`, `access/EffectivePermissionIntegrationTest.java`
- Modify: `auth/NavitasUserDetailsService.java:26-32`, `config/SecurityConfig.java:75-105`, `service/NotificationVisibilityPolicy.java:15-21`, `service/NotificationService.java` (5 chamadas `canView(user.getRole(), …)` → `canView(user, …)`), `AccessTestSupport.asProfile`

**Interfaces:**
- Consumes: `Permission.fromCodes`, `Permission.Codes.*` (Task 1); `UserAccount.getProfile()`/`getExtraPermissions()` (Task 3).
- Produces: `@Component EffectivePermissionService { Set<Permission> effectivePermissions(UserAccount); boolean has(UserAccount, Permission); boolean isAdministrator(UserAccount); Set<Permission> effectivePermissions(Set<String> profilePermissions, Set<String> extras); }`. A sobrecarga por conjuntos serve ao guard (Task 5).
- Produces: `NotificationVisibilityPolicy.canView(UserAccount user, NotificationEventType type)`: `user != null && type != null && has(user, RMA_VER)`. `canReceive` mantém a assinatura.
- Produces: `asProfile(username, code)` = `user(username).authorities(LegacyProfiles.authorities(code))` (`SimpleGrantedAuthority`).

- [ ] **Step 1: Write failing tests:**
  - `EffectivePermissionServiceTest` (unidade, objetos em memória): `unionOfProfileAndExtras` (perfil {rma.ver}, extras {rma.abrir} → ambos); `ignoresUnknownCodes` (perfil {"rma.ver","xpto"} → {RMA_VER}); `administratorNeedsBothAdminPermissions` (só `usuarios.gerir` → false; as duas, sendo uma por extra → true).
  - `EffectivePermissionIntegrationTest` (Spring, usuários reais via `loadUserByUsername`):
    - `viewerWithExtraCanOpenRma`: Consulta + extra `rma.abrir` → `POST /api/rmas` `{}` ≠ 403.
    - `customProfileOnlyReports`: perfil criado no teste só com `relatorios.ver` → `GET /api/reports/rmas` 200, `GET /api/rmas` 403.
    - `customProfileWithoutRmaVerSeesNoNotifications`: o perfil acima recebe `GET /api/notifications` 200 com lista vazia, mesmo com notificação gravada para ele.
    - `authoritiesAreExactlyEffectiveCodes`: `loadUserByUsername` de um Técnico devolve as 11 authorities de `LegacyProfiles` e nenhuma `ROLE_*`.
- [ ] **Step 2: Run** `mvn -B -ntp -f backend/pom.xml test "-Dtest=EffectivePermission*"`. Expected: FAIL.
- [ ] **Step 3: Implement** o serviço, `NavitasUserDetailsService` (`.authorities(codes…)` no lugar de `.roles(...)`), a política de visibilidade e o `SecurityConfig` linha a linha conforme a spec §3.1, com `hasAuthority(Permission.Codes.X)`/`hasAnyAuthority`. O catch-all fica `.requestMatchers("/api/**").access(AuthorizationManagers.allOf(AuthorityAuthorizationManager.hasAuthority(USUARIOS_GERIR), AuthorityAuthorizationManager.hasAuthority(PERFIS_GERIR)))`. Se `AuthorizationManagers.allOf` não existir na 6.2, use `new WebExpressionAuthorizationManager("hasAuthority('usuarios.gerir') and hasAuthority('perfis.gerir')")`. Troque `asProfile`.
- [ ] **Step 4: Run** `mvn -B -ntp -f backend/pom.xml verify`. Expected: tudo PASS. `PermissionEquivalenceIntegrationTest` passa **sem nenhuma alteração**; se precisar mudar a matriz, pare e reporte.
- [ ] **Step 5: Commit**
```bash
git add backend/src/main/java/br/com/navitasassist/service/EffectivePermissionService.java backend/src/main/java/br/com/navitasassist/auth/NavitasUserDetailsService.java backend/src/main/java/br/com/navitasassist/config/SecurityConfig.java backend/src/main/java/br/com/navitasassist/service/NotificationVisibilityPolicy.java backend/src/main/java/br/com/navitasassist/service/NotificationService.java backend/src/test/java
git commit -m "feat(permissoes): autorização da API por permissão efetiva (etapa 8A)"
```

**Aceite:** nenhuma ocorrência de `hasRole`/`hasAnyRole` em `backend/src/main`. A matriz não foi alterada e está verde.

---

### Task 5: Proteção do último administrador

**Files:**
- Create: `service/AdministratorGuard.java`; test `access/AdministratorGuardIntegrationTest.java`
- Modify: `service/UserAccountService.java:78-120, 161-172` (usa o guard; remove `validateAdministratorRemoval` e o lock por role), `repository/UserAccountRepository.java` (adiciona `@Lock(PESSIMISTIC_WRITE) @Query("select a from UserAccount a where a.active = true order by a.id") List<UserAccount> findAllActiveForUpdate()`)

**Interfaces:**
- Consumes: `EffectivePermissionService.effectivePermissions(Set<String>, Set<String>)`; `AccessProfileRepository.findAllForUpdate()`.
- Produces: `@Service AdministratorGuard { void lockAccessGraph(); void ensureRemainsAfterUserChange(UserAccount current, AccessProfile newProfile, Set<String> newExtras, boolean newActive); void ensureRemainsAfterUserDeletion(UserAccount current); void ensureRemainsAfterProfileChange(AccessProfile profile, Set<String> newPermissions); }`. A regra está na spec §4.3, com a mensagem `"At least one active administrator must remain."`. `lockAccessGraph` trava os perfis, depois os usuários ativos.

- [ ] **Step 1: Write failing tests** `AdministratorGuardIntegrationTest`. Os dados são preparados pelos repositórios; o guard é chamado direto ou via API de usuários (que nesta fase ainda recebe `role`):
  - `rejectsDemotingLastAdministrator` (PUT `/api/users/{id}` `role: VIEWER` → 400 com a mensagem);
  - `rejectsDeactivatingLastAdministrator`;
  - `rejectsRemovingAdminPermissionFromLastAdministratorsProfile` (`ensureRemainsAfterProfileChange(admin, perms sem perfis.gerir)` lança);
  - `extrasCountAsAdministrator` (Consulta + extras `usuarios.gerir`,`perfis.gerir`; rebaixar o admin original passa);
  - `inactiveAdministratorDoesNotCount`;
  - `allowsChangeWhenNoAdministratorExists` (nenhum admin ativo antes → a mudança passa);
  - `concurrentDemotionsKeepOneAdministrator` (duas threads com `CountDownLatch` rebaixam dois admins; exatamente uma requisição falha, como no padrão de `UserAdminSafetyIntegrationTest`).
- [ ] **Step 2: Run** `mvn -B -ntp -f backend/pom.xml test "-Dtest=AdministratorGuardIntegrationTest"`. Expected: FAIL.
- [ ] **Step 3: Implement** o guard e use-o em `UserAccountService.update` (o novo perfil vem da ponte `findByLegacyCode(request.role())`) e em `delete`. `getEntityForAdministration` chama `lockAccessGraph()` antes de `findByIdForUpdate`. Remova `findActiveByRoleForUpdate` e `countByRoleAndActiveTrue` do repositório se ficarem sem uso.
- [ ] **Step 4: Run** `mvn -B -ntp -f backend/pom.xml verify`. Expected: PASS, inclusive `UserAdminSafetyIntegrationTest` sem mudança.
- [ ] **Step 5: Commit**
```bash
git add backend/src/main/java/br/com/navitasassist/service/AdministratorGuard.java backend/src/main/java/br/com/navitasassist/service/UserAccountService.java backend/src/main/java/br/com/navitasassist/repository/UserAccountRepository.java backend/src/test/java/br/com/navitasassist/access/AdministratorGuardIntegrationTest.java
git commit -m "feat(permissoes): proteção do último administrador por permissões (etapa 8A)"
```

**Aceite:** nenhuma verificação de administrador depende de `UserRole.ADMIN`.

---

### Task 6: API de perfis e catálogo

**Files:**
- Create: `access/ProfileRequest.java`, `ProfileResponse.java`, `ProfileOptionResponse.java`, `ProfileSummary.java`, `PermissionModuleResponse.java`, `PermissionItemResponse.java`; `service/AccessProfileService.java`; `controller/ProfileController.java`, `controller/PermissionController.java`; test `access/ProfileControllerIntegrationTest.java`
- Modify: `config/SecurityConfig.java` (3 regras novas da spec §3.1, antes do catch-all), `repository/UserAccountRepository.java` (`long countByProfile_Id(Long)`, `List<UserAccount> findAllByProfile_Id(Long)`), `PermissionEquivalenceIntegrationTest` (linhas novas: `GET /api/profiles`, `POST /api/profiles`, `PUT /api/profiles/999999`, `DELETE /api/profiles/999999`, `GET /api/permissions`, `GET /api/profiles/options`, todas só A)

**Interfaces:**
- Consumes: `AdministratorGuard.lockAccessGraph/ensureRemainsAfterProfileChange` (Task 5); `AccountSessionRevoker.AccessChanged(Long userId)` (existente).
- Produces: records `ProfileRequest(@NotBlank @Size(max = 60) String name, @NotNull Set<@NotBlank String> permissions)`, `ProfileResponse(Long id, String name, List<String> permissions, long userCount, Instant createdAt, Instant updatedAt)`, `ProfileOptionResponse(Long id, String name, List<String> permissions)`, `ProfileSummary(Long id, String name)` com `static from(AccessProfile)`, `PermissionModuleResponse(String module, String label, List<PermissionItemResponse> permissions)`, `PermissionItemResponse(String code, String label)`.
- Produces: `AccessProfileService { PageResponse<ProfileResponse> search(String query, Integer page, Integer size); List<ProfileOptionResponse> options(); ProfileResponse get(Long id); ProfileResponse create(ProfileRequest); ProfileResponse update(Long id, ProfileRequest); void delete(Long id); AccessProfile getEntity(Long id) /* 400 "Perfil não encontrado: {id}." */; }`. As listas vêm na ordem do catálogo.
- Produces: rotas da spec §4.2 (`/api/profiles`, `/api/profiles/options`, `/api/profiles/{id}`, `/api/permissions`).

- [ ] **Step 1: Write failing tests** `ProfileControllerIntegrationTest` (principal admin via `asProfile("admin","ADMIN")`; sessões reais para revogação, padrão de `SessionRevocationIntegrationTest`):
  - `listsPagedWithUserCount` (`totalElements`, `userCount` do Administrador ≥ 1, ordem por nome);
  - `optionsSortedByNameWithPermissions`;
  - `catalogReturnsSixModulesInOrder` (`$[0].module == "RMA"`, `$[0].permissions[0].code == "rma.ver"`, total 20);
  - `createsAndTrimsName` / `trimsName` (`"  Qualidade  "` → `"Qualidade"`, 201);
  - `rejectsBlankOrLongName` (400);
  - `rejectsDuplicateNameIgnoringCase` (`"consulta"` → 400 `"Já existe um perfil com o nome consulta."`);
  - `rejectsUnknownPermission` (400 `"Permissão desconhecida: xpto."`);
  - `updatePermissionsRevokesSessionsOfItsUsers` (usuário logado com o perfil → próxima requisição 401);
  - `renameDoesNotRevokeSessions`;
  - `rejectsRemovingAdminPermissionFromLastAdministratorsProfile` (400 com a mensagem; a sessão do admin continua válida);
  - `deleteBlockedWhenProfileHasUsers` (400 `"Perfil possui usuários vinculados e não pode ser excluído."`);
  - `deletesUnusedProfile` (204, depois GET 404).
- [ ] **Step 2: Run** `mvn -B -ntp -f backend/pom.xml test "-Dtest=ProfileControllerIntegrationTest"`. Expected: FAIL.
- [ ] **Step 3: Implement** o serviço e os controllers (POST 201, DELETE 204, como em `ClientController`). Em `update`:
  1. `lockAccessGraph()`;
  2. trava o alvo;
  3. valida nome e códigos;
  4. se as permissões mudaram, `ensureRemainsAfterProfileChange` e um `AccessChanged` por usuário do perfil (`findAllByProfile_Id`).
- [ ] **Step 4: Run** `mvn -B -ntp -f backend/pom.xml verify`. Expected: PASS (matriz com as linhas novas).
- [ ] **Step 5: Commit**
```bash
git add backend/src/main/java/br/com/navitasassist/access backend/src/main/java/br/com/navitasassist/service/AccessProfileService.java backend/src/main/java/br/com/navitasassist/controller/ProfileController.java backend/src/main/java/br/com/navitasassist/controller/PermissionController.java backend/src/main/java/br/com/navitasassist/config/SecurityConfig.java backend/src/main/java/br/com/navitasassist/repository/UserAccountRepository.java backend/src/test/java/br/com/navitasassist/access
git commit -m "feat(permissoes): API de perfis e catálogo de permissões (etapa 8A)"
```

**Aceite:** o CRUD segue a spec §4.2. A edição de permissões revoga sessões e respeita o guard.

---

### Task 7: Regras de notificação por perfil (V9)

**Files:**
- Create: `db/migration/V9__notification_recipient_profiles.sql`
- Modify: `notification/NotificationRule.java:47-49`, `NotificationRuleRequest.java`, `NotificationRuleResponse.java`, `service/NotificationRuleService.java:44-53`, `service/NotificationDispatcher.java:85-90`, `repository/UserAccountRepository.java` (troca `findAllByActiveTrueAndRoleInOrderByFullNameAsc` por `List<UserAccount> findAllByActiveTrueAndProfileInOrderByFullNameAsc(Collection<AccessProfile>)`), testes `notification/NotificationIntegrationTest.java` e os que enviam `recipientRoles`, `AccessProfileMigrationTest`
- Delete: `notification/UserRoleSetConverter.java`

**Interfaces:**
- Consumes: `AccessProfileService.getEntity(Long)`, `ProfileSummary.from` (Task 6).
- Produces: `NotificationRule.getRecipientProfiles() : Set<AccessProfile>`; `NotificationRuleRequest(…, @NotNull Set<@NotNull Long> recipientProfileIds, …)`; `NotificationRuleResponse(…, List<ProfileSummary> recipientProfiles, …)`, ordenado por nome.

- [ ] **Step 1: Write failing tests:**
  - `AccessProfileMigrationTest.mapsRuleRolesToProfiles`: até V8 + `UPDATE notification_rules SET recipient_roles = 'ADMIN, VIEWER' WHERE event_type = 'SLA_WARNING'`, depois V9. Esperado: `RMA_CREATED` → {Administrador, Atendimento}, `RMA_ASSIGNED` → {}, `SLA_WARNING` → {Administrador, Consulta}, `SLA_OVERDUE` → {Administrador, Atendimento}; a coluna `recipient_roles` não existe.
  - `NotificationIntegrationTest`: os testes de regra passam a enviar `recipientProfileIds`; novo `notifiesUsersOfRecipientProfiles` (um perfil personalizado com `rma.ver` como destinatário: o usuário dele recebe); `rejectsUnknownRecipientProfile` (400 `"Perfil não encontrado: 999999."`); `deletingProfileRemovesItFromRules`.
- [ ] **Step 2: Run** `mvn -B -ntp -f backend/pom.xml test "-Dtest=AccessProfileMigrationTest,Notification*"`. Expected: FAIL.
- [ ] **Step 3: Implement** a V9 (spec §6) e o mapeamento `@ManyToMany(fetch = EAGER) @JoinTable(name = "notification_rule_recipient_profiles", joinColumns = @JoinColumn(name = "rule_id"), inverseJoinColumns = @JoinColumn(name = "profile_id"))`. Atualize serviço, dispatcher e DTOs.
- [ ] **Step 4: Run** `mvn -B -ntp -f backend/pom.xml verify`. Expected: PASS.
- [ ] **Step 5: Commit**
```bash
git add backend/src/main/resources/db/migration/V9__notification_recipient_profiles.sql backend/src/main/java/br/com/navitasassist/notification backend/src/main/java/br/com/navitasassist/service/NotificationRuleService.java backend/src/main/java/br/com/navitasassist/service/NotificationDispatcher.java backend/src/main/java/br/com/navitasassist/repository/UserAccountRepository.java backend/src/test/java
git commit -m "feat(notificacoes): destinatários das regras por perfil (etapa 8A)"
```

**Aceite:** nenhum uso de `UserRole` no pacote `notification`.

---

### Task 8: API de usuários por perfil + extras (V10) e remoção de `UserRole`

**Files:**
- Create: `db/migration/V10__drop_user_role.sql`
- Modify: `user/UserAccount.java` (remove `role`), `UserAccountRequest.java`, `UserAccountUpdateRequest.java`, `UserAccountResponse.java`, `controller/UserController.java:35-44`, `service/UserAccountService.java` (todo: create/update/search/summarize/assignable, ponte removida), `repository/UserAccountRepository.java` (remove os métodos por role; `search(query, Long profileId, active, pageable)`; `@Query("select count(distinct a.profile.id) from UserAccount a") long countDistinctProfiles()`; `List<UserAccount> findAllByActiveTrueOrderByFullNameAsc()`), testes `user/*`, `auth/SessionRevocationIntegrationTest`, `auth/PasswordBoundaryIntegrationTest`, `pagination/PaginationIntegrationTest`, `AccessTestSupport`, `AccessProfileMigrationTest`
- Delete: `user/UserRole.java`

**Interfaces:**
- Consumes: `AccessProfileService.getEntity(Long)`, `ProfileSummary` (Task 6); `AdministratorGuard` (Task 5); `EffectivePermissionService` (Task 4).
- Produces: `UserAccountRequest(username, fullName, password, @NotNull Long profileId, Set<String> extraPermissions, boolean active)` (o `toString` mantém `[REDACTED]`); `UserAccountUpdateRequest`, idem, com senha opcional; `UserAccountResponse(Long id, String username, String fullName, ProfileSummary profile, List<String> extraPermissions, boolean active, Instant createdAt, Instant updatedAt)`.
- Produces: `GET /api/users?profileId=`; assignable = ativos com `rma.atribuivel` efetiva, por nome; `summarize()` conforme spec D13.

- [ ] **Step 1: Write failing tests:**
  - `UserControllerIntegrationTest`: create/update com `profileId` e `extraPermissions`; `rejectsUnknownProfile` (400 `"Perfil não encontrado: 999999."`); `rejectsUnknownExtraPermission` (400 `"Permissão desconhecida: xpto."`); `nullExtrasMeansEmpty`; `responseHasProfileAndExtras` (`$.profile.name`, `$.extraPermissions`); `keepsRedundantExtraWhenProfileLosesIt`.
  - `PaginationIntegrationTest`: filtro `profileId` (o caso da linha 214 passa a usar o id do Técnico); `profileId=abc` → 400 (antes era `role=INVALID`, linha 145).
  - `SessionRevocationIntegrationTest`: o caso `"role"` vira `"profile"` (`profileId` da Consulta); novo caso `"extras"` (acrescentar `rma.abrir` revoga sessões).
  - `UserAdminSafetyIntegrationTest`: os payloads usam `profileId`; novo `rejectsRemovingLastAdministratorsExtras` (admin só por extras, único: remover as extras → 400).
  - Assignable: `viewerWithAtribuivelExtraIsAssignable` (aparece em `/api/users/assignable` e `PATCH /api/rmas/{id}/assignee` aceita); `administratorIsNotAssignable` (igual a hoje).
  - `AccessProfileMigrationTest.dropsRoleColumnAtV10`.
- [ ] **Step 2: Run** `mvn -B -ntp -f backend/pom.xml test "-Dtest=User*,Pagination*,SessionRevocation*,AccessProfileMigrationTest"`. Expected: FAIL.
- [ ] **Step 3: Implement** a V10 (spec §6) e o resto:
  - Remova `role` da entidade, `UserRole.java` e a ponte.
  - `update` calcula `accessChanged` também por mudança de `profile.id` ou de `extraPermissions`.
  - `AccessTestSupport.assignProfile` deixa de gravar `role`.
  - Corrija os testes que montam JSON com `"role"` para `"profileId"`.
- [ ] **Step 4: Run** `mvn -B -ntp -f backend/pom.xml verify`. Expected: PASS. `grep -rn "UserRole" backend/src` não acha nada.
- [ ] **Step 5: Commit**
```bash
git add backend/src/main/resources/db/migration/V10__drop_user_role.sql backend/src/main/java backend/src/test/java
git commit -m "feat(usuarios): perfil e permissões extras no cadastro; remove UserRole (etapa 8A)"
```

**Aceite:** a API de usuários segue a spec §4.2, `UserRole` não existe e a coluna `role` foi removida.

---

### Task 9: Login e /me com permissões efetivas

**Files:**
- Create: `user/CurrentUserResponse.java`
- Modify: `auth/AuthController.java:47-74`, `service/UserAccountService.java:146-149`, `auth/AuthSecurityIntegrationTest.java`

**Interfaces:**
- Produces: `CurrentUserResponse(Long id, String username, String fullName, ProfileSummary profile, List<String> extraPermissions, List<String> permissions, boolean active, Instant createdAt, Instant updatedAt)`. `permissions` vêm efetivas, na ordem do catálogo. `UserAccountService.getCurrentUser(String) : CurrentUserResponse`.

- [ ] **Step 1: Write failing tests** em `AuthSecurityIntegrationTest`:
  - `loginReturnsEffectivePermissions`: Técnico → `$.permissions` igual, em ordem, à lista dos 11 códigos; `$.profile.name == "Técnico"`; `$.role` não existe.
  - `meIncludesExtras`: Consulta + extra `rma.abrir` → `$.permissions` contém `rma.abrir`.
- [ ] **Step 2: Run** `mvn -B -ntp -f backend/pom.xml test "-Dtest=AuthSecurityIntegrationTest"`. Expected: FAIL.
- [ ] **Step 3: Implement** o record e troque o retorno de `login`/`me`.
- [ ] **Step 4: Run** `mvn -B -ntp -f backend/pom.xml verify`. Expected: PASS.
- [ ] **Step 5: Commit**
```bash
git add backend/src/main/java/br/com/navitasassist/user/CurrentUserResponse.java backend/src/main/java/br/com/navitasassist/auth/AuthController.java backend/src/main/java/br/com/navitasassist/service/UserAccountService.java backend/src/test/java/br/com/navitasassist/auth/AuthSecurityIntegrationTest.java
git commit -m "feat(auth): login e sessão devolvem as permissões efetivas (etapa 8A)"
```

**Aceite:** o contrato de `/api/auth/me` segue a spec §4.2. O backend da etapa está completo.

---

### Task 10: Permissões no cliente (serviço único)

**Files:**
- Create: `frontend/src/app/core/permissions.ts` (+ `permissions.spec.ts`), `core/services/permission.service.ts` (+ spec), `testing/permission-fixtures.ts`
- Modify: `core/models.ts` (adiciona `ProfileRef`, `CurrentUserResponse`; `UserSession` ganha `profileName: string` e `permissions: Permission[]`; `AuthUserResponse = CurrentUserResponse`; `CurrentUserResponse.role?: UserRole` e `UserSession.role?: UserRole` ficam opcionais e são copiados se vierem, só para `hasAnyRole` seguir compilando até a Task 13; os dois saem na Task 17), `core/services/auth.service.ts:77-83` (`toSession`), `core/services/auth.service.spec.ts`

**Interfaces:**
- Produces: `PERMISSIONS` (readonly tuple dos 20 códigos), `type Permission = typeof PERMISSIONS[number]` e `isPermission(value: string): value is Permission`.
- Produces: `@Injectable({ providedIn: 'root' }) PermissionService { readonly permissions: Signal<ReadonlySet<Permission>>; hasPermission(p: Permission): boolean; hasAll(ps: readonly Permission[]): boolean; hasAny(ps: readonly Permission[]): boolean; }`
- Produces: `LEGACY_PROFILE_PERMISSIONS: Record<'ADMIN' | 'SERVICE_DESK' | 'TECHNICIAN' | 'VIEWER', readonly Permission[]>` (mesmo conteúdo de `LegacyProfiles`); `providePermissions(perms: readonly Permission[]): Provider` (stub de `PermissionService` com signal); `profilePermissions(code)`.

- [ ] **Step 1: Write failing tests:**
  - `permissions.spec.ts`: `PERMISSIONS` igual à lista literal da spec §3, na ordem; `isPermission('xpto') === false`.
  - `permission.service.spec.ts`: sem sessão, tudo false (`hasAll([])` true, `hasAny([])` false); com sessão `['rma.ver']` → `hasPermission('rma.ver')` true, `hasAll(['rma.ver','rma.abrir'])` false, `hasAny([...])` true; reage à troca de sessão (signal).
  - `auth.service.spec.ts`: `toSession` mapeia `profile.name` → `profileName` e descarta códigos desconhecidos (`['rma.ver','xpto']` → `['rma.ver']`).
- [ ] **Step 2: Run** o comando frontend com `--include 'src/app/core/**/*.spec.ts'`. Expected: FAIL.
- [ ] **Step 3: Implement** os arquivos novos e o `toSession`. `hasAnyRole` continua (lê `session.role`, agora opcional) até a Task 13.
- [ ] **Step 4: Run** a suíte frontend inteira. Expected: PASS.
- [ ] **Step 5: Commit**
```bash
git add frontend/src/app/core/permissions.ts frontend/src/app/core/permissions.spec.ts frontend/src/app/core/services/permission.service.ts frontend/src/app/core/services/permission.service.spec.ts frontend/src/app/testing/permission-fixtures.ts frontend/src/app/core/models.ts frontend/src/app/core/services/auth.service.ts frontend/src/app/core/services/auth.service.spec.ts
git commit -m "feat(permissoes): serviço único de permissões no frontend (etapa 8A)"
```

**Aceite:** `PermissionService` existe e é testado; as telas ainda não o usam.

---

### Task 11: Rotas, guard e menus por permissão

**Files:**
- Create: `guards/permission.guard.ts`, `core/navigation.ts` (+ `navigation.spec.ts`)
- Modify: `app.routes.ts:18-97` (`canActivate: [permissionGuard]` e `data.permissions` da spec §3.2; `dashboard`, `rmas`, `kanban` e `pecas` ganham guard; `notificacoes` não), `core/mock-data.ts:101-224` (`NAV_GROUPS` com `permissions`; remove `MODULE_CARDS`), `core/models.ts` (`NavItem.permissions: Permission[]`; remove `ModuleCard`), `layout/app-shell.component.ts:38-51` (`visibleNavGroups`, `currentRoleLabel` em :48) + `.html:36` (filtro com `hasAll`; rótulo `currentProfileLabel` = `profileName`), `guards/guards.spec.ts`, `app.routes.spec.ts`, `layout/app-shell.component.spec.ts`
- Delete: `guards/role.guard.ts`

**Interfaces:**
- Consumes: `PermissionService.hasAll` (Task 10).
- Produces: `permissionGuard: CanActivateFn`; `firstAllowedRoute(permissions: PermissionService): string` (primeiro `NAV_GROUPS` permitido, senão `'/notificacoes'`). O item Perfis (`/perfis`, `shield`, `['perfis.gerir']`) entra em `NAV_GROUPS` agora; a rota vem na Task 14.

- [ ] **Step 1: Write failing tests:**
  - `guards.spec.ts`: `allows when all route permissions are held`; `redirects to the first allowed nav route` (só `pecas.ver` → `/pecas`); `redirects to notifications when no nav route is allowed`.
  - `navigation.spec.ts`: ordem de `firstAllowedRoute` para os 4 perfis (todos → `/dashboard`).
  - `app.routes.spec.ts`: cada rota tem o `data.permissions` exato da spec §3.2.
  - `app-shell.component.spec.ts`: menus visíveis por perfil (`it.each` dos 4 perfis; A vê Perfis; S vê Clientes e Produtos, sem Relatórios; T e V sem Cadastros) e o rodapé mostra `profileName`.
- [ ] **Step 2: Run** com `--include 'src/app/{guards,layout,core}/**/*.spec.ts'` e `--include 'src/app/app.routes.spec.ts'`. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** a suíte inteira. Expected: PASS.
- [ ] **Step 5: Commit**
```bash
git add frontend/src/app/guards frontend/src/app/core/navigation.ts frontend/src/app/core/navigation.spec.ts frontend/src/app/app.routes.ts frontend/src/app/app.routes.spec.ts frontend/src/app/core/mock-data.ts frontend/src/app/core/models.ts frontend/src/app/layout
git commit -m "feat(permissoes): rotas, guard e menus por permissão (etapa 8A)"
```

**Aceite:** `roleGuard` não existe; as rotas seguem a spec §3.2; o perfil sem telas não entra em laço.

---

### Task 12: Ações de RMA, Kanban e dashboard por permissão

**Files:**
- Modify: `pages/rmas/rmas.component.ts:568-574`, `pages/kanban/kanban.component.ts:251-256` + `.html:253-301`, `shared/kanban-bulk-actions/kanban-bulk-actions.component.ts:33-34,130` + `.html:12`, `pages/dashboard/dashboard.component.ts:173`, e as specs `pages/rmas/*.spec.ts`, `pages/kanban/*.spec.ts`, `pages/dashboard/*.spec.ts`, `shared/kanban-bulk-actions/kanban-bulk-actions.component.spec.ts`

**Interfaces:**
- Consumes: `PermissionService`, `providePermissions`, `profilePermissions` (Task 10).
- Produces: `KanbanBulkActionsComponent` inputs `canUpdateStatus`, `canUpdatePriority` e `canUpdateAssignee` (`canManage` removido); `allowed(action)` usa o input da ação. `KanbanComponent.canUpdatePriority` (`rma.editar`) e `canBulkEdit` (`hasAny` das três).

- [ ] **Step 1: Write failing tests:**
  - `kanban.component.profiles.spec.ts`: `it.each` com os 4 perfis via `providePermissions(profilePermissions(code))` (status, responsável, prioridade, lote: A ✓✓✓✓, S ✓✓✓✓, T ✓✗✗✓, V ✗✗✗✗); novo caso "só `rma.responsavel`" → lote visível com a ação Responsável e sem Status/Prioridade.
  - `kanban-bulk-actions.component.spec.ts`: `priority action follows canUpdatePriority`, `assignee action follows canUpdateAssignee`.
  - `rmas.component*.spec.ts`: `canOpenRma` ↔ `rma.abrir`, `canRegisterDiagnosis` ↔ `rma.diagnosticar`, para os 4 perfis.
  - `dashboard.component*.spec.ts`: o resumo de usuários só com `usuarios.gerir`.
  - Nas specs existentes, troque o mock `AuthService.hasAnyRole` por `providePermissions(...)`, mantendo o perfil que cada uma simulava.
- [ ] **Step 2: Run** com `--include` dessas pastas. Expected: FAIL.
- [ ] **Step 3: Implement** a injeção de `PermissionService` e os `computed` com `hasPermission`/`hasAny`.
- [ ] **Step 4: Run** a suíte inteira. Expected: PASS.
- [ ] **Step 5: Commit**
```bash
git add frontend/src/app/pages/rmas frontend/src/app/pages/kanban frontend/src/app/pages/dashboard frontend/src/app/shared/kanban-bulk-actions
git commit -m "feat(permissoes): ações de RMA, Kanban e dashboard por permissão (etapa 8A)"
```

**Aceite:** essas telas não chamam `hasAnyRole`.

---

### Task 13: Peças, impedimentos, protocolos e notificações por permissão

**Files:**
- Modify: `pages/parts/parts.component.ts:141`, `shared/rma-block-panel/rma-block-panel.component.ts:37`, `shared/rma-parts-panel/rma-parts-panel.component.ts:151`, `shared/rma-protocols/rma-protocols.component.ts:140`, `pages/notifications/notifications.component.ts:288-310` (`isAdmin` → `canManageRules` = `notificacoes.regras`), `core/services/auth.service.ts` (remove `hasAnyRole`) + specs de `pages/parts/`, `shared/rma-block-panel/`, `shared/rma-parts-panel/`, `shared/rma-protocols/`, `pages/notifications/` e `core/services/auth.service.spec.ts`

**Interfaces:**
- Consumes: `PermissionService`, `providePermissions` (Task 10).

- [ ] **Step 1: Write failing tests:** um `it.each` dos 4 perfis em cada spec principal: `parts.component.spec.ts` (`canManage`: A, S), `rma-block-panel` (`canEdit`: A, S, T), `rma-parts-panel` (`canReserve`: A, T), `rma-protocols` (`canExecute`: A, T), `notifications.component.spec.ts` (aba Regras só A). Troque os mocks `hasAnyRole` restantes por `providePermissions`.
- [ ] **Step 2: Run** com `--include` dessas pastas. Expected: FAIL.
- [ ] **Step 3: Implement** e remova `AuthService.hasAnyRole`.
- [ ] **Step 4: Run** a suíte inteira. Expected: PASS. `grep -rn "hasAnyRole" frontend/src` não acha nada.
- [ ] **Step 5: Commit**
```bash
git add frontend/src/app/pages/parts frontend/src/app/shared/rma-block-panel frontend/src/app/shared/rma-parts-panel frontend/src/app/shared/rma-protocols frontend/src/app/pages/notifications frontend/src/app/core/services/auth.service.ts frontend/src/app/core/services/auth.service.spec.ts
git commit -m "feat(permissoes): peças, impedimentos, protocolos e notificações por permissão (etapa 8A)"
```

**Aceite:** toda checagem de tela passa por `PermissionService`.

---

### Task 14: Tela Perfis

**Files:**
- Create: `core/services/profile.service.ts` (+ spec), `pages/profiles/profiles.component.ts`, `profiles.component.html`, `profiles.component.spec.ts` (lista e estados), `profiles.component.form.spec.ts` (formulário, duplicar, excluir)
- Modify: `core/models.ts` (adiciona `ProfileResponse`, `ProfileOption`, `ProfileRequest`, `PermissionModuleResponse`, `PermissionItem`), `app.routes.ts` (rota `perfis` com `data.permissions: ['perfis.gerir']`, título `Perfis | Navitas Assist`), `app.routes.spec.ts`

**Interfaces:**
- Consumes: rotas da spec §4.2 (Task 6); `PermissionService`.
- Produces: `ProfileService { list(filters: { query?: string } & PageQuery): Observable<PageResponse<ProfileResponse>>; options(): Observable<ProfileOption[]>; permissionCatalog(): Observable<PermissionModuleResponse[]>; create(p: ProfileRequest): Observable<ProfileResponse>; update(id: number, p: ProfileRequest): Observable<ProfileResponse>; delete(id: number): Observable<void>; }`. Use as URLs da spec, e `HttpParams` como em `CatalogService.listUsers`.

- [ ] **Step 1: Write failing tests:**
  - `profile.service.spec.ts`: URLs, método e params de cada chamada (`HttpTestingController`).
  - `profiles.component.spec.ts`:
    - `lists profiles with permission and user counts` ("19 de 20", "1");
    - `shows load failure with retry` (`empty-state[role=alert]`, botão "Tentar novamente");
    - `shows empty states with and without search`;
    - `paginates with totals` (`app-pagination` com `totalElements`);
    - `blocks delete when profile has users` (`blockedReason` com o texto da spec);
    - nenhum texto de carregamento no DOM (`aria-busy` presente).
  - `profiles.component.form.spec.ts`:
    - `groups permissions by module with counters` (6 `fieldset`, legenda "RMAs", "3 de 8");
    - `requires name` ("Informe o nome do perfil.");
    - `creates profile with checked permissions`;
    - `edits profile and warns about sessions when it has users`;
    - `duplicates as "Cópia de X" with same permissions` (sem id; chama `create`);
    - `truncates duplicate name to 60 chars`;
    - `shows server error in modal-feedback`;
    - `confirms and deletes`;
    - `traps focus via appModalFocus` (o atributo está presente).
- [ ] **Step 2: Run** com `--include 'src/app/{pages/profiles,core/services}/**/*.spec.ts'`. Expected: FAIL.
- [ ] **Step 3: Implement** espelhando `pages/users/users.component.{ts,html}`: os mesmos signals de estado (`loading`, `loadFailed`, `hasLoaded`, `errorMessage`, `modalErrorMessage`, `successMessage`), `paged-list`/`pagination` utils e as mesmas classes. Os textos são os da spec §5. O catálogo é carregado ao abrir o modal; se falhar, o modal mostra "Não foi possível carregar as permissões. Tente novamente." e desabilita o envio.
- [ ] **Step 4: Run** a suíte inteira e `npm --prefix frontend run build`. Expected: PASS, build sem avisos novos.
- [ ] **Step 5: Commit**
```bash
git add frontend/src/app/core/services/profile.service.ts frontend/src/app/core/services/profile.service.spec.ts frontend/src/app/pages/profiles frontend/src/app/core/models.ts frontend/src/app/app.routes.ts frontend/src/app/app.routes.spec.ts
git commit -m "feat(perfis): tela de perfis com permissões por módulo (etapa 8A)"
```

**Aceite:** é possível listar, criar, editar, duplicar e apagar perfis, nos padrões visuais atuais.

---

### Task 15: Tela Usuários com perfil e permissões extras

**Files:**
- Modify: `pages/users/users.component.ts` (form `profileId`/`extraPermissions`, filtro, coluna), `users.component.html:20-28,97,195-214`, `core/services/catalog.service.ts:34-37,102-127` (`UserFilters.role` → `profileId`), `core/models.ts` (`UserAccountResponse.profile`/`extraPermissions`; requests com `profileId`/`extraPermissions`), specs `pages/users/*.spec.ts`, `core/services/catalog.service.spec.ts`

**Interfaces:**
- Consumes: `ProfileService.options()`/`permissionCatalog()` (Task 14).

- [ ] **Step 1: Write failing tests** (`users.component.spec.ts`):
  - `requires a profile without default` ("Selecione o perfil.");
  - `marks profile permissions as included and disabled`;
  - `sends only extras not in the selected profile`;
  - `switching profile keeps compatible extras and drops ones now included`;
  - `filters list by profileId`;
  - `shows profile name and extras count in the table` ("+2 extras");
  - `disables submit when profile options fail` (texto da spec §5);
  - `catalog.service.spec.ts`: o param `profileId`.
- [ ] **Step 2: Run** com `--include 'src/app/pages/users/**/*.spec.ts'`. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** a suíte inteira. Expected: PASS.
- [ ] **Step 5: Commit**
```bash
git add frontend/src/app/pages/users frontend/src/app/core/services/catalog.service.ts frontend/src/app/core/services/catalog.service.spec.ts frontend/src/app/core/models.ts
git commit -m "feat(usuarios): seletor de perfil e permissões extras (etapa 8A)"
```

**Aceite:** a tela de Usuários usa perfis e extras conforme a spec §5.

---

### Task 16: Regras de notificação com perfis destinatários

**Files:**
- Modify: `pages/notifications/notifications.component.ts:7,268,283-284,437-490`, `notifications.component.html:312+`, `core/models.ts:364` (`recipientProfiles: ProfileRef[]`; request `recipientProfileIds: number[]`), `pages/notifications/notifications.component.rules.spec.ts`

**Interfaces:**
- Consumes: `ProfileService.options()` (Task 14).

- [ ] **Step 1: Write failing tests** (`rules.spec.ts`):
  - `lists profiles as recipient checkboxes`;
  - `prefills checked profiles from rule`;
  - `submits recipientProfileIds`;
  - `summarizes recipients by profile name plus assignee`;
  - `warns when no recipients`;
  - `shows error when profiles fail to load`.
- [ ] **Step 2: Run** com `--include 'src/app/pages/notifications/**/*.spec.ts'`. Expected: FAIL.
- [ ] **Step 3: Implement**: o form group `roles` vira um `FormControl<number[]>`; as opções são carregadas ao abrir a aba Regras.
- [ ] **Step 4: Run** a suíte inteira. Expected: PASS.
- [ ] **Step 5: Commit**
```bash
git add frontend/src/app/pages/notifications frontend/src/app/core/models.ts
git commit -m "feat(notificacoes): regras com perfis destinatários na tela (etapa 8A)"
```

**Aceite:** nenhum uso de `ROLE_OPTIONS`/`ROLE_LABELS` em notificações.

---

### Task 17: Limpeza final, documentação e verificação

**Files:**
- Modify: `core/models.ts` (remove `UserRole`; `UserSession.role` removido), `core/mock-data.ts` (remove `ROLE_LABELS`, `ROLE_OPTIONS`), specs que ainda importem `UserRole`, `README.md` (as seções "Autorização da API" `:346-359`, "Paginação" `:131` (`profileId`), atribuição `:69`, relatórios `:81`, impedimentos `:95`, lote `:107` e protocolos `:503-504` descrevem o acesso por permissão; nova subseção "Perfis e permissões" com a tabela da spec §3 e a nota de backup/rollback da spec §6)

- [ ] **Step 1:** `grep -rn -E "UserRole|ROLE_LABELS|ROLE_OPTIONS|hasAnyRole|roleGuard" frontend/src backend/src` deve dar vazio depois da limpeza.
- [ ] **Step 2: Run** `mvn -B -ntp -f backend/pom.xml verify`, a suíte frontend inteira e `npm --prefix frontend run build`. Expected: tudo PASS, build sem avisos novos.
- [ ] **Step 3: Conferir as migrations em MySQL 8.0 real.** Suba a stack Docker do repo (`compose.yaml`; portas 8081/4201/3307 conforme o ambiente local) sobre um banco **com dados da V7**. Confira que o backend sobe (Flyway V8–V10 aplicadas, `validate` ok), que `SELECT legacy_code, COUNT(*) FROM access_profiles p JOIN access_profile_permissions pp ON pp.profile_id = p.id GROUP BY legacy_code` dá ADMIN 19, SERVICE_DESK 11, TECHNICIAN 11 e VIEWER 5, e que `GET /api/auth/me` de um admin lista 19 permissões. Se algum DDL falhar no MySQL, corrija a migration (ainda não publicada) e repita o Step 2.
- [ ] **Step 4: Commit**
```bash
git add README.md frontend/src/app/core/models.ts frontend/src/app/core/mock-data.ts frontend/src/app
git commit -m "docs(permissoes): README de perfis e permissões; remove resquícios de UserRole (etapa 8A)"
```

**Aceite:** as suítes e o build estão verdes, as migrations foram conferidas em MySQL 8.0 e o README descreve o modelo novo.

---

## Self-review (feito)

- **Cobertura da spec:** §2 → T3/T7/T8; §3 → T1, e a matriz em T2/T4/T6; §3.2 → T11–T13; §4.1 → T4; §4.2 → T6–T9; §4.3 → T5 (e T6/T8); §5 → T10–T16; §6 → T3/T7/T8/T17 (MySQL); §7 → os testes de cada tarefa; riscos R4/R5 → T17 e README.
- **Consistência de nomes:** `asProfile`, `saveAccount`, `assignProfile`, `LegacyProfiles`, `EffectivePermissionService.effectivePermissions`, `AdministratorGuard.*`, `AccessProfileService.getEntity`, `ProfileSummary`, `PermissionService.hasPermission/hasAll/hasAny`, `providePermissions`, `profilePermissions` e `firstAllowedRoute` são os mesmos em todas as tarefas.
- **Ordem que mantém tudo verde:** a ponte `role` → `profile` (T3) permite trocar autorização (T4), guard (T5) e API (T6) antes de remover `role` (T8). No frontend, `hasAnyRole` só some em T13, depois de todas as telas migrarem, e `UserRole` só some em T17.
