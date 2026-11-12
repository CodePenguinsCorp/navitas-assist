# Permissões por perfil personalizado (etapa 8A): desenho

Data: 2026-11-11. Implementação: `docs/superpowers/plans/2026-11-11-permissoes.md`. Esta versão já incorpora a revisão independente (`docs/superpowers/plans/2026-11-11-permissoes-revisao.md`) e as decisões finais delegadas pelo usuário.

## 1. Objetivo e decisões

Hoje o acesso depende do enum `UserRole` (`ADMIN`, `SERVICE_DESK`, `TECHNICIAN`, `VIEWER`) em `backend/src/main/java/br/com/navitasassist/user/UserRole.java`. As regras estão em:

- `config/SecurityConfig.java:75-105` (`hasRole`/`hasAnyRole`);
- regras de negócio que testam o perfil (`UserAccountService`, `NotificationDispatcher`, `NotificationRule.recipientRoles`);
- no frontend: `app.routes.ts` `data.roles`, `roleGuard`, `AuthService.hasAnyRole`, `NAV_GROUPS` e `hasAnyRole([...])` em componentes.

Objetivo: trocar o perfil fixo por **perfis personalizados**, cada um formado por um conjunto de **permissões de um catálogo fixo**. Os 4 perfis atuais viram perfis prontos e editáveis, com as permissões equivalentes às de hoje. Nada muda para os usuários atuais até um administrador editar um perfil.

Decisões aprovadas:

- O catálogo de permissões é fixo no código. Um perfil tem nome e conjunto de permissões. A tela **Perfis** (`perfis.gerir`) permite criar, editar, duplicar e apagar perfis.
- Cada usuário tem 1 perfil e uma lista de **permissões extras**, que só acrescentam. Permissão efetiva = permissões do perfil ∪ extras.
- Administrador protegido: sempre existe ao menos um usuário ativo com `usuarios.gerir` **e** `perfis.gerir` efetivas. Perfil com usuários não pode ser apagado.
- Sem escopo de dados: nenhuma permissão restringe *quais* registros se vê.
- **D1** A permissão `rma.atribuivel` ("pode ser responsável por RMAs") é nova. Hoje só usuários `TECHNICIAN` aparecem em `/api/users/assignable` e podem ser atribuídos (`UserAccountService.java:58-63`, `:122-132`). Daqui em diante, isso depende dessa permissão, e só o perfil Técnico a recebe.
- **D2** As leituras `GET /api/clients/**`, `/api/products/**`, `/api/parts/**` e `/api/protocols/**` continuam `authenticated()`, como hoje. Dashboard, relatórios, RMAs e painéis dependem delas (`dashboard.component.ts:299-303`, `reports.component.ts:81`).
  - `cadastros.ver`, `pecas.ver` e `protocolos.ver` controlam só menu e rota.
  - As telas Clientes/Produtos e Protocolos continuam exigindo leitura **e** edição: `cadastros.ver` + `cadastros.editar` e `protocolos.ver` + `protocolos.catalogo`.
  - `rma.ver` e `relatorios.ver` controlam a API.
- **D3** "Administrador" é o usuário com `usuarios.gerir` e `perfis.gerir`.
  - As rotas de API não classificadas (`/api/**`, hoje `hasRole("ADMIN")`) exigem as duas. Assim o ADMIN continua recebendo 404/405 nelas, e os demais, 403.
  - Vale a regra anti-escalada (seção 4.4).
- **D4** Regras de notificação passam a ter **perfis** destinatários, em vez de roles. Apagar um perfil o remove das regras. Isso não muda quem recebe, porque só se apaga perfil sem usuários.
- **D5** A visibilidade de notificações (`NotificationVisibilityPolicy`) passa a exigir `rma.ver`, porque as notificações expõem dados de RMA. Os 4 perfis têm `rma.ver`.
- **D6** Migração em **expand/contract**:
  - V8–V10 criam o modelo novo.
  - `user_accounts.role` e `notification_rules.recipient_roles` **não são apagadas**. A V10 remove o CHECK e o NOT NULL delas, e elas viram colunas legadas, nulas e sem uso pelo código.
  - Uma V11, em tarefa separada e opcional, apaga as colunas só depois que o dono do produto conferir a implantação.
  - Backup obrigatório antes da V8. O rollback manual está na seção 6.
- **D7** Duplicar é só no frontend: abre o formulário de novo perfil já preenchido com "Cópia de {nome}" e as mesmas permissões.
  - Nomes de perfil são únicos, sem diferenciar maiúsculas de minúsculas, e têm no máximo 60 caracteres.
  - No MySQL (collation `utf8mb4_0900_ai_ci`), nomes que diferem só por acento também conflitam e recebem a mesma mensagem.
- **D8** As permissões são **recalculadas a cada requisição** autenticada, sem derrubar sessões (seção 4.1).
  - Editar perfil ou extras vale na próxima requisição de cada usuário afetado.
  - A revogação de sessões fica só para desativar, excluir, mudar senha ou mudar nome de usuário.
- **D9** Um novo usuário não recebe perfil pré-selecionado (hoje o padrão é `SERVICE_DESK`, em `users.component.ts:125`). O perfil é obrigatório.
- **D10** As mensagens de erro existentes continuam idênticas, em inglês (ex.: "At least one active administrator must remain."). As novas são em português.
- **D11** Não há dependência entre permissões. Perfil vazio é permitido. Quem não tem nenhuma tela cai em `/notificacoes`, que só exige login.
- **D12** O enum `UserRole` sai do código. A coluna `access_profiles.legacy_code` guarda o código antigo (`ADMIN` etc.) dos 4 perfis migrados, para rastreio, testes e rollback. Ela não aparece na tela.
- **D13** `GET /api/users/summary` mantém os campos `admins` e `roles`:
  - `admins`: usuários, ativos ou não, com as duas permissões de administrador;
  - `roles`: perfis distintos em uso.

## 2. Modelo de dados

Tabelas novas. Todas as FKs e índices têm nome explícito, e os índices são criados antes das FKs:

| Tabela | Colunas | Restrições |
|:---|:---|:---|
| `access_profiles` | `id BIGINT AUTO_INCREMENT PK`, `name VARCHAR(60) NOT NULL`, `legacy_code VARCHAR(30) NULL`, `created_at`, `updated_at DATETIME(6) NOT NULL`, `created_by`, `updated_by VARCHAR(60)` | `uk_access_profiles_name UNIQUE(name)`, `uk_access_profiles_legacy_code UNIQUE(legacy_code)` |
| `access_profile_permissions` | `profile_id BIGINT NOT NULL`, `permission VARCHAR(60) NOT NULL` | PK `(profile_id, permission)`; `fk_access_profile_permissions_profile` → `access_profiles` `ON DELETE CASCADE` |
| `user_account_extra_permissions` | `user_id BIGINT NOT NULL`, `permission VARCHAR(60) NOT NULL` | PK `(user_id, permission)`; `fk_user_extra_permissions_user` → `user_accounts` `ON DELETE CASCADE` |
| `notification_rule_recipient_profiles` | `rule_id BIGINT NOT NULL`, `profile_id BIGINT NOT NULL` | PK `(rule_id, profile_id)`; `idx_rule_recipient_profiles_profile (profile_id)`; `fk_rule_recipient_profiles_rule` → `notification_rules` e `fk_rule_recipient_profiles_profile` → `access_profiles`, ambas `ON DELETE CASCADE` |

Alterações:

- `user_accounts.profile_id BIGINT NOT NULL` com `idx_user_accounts_profile (profile_id)` e `fk_user_accounts_profile` → `access_profiles(id)`, sem cascade.
- `user_accounts.role` e `notification_rules.recipient_roles` continuam como colunas legadas. A V10 tira `ck_user_accounts_role` e o NOT NULL delas, e a V11 opcional as apaga.

Entidades JPA. O pacote novo é `br.com.navitasassist.access`; repositórios, serviços e controllers ficam em `repository/`, `service/` e `controller/`, como no resto do projeto.

- `AccessProfile extends AuditableEntity`: `id`, `name`, `legacyCode` e `Set<String> permissions` (`@ElementCollection(fetch = EAGER)` com `@Fetch(FetchMode.SELECT)`).
- `UserAccount` ganha:
  - `@ManyToOne(optional = false, fetch = EAGER) @Fetch(FetchMode.SELECT) AccessProfile profile`;
  - `Set<String> extraPermissions` (`@ElementCollection(fetch = EAGER) @Fetch(FetchMode.SELECT)`).
  - `role` sai do mapeamento na tarefa que remove `UserRole`; até lá recebe o `legacy_code` do perfil, ou `VIEWER` se não houver.
- `NotificationRule`: `Set<UserRole> recipientRoles` vira `@ManyToMany(fetch = EAGER) Set<AccessProfile> recipientProfiles`. `UserRoleSetConverter` é apagado.

As permissões ficam guardadas como texto (código do catálogo). Na gravação, a API recusa códigos fora do catálogo. Na leitura, o cálculo da permissão efetiva ignora códigos desconhecidos.

## 3. Catálogo e tabela de equivalência

O catálogo é o enum `br.com.navitasassist.access.Permission(code, module, label)`, com módulos em `PermissionModule(label)`. A ordem do enum é a ordem de exibição. Siglas dos perfis migrados (nomes atuais de `ROLE_LABELS`): A = Administrador (ADMIN), S = Atendimento (SERVICE_DESK), T = Técnico (TECHNICIAN), V = Consulta (VIEWER).

| # | Código | Módulo (`PermissionModule`) | Rótulo | A | S | T | V |
|:-:|:---|:---|:---|:-:|:-:|:-:|:-:|
| 1 | `rma.ver` | RMA "RMAs" | Ver RMAs, Kanban e dashboard | ✓ | ✓ | ✓ | ✓ |
| 2 | `rma.abrir` | RMA | Abrir RMAs | ✓ | ✓ | | |
| 3 | `rma.editar` | RMA | Alterar dados gerais e prioridade | ✓ | ✓ | | |
| 4 | `rma.status` | RMA | Alterar status | ✓ | ✓ | ✓ | |
| 5 | `rma.responsavel` | RMA | Atribuir responsável | ✓ | ✓ | | |
| 6 | `rma.atribuivel` | RMA | Pode ser responsável por RMAs | | | ✓ | |
| 7 | `rma.diagnosticar` | RMA | Registrar diagnóstico | ✓ | | ✓ | |
| 8 | `rma.impedimentos` | RMA | Registrar e resolver impedimentos | ✓ | ✓ | ✓ | |
| 9 | `cadastros.ver` | CADASTROS "Clientes e produtos" | Consultar clientes e produtos | ✓ | ✓ | ✓ | ✓ |
| 10 | `cadastros.editar` | CADASTROS | Criar, alterar e excluir clientes e produtos | ✓ | ✓ | | |
| 11 | `pecas.ver` | PECAS "Peças" | Consultar peças e estoque | ✓ | ✓ | ✓ | ✓ |
| 12 | `pecas.movimentar` | PECAS | Cadastrar peças e movimentar estoque | ✓ | ✓ | | |
| 13 | `pecas.reservar` | PECAS | Reservar e aplicar peças nos RMAs | ✓ | | ✓ | |
| 14 | `protocolos.ver` | PROTOCOLOS "Protocolos técnicos" | Consultar protocolos e execuções | ✓ | ✓ | ✓ | ✓ |
| 15 | `protocolos.executar` | PROTOCOLOS | Executar protocolos nos RMAs | ✓ | | ✓ | |
| 16 | `protocolos.catalogo` | PROTOCOLOS | Gerenciar modelos de protocolo | ✓ | | | |
| 17 | `relatorios.ver` | RELATORIOS "Relatórios" | Ver relatórios | ✓ | | ✓ | ✓ |
| 18 | `usuarios.gerir` | ADMINISTRACAO "Administração" | Gerenciar usuários | ✓ | | | |
| 19 | `perfis.gerir` | ADMINISTRACAO | Gerenciar perfis e permissões | ✓ | | | |
| 20 | `notificacoes.regras` | ADMINISTRACAO | Configurar regras de notificação | ✓ | | | |

Totais por perfil migrado: A = 19 (todas menos `rma.atribuivel`), S = 11, T = 11, V = 5.

### 3.1 Permissão → endpoints (derivado de `SecurityConfig.java:76-104`)

As regras seguem a ordem atual. A coluna "Hoje" mostra quem acessa com os roles atuais; "Depois", a permissão que passa a ser exigida. São 30 regras cobrindo 76 mapeamentos de controller.

| Endpoint(s) | Hoje | Depois |
|:---|:---|:---|
| `/health`, `GET /api/auth/csrf`, `POST /api/auth/login` | público | público |
| `GET /api/users/assignable`, `/api/kanban-views/**`, `/api/notifications/**`, `GET /api/auth/me`, `POST /api/auth/logout` | autenticado | autenticado (pessoal) |
| `/api/notification-rules/**` | ADMIN | `notificacoes.regras` |
| `/api/users/**` (exceto assignable) | ADMIN | `usuarios.gerir` |
| `GET /api/reports/rmas` | ADMIN, TECHNICIAN, VIEWER | `relatorios.ver` |
| `GET /api/clients/**`, `GET /api/products/**` | autenticado | autenticado (D2) |
| `GET /api/rmas/**` (inclui `/api/rmas/*/parts`) | autenticado | `rma.ver` |
| `POST /api/clients`, `POST /api/products`; `PUT /api/clients/*`, `/api/products/*`; `DELETE /api/clients/*`, `/api/products/*` | ADMIN, SERVICE_DESK | `cadastros.editar` |
| `POST /api/rmas` | ADMIN, SERVICE_DESK | `rma.abrir` |
| `PUT /api/rmas/*` | ADMIN, SERVICE_DESK | `rma.editar` |
| `PUT /api/rmas/*/diagnosis` | ADMIN, TECHNICIAN | `rma.diagnosticar` |
| `PATCH /api/rmas/*/status`, `/api/rmas/*/bulk-status` | ADMIN, SERVICE_DESK, TECHNICIAN | `rma.status` |
| `PATCH /api/rmas/*/assignee` | ADMIN, SERVICE_DESK | `rma.responsavel` |
| `POST /api/rmas/*/blocks`, `PATCH /api/rmas/*/blocks/*` | ADMIN, SERVICE_DESK, TECHNICIAN | `rma.impedimentos` |
| `GET /api/parts/**` | autenticado | autenticado (D2) |
| `POST /api/parts`, `PUT /api/parts/*`, `POST /api/parts/*/movements`, `POST /api/parts/movements/*/reversal` | ADMIN, SERVICE_DESK | `pecas.movimentar` |
| `POST /api/rmas/*/parts`, `POST /api/rmas/*/parts/*/*` (reservar, alocar, consumir, cancelar) | ADMIN, TECHNICIAN | `pecas.reservar` |
| `GET /api/protocols/**` | autenticado | autenticado (D2) |
| `POST /api/protocols/templates`, `PUT /api/protocols/templates/*` | ADMIN | `protocolos.catalogo` |
| `POST /api/protocols/rmas/*/executions`, `.../executions/*/items/*/results`, `.../executions/*/complete` | ADMIN, TECHNICIAN | `protocolos.executar` |
| demais `/api/protocols/**` | ninguém (`denyAll`) | ninguém (`denyAll`) |
| `GET /api/profiles/options` (novo) | n/a | qualquer uma de `perfis.gerir`, `usuarios.gerir`, `notificacoes.regras` |
| `GET /api/permissions` (novo) | n/a | qualquer uma de `perfis.gerir`, `usuarios.gerir` |
| `/api/profiles/**` (novo) | n/a | `perfis.gerir` |
| demais `/api/**` | ADMIN | `usuarios.gerir` **e** `perfis.gerir` (D3) |
| qualquer outra requisição | autenticado | autenticado |

Regras de negócio que testam perfil hoje:

| Onde | Hoje | Depois |
|:---|:---|:---|
| `UserAccountService.listAssignableTechnicians` / `getAssignableTechnicianById` | `role == TECHNICIAN` | permissão efetiva `rma.atribuivel` (D1); mensagens iguais |
| `UserAccountService.validateAdministratorRemoval` e locks | `role == ADMIN` | `AdministratorGuard` (seção 4.3) |
| `NotificationDispatcher.recipients` | `role IN recipientRoles` | `profile IN recipientProfiles` |
| `NotificationVisibilityPolicy.canView` | `role != null` | permissão efetiva `rma.ver` (D5) |

### 3.2 Permissão → rotas e ações de tela (frontend)

| Tela/ação | Hoje (`hasAnyRole`/`data.roles`) | Depois |
|:---|:---|:---|
| Rotas `/dashboard`, `/rmas`, `/kanban`; itens de menu | todos | `rma.ver` |
| Rota/menu `/pecas` | todos | `pecas.ver` |
| Rota/menu `/notificacoes` | todos | só login |
| Rotas/menus `/clientes`, `/produtos` | ADMIN, SERVICE_DESK | `cadastros.ver` + `cadastros.editar` (D2) |
| Rota/menu `/protocolos` | ADMIN | `protocolos.ver` + `protocolos.catalogo` (D2) |
| Rota/menu `/usuarios` | ADMIN | `usuarios.gerir` |
| Rota/menu `/perfis` (nova) | n/a | `perfis.gerir` |
| Rota/menu `/relatorios` | ADMIN, TECHNICIAN, VIEWER | `relatorios.ver` |
| `rmas.component` `canOpenRma` | ADMIN, SERVICE_DESK | `rma.abrir` |
| `rmas.component` `canRegisterDiagnosis` | ADMIN, TECHNICIAN | `rma.diagnosticar` |
| `kanban.component` `canUpdateStatus` | ADMIN, SERVICE_DESK, TECHNICIAN | `rma.status` |
| `kanban.component` `canUpdateAssignee` | ADMIN, SERVICE_DESK | `rma.responsavel` |
| `kanban.component` prioridade em lote (hoje `canManage` = `canUpdateAssignee`) | ADMIN, SERVICE_DESK | `canUpdatePriority` = `rma.editar` (entrada nova do `kanban-bulk-actions`) |
| Seleção e ações em lote no Kanban: `toggleBulkSelection`, `selectVisibleRmas` (`kanban.component.ts:344,349`), `[bulkSelectionEnabled]` (`.html:272`) e o bloco `.html:253` (hoje `canUpdateStatus`) | ADMIN, SERVICE_DESK, TECHNICIAN | `canBulkEdit` = qualquer uma de `rma.status`, `rma.editar`, `rma.responsavel` |
| `dashboard.component` resumo de usuários (`isAdmin`) | ADMIN | `usuarios.gerir` |
| `notifications.component` aba Regras (`isAdmin`) | ADMIN | `notificacoes.regras` |
| `parts.component` `canManage` | ADMIN, SERVICE_DESK | `pecas.movimentar` |
| `rma-block-panel` `canEdit` | ADMIN, SERVICE_DESK, TECHNICIAN | `rma.impedimentos` |
| `rma-parts-panel` `canReserve` | ADMIN, TECHNICIAN | `pecas.reservar` |
| `rma-protocols` `canExecute` | ADMIN, TECHNICIAN | `protocolos.executar` |
| Rodapé da lateral (`currentRoleLabel`) | rótulo do role | nome do perfil |

Com as permissões migradas, os 4 perfis produzem exatamente o comportamento atual em todas as linhas de §3.1 e §3.2.

## 4. Backend

### 4.1 Permissão efetiva, autenticação e recálculo por requisição

- `EffectivePermissionService.effectivePermissions(UserAccount) : Set<Permission>` = `profile.permissions` ∪ `extraPermissions`, convertidas pelo catálogo e sem códigos desconhecidos. `isAdministrator(UserAccount)` exige `USUARIOS_GERIR` e `PERFIS_GERIR`; `active` não entra na conta.
- No login, `NavitasUserDetailsService` concede como authorities os códigos efetivos (ex.: `rma.ver`), sem `ROLE_*`.
  - O lock do login trava **só** a linha de `user_accounts` (JPQL sem join).
  - Perfil e coleções são lidos depois, em selects próprios e sem lock (`@Fetch(FetchMode.SELECT)`). Por isso o login não trava perfis.
- O login grava o token com detalhes do tipo `LoginSessionDetails`, que marca as sessões criadas por login real.
- `EffectiveAuthoritiesFilter extends OncePerRequestFilter`, registrado com `addFilterAfter(…, SecurityContextHolderFilter.class)`, age a cada requisição cuja `Authentication` traga `LoginSessionDetails`:
  1. relê o usuário pelo nome (sem lock; perfil EAGER);
  2. recalcula as authorities;
  3. se mudaram, troca a `Authentication` por uma com as authorities novas (mesmo principal e mesmos detalhes);
  4. grava com `securityContextRepository.saveContext` (`requireExplicitSave(true)` está ligado).

  Se o usuário não existir mais, o filtro não faz nada, porque a revogação já cuida desse caso. Tokens de teste (`with(user(...))`) não trazem `LoginSessionDetails` e não são tocados. Se o custo da consulta pesar, a evolução é uma coluna `access_version` (fora do escopo).
- `SecurityConfig` usa `hasAuthority`/`hasAnyAuthority` com os códigos de `Permission`, na ordem de §3.1. O catch-all usa `AuthorizationManagers.allOf(hasAuthority(usuarios.gerir), hasAuthority(perfis.gerir))`. Se a inferência falhar, escreva `AuthorizationManagers.<RequestAuthorizationContext>allOf(...)`.
- A revogação de sessões (`AccountSessionRevoker`) fica só para desativar, excluir, mudar senha ou mudar nome de usuário. Mudar perfil ou extras não revoga.

### 4.2 API

Contratos JSON. Datas vêm em ISO, e as listas de permissões, na ordem do catálogo.

**Catálogo e perfis:**

- `GET /api/permissions` → `[{ "module": "RMA", "label": "RMAs", "permissions": [{ "code": "rma.ver", "label": "Ver RMAs, Kanban e dashboard" }, …] }, …]`, com os 6 módulos na ordem do enum.
- `GET /api/profiles?query&page&size` → `PageResponse<ProfileResponse>`, ordenado por `lower(name)` e depois `id`. O `query` filtra pelo nome.
  - `ProfileResponse = { id, name, permissions: string[], userCount, createdAt, updatedAt }`.
- `GET /api/profiles/options` → `[{ id, name, permissions: string[] }]`, ordenado por nome.
- `GET /api/profiles/{id}` → `ProfileResponse`, ou 404.
- `POST /api/profiles` (201) e `PUT /api/profiles/{id}` (200) recebem `ProfileRequest = { name: string(1..60, aparado), permissions: string[] }`. Erros 400:
  - nome vazio ou longo (validação);
  - `"Já existe um perfil com o nome {nome}."`, também quando a violação de `uk_access_profiles_name` vem do banco: o serviço traduz o `DataIntegrityViolationException` do `saveAndFlush` para a mesma mensagem;
  - `"Permissão desconhecida: {código}."`;
  - anti-escalada (4.4);
  - proteção do administrador (4.3).
- `DELETE /api/profiles/{id}` → 204. Com usuários vinculados: 400 `"Perfil possui usuários vinculados e não pode ser excluído."`.

**Usuários:**

- `UserAccountRequest` e `UserAccountUpdateRequest` trocam `role` por `profileId: number` (obrigatório) e `extraPermissions: string[]` (opcional; `null` vale `[]`).
- `UserAccountResponse` ganha `profile: { id, name }` e `extraPermissions: string[]`. Até a limpeza final, mantém o campo provisório `role: string | null` = `legacy_code` do perfil, para o frontend antigo seguir funcionando entre as tarefas.
- O filtro `GET /api/users?role=` vira `profileId=`.
- `profileId` inexistente no cadastro gera 400 `"Perfil não encontrado: {id}."`. Anti-escalada conforme 4.4.

**Autenticação:**

- `POST /api/auth/login` e `GET /api/auth/me` devolvem `CurrentUserResponse` = `UserAccountResponse` + `permissions: string[]` (efetivas). Também leva o `role` provisório até a limpeza final.

**Regras de notificação:**

- `NotificationRuleRequest.recipientRoles` vira `recipientProfileIds: number[]`.
- `NotificationRuleResponse.recipientRoles` vira `recipientProfiles: [{ id, name }]`, ordenado por nome.
- Id inexistente gera 400 `"Perfil não encontrado: {id}."`.

### 4.3 Proteção do administrador

`AdministratorGuard` (serviço transacional):

- `lockAccessGraph()` trava, nesta ordem, todos os perfis (`PESSIMISTIC_WRITE`, ordem por id) e depois todos os usuários ativos (ordem por id).
  - Toda operação que pode reduzir acesso chama esse método antes de travar o alvo.
  - Substitui `findActiveByRoleForUpdate(UserRole.ADMIN)` (`UserAccountService.java:161-165`).
  - O login trava só a linha do próprio usuário e nunca perfis, então não há ciclo de locks com `lockAccessGraph`.
- `ensureRemainsAfterUserChange(UserAccount atual, AccessProfile novoPerfil, Set<String> novasExtras, boolean novoAtivo)`, `ensureRemainsAfterUserDeletion(UserAccount)` e `ensureRemainsAfterProfileChange(AccessProfile, Set<String> novasPermissoes)` simulam a mudança sobre os usuários ativos travados.
  - Se havia ≥ 1 administrador ativo e passaria a haver 0, lançam `BusinessException("At least one active administrator must remain.")`.
  - Se já havia 0, a mudança passa, para não travar o sistema.
- O guard é usado na atualização e na exclusão de usuário e na atualização de perfil. A exclusão de perfil não precisa dele, porque só se apaga perfil sem usuários.

### 4.4 Regra anti-escalada

`PermissionGrantPolicy.ensureCanGrant(String actorUsername, Set<Permission> concedidas)`:

- Se o ator é administrador (`isAdministrator`), passa.
- Senão, `concedidas` precisa estar contida nas permissões efetivas do ator. Caso contrário: 400 `"Você não pode conceder permissões que não possui."`.

Onde se aplica:

- **Perfis** (`POST`/`PUT /api/profiles`): `concedidas` = as permissões do pedido.
- **Usuários** (`POST`/`PUT /api/users`): `concedidas` = permissões do perfil escolhido ∪ extras do pedido. Como a regra olha o estado resultante, quem não é administrador também não consegue editar um usuário que tenha permissões que ele não possui.

## 5. Frontend

**Base de permissões:**

- `core/permissions.ts`: `PERMISSIONS` (os 20 códigos, na ordem da tabela 3), `type Permission` e `isPermission(value)`. Os rótulos vêm de `GET /api/permissions`.
- `core/services/permission.service.ts` (`PermissionService`), o único ponto de checagem:
  - `permissions`: signal `ReadonlySet<Permission>` derivado de `AuthService.currentUser()`;
  - `hasPermission(p)`, `hasAll(ps)` (vazio = true) e `hasAny(ps)` (vazio = false).

  `AuthService.hasAnyRole` deixa de existir.
- `AuthService`:
  - `UserSession = { username, name, profileName, permissions: Permission[] }`, montada de `CurrentUserResponse`, descartando códigos desconhecidos;
  - `refreshSession(): Observable<UserSession | null>` força `GET /api/auth/me` com `SKIP_GLOBAL_LOADING` e atualiza o signal. Uma chamada em andamento é compartilhada.
- `core/interceptors/auth-error.interceptor.ts` (`authErrorInterceptor`):
  - **401** de qualquer requisição exceto `/api/auth/login`, com sessão ativa: zera a sessão e navega para `/login?redirectTo=<url atual>&reason=expired`. A tela de login mostra "Sua sessão expirou. Entre novamente." em `alert-banner`.
  - **403** de qualquer requisição exceto `/api/auth/*`: chama `refreshSession()` e repassa o erro. Menus e botões se ajustam pelos signals.
  - Telas Perfis e Usuários também chamam `refreshSession()` depois de salvar.

**Rotas e menus:**

- `guards/permission.guard.ts` (`permissionGuard`) substitui `role.guard.ts`.
  - Espera `restoreSession()`, como o `roleGuard` fazia, e lê `route.data.permissions` (todas exigidas).
  - Na falha, redireciona para `firstAllowedRoute()`: a primeira rota de `NAV_GROUPS` cujo `permissions` não é vazio e está todo concedido. Se não houver, vai para `/notificacoes`, o que evita o laço com `/dashboard`.
- `NAV_GROUPS` troca `roles` por `permissions` e ganha "Perfis" (`/perfis`, ícone `shield`) depois de "Usuários". `MODULE_CARDS` é removido por não ter uso.
- Componentes: tabela 3.2. `kanban-bulk-actions` troca a entrada `canManage` por `canUpdatePriority` e `canUpdateAssignee`.

**Padrão comum às telas Perfis, Usuários e Regras:**

- Componentes obrigatórios: `app-page-header`, `app-custom-select` (`placeholder="Selecione o perfil"` nos seletores de perfil), `.checkbox-field` para as caixas, `appModalFocus`, `app-pagination`, `appRowAction`, `empty-state`, `alert-banner`, `modal-feedback`.
- Opções de perfil e catálogo são carregados **uma vez por tela** (`shareReplay`), para não abrir o bloqueador global a cada modal.

**Tela Perfis** (`pages/profiles/`), espelhando `pages/users/`:

- Cabeçalho "Perfis" com o botão "Novo perfil" e busca por nome (debounce de 300 ms).
- Tabela com as colunas Nome, Permissões ("{n} de 20"), Usuários, Atualizado e Ações. Ações:
  - Editar (`pencil`) e Duplicar (`layers`);
  - Excluir (`trash`), bloqueado quando `userCount > 0`, com o motivo "Perfil com usuários vinculados não pode ser excluído.".
- `app-pagination` com "perfil"/"perfis".
- Estados:
  - falha: `empty-state role="alert"` com o botão "Tentar novamente";
  - carga: pop-up global com `aria-busy`, sem texto solto;
  - vazio sem filtro: "Nenhum perfil cadastrado";
  - vazio com filtro: "Nenhum perfil encontrado", com "Limpar busca".
- Modal:
  - campo Nome ("Informe o nome do perfil.");
  - um `fieldset` por módulo, com a legenda do módulo e "{marcadas} de {total}", e uma `.checkbox-field` por permissão;
  - se o catálogo falhar: "Não foi possível carregar as permissões. Tente novamente." em `modal-feedback`, com o envio desabilitado.
- A exclusão confirma num `alertdialog` estreito. O sucesso aparece no `alert-banner--success`.

**Tela Usuários:**

- Seletor de perfil `profileId`, obrigatório ("Selecione o perfil.").
- Seção "Permissões extras", por módulo:
  - as permissões do perfil escolhido aparecem marcadas e desabilitadas, com a dica "Incluída no perfil";
  - ao salvar, envia só as extras que não estão no perfil.
- Filtro "Perfil" pelas opções. A coluna Perfil mostra o nome e "+{n} extras".
- Se as opções ou o catálogo falharem: "Não foi possível carregar os perfis. Tente novamente." em `modal-feedback`, com o envio desabilitado.

**Regras de notificação:** as caixas de destinatário são os perfis de `GET /api/profiles/options`, e o resumo usa `recipientProfiles[].name`.

## 6. Migração e rollback

O histórico real tem V1, V4, V6 e V7. V2, V3 e V5 foram usadas e revertidas (`git log`: NAV-43, NAV-38, NAV-44), por isso não são reaproveitadas.

SQL portável onde não custa: `INSERT … SELECT`, `CONCAT`, `REPLACE` e `DROP CONSTRAINT`, sem `GROUP_CONCAT` e sem id explícito. O que não tem forma portável fica isolado em linhas `MODIFY COLUMN`, cada uma com o comentário equivalente do PostgreSQL.

- **`V8__create_access_profiles.sql`** (expand):
  1. Cria as 3 tabelas de §2, com FKs e índices nomeados.
  2. Insere Administrador/`ADMIN`, Atendimento/`SERVICE_DESK`, Técnico/`TECHNICIAN` e Consulta/`VIEWER`.
  3. Faz um `INSERT … SELECT id, '<código>' FROM access_profiles WHERE legacy_code IN (…)` por permissão da tabela 3.
  4. `ADD COLUMN profile_id`, e `UPDATE` com `legacy_code = role`.
  5. `MODIFY COLUMN profile_id BIGINT NOT NULL` (`-- PostgreSQL: ALTER COLUMN profile_id SET NOT NULL`).
  6. `CREATE INDEX idx_user_accounts_profile`, depois `fk_user_accounts_profile`.
- **`V9__notification_recipient_profiles.sql`** (expand):
  1. Cria `notification_rule_recipient_profiles`.
  2. Faz 4 `INSERT … SELECT`, um por código, com literal fixo. Exemplo: `… WHERE p.legacy_code = 'SERVICE_DESK' AND CONCAT(',', REPLACE(r.recipient_roles, ' ', ''), ',') LIKE '%,SERVICE_DESK,%'`. O literal fixo evita montar o padrão a partir da coluna, onde `_` seria curinga.
  3. Mantém `recipient_roles`.
- **`V10__relax_legacy_role_columns.sql`** (fim do uso pelo código):
  1. `DROP CONSTRAINT ck_user_accounts_role`.
  2. `MODIFY COLUMN role VARCHAR(30) NULL` (`-- PostgreSQL: ALTER COLUMN role DROP NOT NULL`).
  3. `MODIFY COLUMN recipient_roles VARCHAR(120) NULL` (idem).
- **`V11__drop_legacy_role_columns.sql`** (contract, opcional): `DROP COLUMN role` e `DROP COLUMN recipient_roles`. Só entra depois que o dono do produto conferir a implantação.

A futura migração para PostgreSQL terá baseline própria. As V8–V10 evitam SQL exclusivo do MySQL, exceto as linhas de `MODIFY COLUMN`.

Compatibilidade: o SQL precisa rodar em MySQL 8.0 (`compose.yaml`, imagem `mysql:8.0`; `DROP CONSTRAINT` exige 8.0.19+) e no H2 em `MODE=MySQL` dos testes. Cada tarefa que traz migration confere a migration num MySQL 8.0 real, num projeto Docker isolado (plano, "Conferência em MySQL").

**Falha de migration no MySQL.** O DDL do MySQL não é transacional, então uma migration pode ficar aplicada pela metade. Recuperação:

1. restaurar o `mysqldump` tirado antes; ou
2. apagar os objetos criados parcialmente (tabelas, colunas, índices e FKs da versão que falhou) e remover a linha com falha (`DELETE FROM flyway_schema_history WHERE success = 0`, efeito de `flyway repair`);
3. depois, corrigir a migration (ainda não publicada) e reaplicar.

**Rollback manual** (o Flyway Community não tem undo). A implantação exige backup antes da V8, e restaurar esse backup é o caminho preferido. Sem backup, e com as colunas legadas ainda presentes (antes da V11), aplique em ordem:

```sql
UPDATE user_accounts u SET role = CASE
  WHEN (EXISTS (SELECT 1 FROM access_profile_permissions pp WHERE pp.profile_id = u.profile_id AND pp.permission = 'usuarios.gerir')
        OR EXISTS (SELECT 1 FROM user_account_extra_permissions ep WHERE ep.user_id = u.id AND ep.permission = 'usuarios.gerir'))
   AND (EXISTS (SELECT 1 FROM access_profile_permissions pp WHERE pp.profile_id = u.profile_id AND pp.permission = 'perfis.gerir')
        OR EXISTS (SELECT 1 FROM user_account_extra_permissions ep WHERE ep.user_id = u.id AND ep.permission = 'perfis.gerir'))
  THEN 'ADMIN'
  ELSE COALESCE((SELECT p.legacy_code FROM access_profiles p WHERE p.id = u.profile_id), 'VIEWER') END;
ALTER TABLE user_accounts MODIFY COLUMN role VARCHAR(30) NOT NULL;
ALTER TABLE user_accounts ADD CONSTRAINT ck_user_accounts_role CHECK (role IN ('ADMIN', 'TECHNICIAN', 'SERVICE_DESK', 'VIEWER'));
UPDATE notification_rules r SET recipient_roles = CONCAT_WS(',',
  CASE WHEN EXISTS (SELECT 1 FROM notification_rule_recipient_profiles rp JOIN access_profiles p ON p.id = rp.profile_id WHERE rp.rule_id = r.id AND p.legacy_code = 'ADMIN') THEN 'ADMIN' END,
  CASE WHEN EXISTS (SELECT 1 FROM notification_rule_recipient_profiles rp JOIN access_profiles p ON p.id = rp.profile_id WHERE rp.rule_id = r.id AND p.legacy_code = 'SERVICE_DESK') THEN 'SERVICE_DESK' END,
  CASE WHEN EXISTS (SELECT 1 FROM notification_rule_recipient_profiles rp JOIN access_profiles p ON p.id = rp.profile_id WHERE rp.rule_id = r.id AND p.legacy_code = 'TECHNICIAN') THEN 'TECHNICIAN' END,
  CASE WHEN EXISTS (SELECT 1 FROM notification_rule_recipient_profiles rp JOIN access_profiles p ON p.id = rp.profile_id WHERE rp.rule_id = r.id AND p.legacy_code = 'VIEWER') THEN 'VIEWER' END);
ALTER TABLE notification_rules MODIFY COLUMN recipient_roles VARCHAR(120) NOT NULL;
ALTER TABLE user_accounts DROP FOREIGN KEY fk_user_accounts_profile;
DROP INDEX idx_user_accounts_profile ON user_accounts;
ALTER TABLE user_accounts DROP COLUMN profile_id;
DROP TABLE notification_rule_recipient_profiles;
DROP TABLE user_account_extra_permissions;
DROP TABLE access_profile_permissions;
DROP TABLE access_profiles;
DELETE FROM flyway_schema_history WHERE version IN ('8', '9', '10');
```

Depois, volte o código para o commit anterior à etapa. Na reversão:

- quem tinha permissões de administrador volta como `ADMIN`;
- os usuários de perfis personalizados viram `VIEWER`;
- extras e perfis personalizados se perdem.

Depois da V11, o rollback exige o backup.

## 7. Testes (TDD)

**Rede de segurança antes de mudar** (`PermissionEquivalenceIntegrationTest`), escrita e verde sobre o código atual:

- Uma linha por mapeamento de controller (76) mais as linhas não mapeadas (`PATCH /api/products`, `DELETE /api/protocols/templates/{id}`). Os exemplos usam id inexistente ou corpo inválido, para nunca alterar dados.
- Para cada um dos 4 perfis, autentica um usuário real do banco via `NavitasUserDetailsService`:
  - quem pode recebe status diferente de 401/403;
  - quem não pode recebe 403;
  - anônimo recebe 401 fora das rotas públicas.
- A matriz é literal, copiada da regra atual, sem derivar do catálogo.
- `everyHandlerMappingIsInMatrix` percorre `RequestMappingHandlerMapping` (menos `/error`) e falha se algum endpoint faltar na matriz.
- `@BeforeEach` cria os 4 usuários e `@AfterEach` os apaga. O H2 `jdbc:h2:mem:navitas_assist` é compartilhado, e `UserAdminSafetyIntegrationTest` conta administradores ativos.

**Oráculos independentes:**

- A matriz vem do `SecurityConfig` antigo.
- `legacyProfilesMatchMigratedSeed` prova que `LegacyProfiles`, o mapa usado pelos mocks de MockMvc, é igual ao seed migrado.
- Nos componentes do frontend, primeiro só o mock `hasAnyRole` é trocado por `providePermissions(profilePermissions(code))`, com as asserções antigas intactas como oráculo. Só depois entram as checagens novas.

**Migração** (`AccessProfileMigrationTest`): Flyway num H2 próprio até a V7, com usuários dos 4 roles e uma regra editada. Depois aplica V8, V9 e V10, conferindo:

- perfis, permissões e `profile_id` de cada usuário;
- destinatários das regras;
- que as colunas legadas ficam nulas (a V10 aceita NULL);
- os totais 19/11/11/5.

**Permissão efetiva e recálculo:**

- Unidade: perfil ∪ extras, código desconhecido ignorado, `isAdministrator`.
- Integração: Consulta + extra `rma.abrir` pode `POST /api/rmas`; perfil só com `relatorios.ver` recebe 403 em `GET /api/rmas` e 200 em `GET /api/clients`.
- Uma sessão logada recebe a nova permissão na requisição seguinte à edição do perfil, sem 401.
- `SessionRevocationIntegrationTest`: o caso `"role"` vira "authorities atualizadas" (sessões continuam válidas e com o acesso novo).

**Proteção contra bloqueio:** não pode sobrar zero administradores ativos:

- rebaixar, desativar ou excluir o último administrador;
- tirar `usuarios.gerir`/`perfis.gerir` do perfil dele;
- administrador apenas por extras conta; inativo não conta;
- concorrência no mesmo caminho e entre caminhos (tirar `perfis.gerir` do perfil do admin A enquanto se rebaixa o admin B: exatamente uma falha);
- login concorrente com `PUT /api/profiles/{id}`, sem erro.

**Anti-escalada:** `nonAdminCannotGrantPermissionItLacks` em perfis e em usuários, e o caso positivo correspondente.

**API de perfis:** CRUD, validações (inclusive nome duplicado vindo do banco), `userCount`, opções, catálogo e exclusão bloqueada. Os perfis personalizados criados são apagados no `@AfterEach`.

**Frontend:**

- `PermissionService` e `authErrorInterceptor` (401 → login com aviso; 403 → `refreshSession`).
- `permissionGuard`: permitido; negado → primeira rota permitida; nenhuma → `/notificacoes`.
- Menus por permissão; componentes pela tabela 3.2 nos 4 perfis.
- Telas Perfis e Usuários: estados, formulário, duplicar e `refreshSession` depois de salvar.

**Catálogo espelhado:** `PermissionTest` (backend) e `permissions.spec.ts` (frontend) comparam a lista de códigos com a mesma lista literal da tabela 3.

## 8. Fora de escopo

- Escopo de dados e negação por usuário.
- Dependências automáticas entre permissões, e mais de um perfil por usuário.
- Auditoria de alterações de perfis além de `created_by`/`updated_by`, e coluna `access_version`.
- Tradução das mensagens antigas do backend (D10).
- Portabilidade completa para PostgreSQL (baseline própria no futuro).
- A V11, como tarefa opcional e condicionada.
- Mudanças nos relatórios, e-mails e telas além das listadas.

## 9. Riscos

- **R1 Mudança silenciosa de permissão.** Mitigação: matriz com cobertura total escrita antes, seed comparado ao `LegacyProfiles` e asserções antigas preservadas nos componentes.
- **R2 Autobloqueio.** Mitigação: `AdministratorGuard` cobre usuários e perfis com ordem única de locks; o login não trava perfis.
- **R3 Escalada de privilégio** por quem tem só `usuarios.gerir` ou só `perfis.gerir`. Mitigação: regra 4.4.
- **R4 Diferença H2 × MySQL no DDL.** Mitigação: conferência em MySQL 8.0 real a cada migration, em projeto Docker isolado com `mysqldump` antes.
- **R5 Migration parcial no MySQL.** O DDL não é transacional. Mitigação: procedimento de recuperação da seção 6.
- **R6 Perfil personalizado sem `rma.ver`** cai em `/notificacoes`, sem quebrar. Uma tela de aviso fica fora do escopo.
- **R7 Custo do recálculo por requisição** (1 consulta de usuário + perfil + 2 coleções pequenas). Mitigação: tabelas pequenas, e `access_version` como evolução se pesar.
- **R8 Catálogo duplicado** entre backend e frontend. Mitigação: testes espelhados (seção 7).
- **R9 Frontend fora de sincronia entre tarefas.** O `role` provisório nas respostas mantém a leitura funcionando. O cadastro de usuários pela tela antiga só volta a funcionar quando a tela migra, o que só afeta o branch de desenvolvimento.
