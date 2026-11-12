# Permissões por perfil personalizado (etapa 8A): desenho

Data: 2026-11-11. Implementação: `docs/superpowers/plans/2026-11-11-permissoes.md`.

## 1. Objetivo e decisões

Hoje o acesso depende do enum `UserRole` (`ADMIN`, `SERVICE_DESK`, `TECHNICIAN`, `VIEWER`) em `backend/src/main/java/br/com/navitasassist/user/UserRole.java`. As regras estão em `config/SecurityConfig.java:75-105` (`hasRole`/`hasAnyRole`), em regras de negócio que testam o perfil (`UserAccountService`, `NotificationDispatcher`, `NotificationRule.recipientRoles`) e no frontend (`app.routes.ts` `data.roles`, `roleGuard`, `AuthService.hasAnyRole`, `NAV_GROUPS` e `hasAnyRole([...])` em componentes).

Objetivo: trocar o perfil fixo por **perfis personalizados** formados por um conjunto de **permissões de um catálogo fixo**. Os 4 perfis atuais viram perfis prontos e editáveis, com as permissões equivalentes às de hoje. Nada muda para os usuários atuais até um administrador editar um perfil.

Decisões aprovadas pelo usuário:

- O catálogo de permissões é fixo no código. Um perfil tem nome e conjunto de permissões, e pode ser criado, editado, duplicado e apagado na tela **Perfis** (`perfis.gerir`).
- Cada usuário tem 1 perfil e uma lista de **permissões extras**. As extras só acrescentam. Permissão efetiva = permissões do perfil ∪ extras.
- Administrador protegido: sempre existe ao menos um usuário ativo com `usuarios.gerir` **e** `perfis.gerir` efetivas. Não se apaga perfil com usuários.
- Sem escopo de dados: nenhuma permissão restringe *quais* registros se vê.

Decisões tomadas neste desenho. O usuário deve revê-las; elas estão marcadas com **[rever]** onde aparecem:

- D1 **[rever]** Permissão `rma.atribuivel` ("pode ser responsável por RMAs"). Hoje só usuários `TECHNICIAN` aparecem em `/api/users/assignable` e podem ser atribuídos (`UserAccountService.java:58-63`, `:122-132`). A regra passa a depender dessa permissão. Só o perfil Técnico a recebe.
- D2 **[rever]** Leitura por módulo (`rma.ver`, `cadastros.ver`, `pecas.ver`, `protocolos.ver`, `relatorios.ver`). As telas Clientes/Produtos e Protocolos continuam visíveis só para quem as vê hoje: a rota exige leitura **e** edição (`cadastros.ver`+`cadastros.editar`; `protocolos.ver`+`protocolos.catalogo`). A API de leitura continua aberta a quem tem `*.ver`, que hoje são os 4 perfis.
- D3 **[rever]** "Administrador" significa usuário com `usuarios.gerir` e `perfis.gerir`. Rotas de API não classificadas (`/api/**`, hoje `hasRole("ADMIN")`) exigem as duas. Por isso ADMIN continua recebendo 404/405 nessas rotas, e os demais 403.
- D4 **[rever]** Regras de notificação passam a ter **perfis** destinatários, em vez de roles. Apagar um perfil o remove das regras. Isso não muda quem recebe, porque só se apaga perfil sem usuários.
- D5 A visibilidade de notificações (`NotificationVisibilityPolicy`) passa a exigir `rma.ver`. O comentário existente já diz que as notificações expõem dados de RMA. Os 4 perfis têm `rma.ver`, então nada muda para eles.
- D6 **[rever]** A migração remove `user_accounts.role` e `notification_rules.recipient_roles`. Não há rollback automático; a reversão manual está na seção 6.
- D7 Duplicar é só no frontend: abre o formulário de novo perfil já preenchido com "Cópia de {nome}" e as mesmas permissões. Nomes de perfil são únicos sem diferenciar maiúsculas/minúsculas e têm no máximo 60 caracteres.
- D8 **[rever]** Editar as permissões de um perfil revoga as sessões de todos os usuários dele, inclusive a de quem editou. É o mecanismo atual de "alterar perfil revoga sessões" (`AccountSessionRevoker`). Renomear não revoga.
- D9 Um novo usuário não recebe perfil pré-selecionado (hoje o padrão é `SERVICE_DESK`, em `users.component.ts:125`). Escolher o perfil é obrigatório.
- D10 Mensagens de erro já existentes continuam em inglês, iguais, porque testes e telas as usam (ex.: "At least one active administrator must remain."). As mensagens novas são em português.
- D11 Não há dependência entre permissões: `cadastros.editar` não implica `cadastros.ver`. Perfil vazio é permitido. O usuário sem nenhuma tela cai em `/notificacoes`, que só exige login.
- D12 O enum `UserRole` sai do código. A coluna `access_profiles.legacy_code` guarda o código antigo (`ADMIN` etc.) dos 4 perfis migrados, para rastreio, testes e rollback. Ela não aparece na API nem na tela.
- D13 `GET /api/users/summary` mantém os campos `admins` e `roles`, com o mesmo significado: `admins` conta usuários (ativos ou não) com as duas permissões de administrador, e `roles` conta perfis distintos em uso.

## 2. Modelo de dados

Tabelas novas (nomes e tipos exatos; FKs com nome explícito):

| Tabela | Colunas | Restrições |
|:---|:---|:---|
| `access_profiles` | `id BIGINT AUTO_INCREMENT PK`, `name VARCHAR(60) NOT NULL`, `legacy_code VARCHAR(30) NULL`, `created_at`, `updated_at DATETIME(6) NOT NULL`, `created_by`, `updated_by VARCHAR(60)` | `uk_access_profiles_name UNIQUE(name)`, `uk_access_profiles_legacy_code UNIQUE(legacy_code)` |
| `access_profile_permissions` | `profile_id BIGINT NOT NULL`, `permission VARCHAR(60) NOT NULL` | PK `(profile_id, permission)`; FK → `access_profiles` `ON DELETE CASCADE` |
| `user_account_extra_permissions` | `user_id BIGINT NOT NULL`, `permission VARCHAR(60) NOT NULL` | PK `(user_id, permission)`; FK → `user_accounts` `ON DELETE CASCADE` |
| `notification_rule_recipient_profiles` | `rule_id BIGINT NOT NULL`, `profile_id BIGINT NOT NULL` | PK `(rule_id, profile_id)`; FKs → `notification_rules` e `access_profiles`, ambas `ON DELETE CASCADE` |

Alterações: `user_accounts.profile_id BIGINT NOT NULL` com FK `fk_user_accounts_profile` → `access_profiles(id)` (sem cascade). `user_accounts.role` e a restrição `ck_user_accounts_role` são removidas, assim como `notification_rules.recipient_roles`.

Entidades JPA (pacote novo `br.com.navitasassist.access`; repositórios em `repository/`, serviços em `service/`, controllers em `controller/`, como no resto do projeto):

- `AccessProfile extends AuditableEntity`: `id`, `name`, `legacyCode`, `Set<String> permissions`. É um `@ElementCollection(fetch = EAGER)` em `access_profile_permissions.permission`.
- `UserAccount`: perde `role` e ganha `@ManyToOne(optional = false, fetch = EAGER) AccessProfile profile` e `Set<String> extraPermissions`, um `@ElementCollection(fetch = EAGER)` em `user_account_extra_permissions.permission`.
- `NotificationRule`: `Set<UserRole> recipientRoles` vira `@ManyToMany(fetch = EAGER) Set<AccessProfile> recipientProfiles` (`notification_rule_recipient_profiles`). `UserRoleSetConverter` é apagado.

As permissões ficam no banco como texto (código do catálogo). Na gravação, a API recusa códigos fora do catálogo. Na leitura, um código desconhecido (ex.: permissão retirada do catálogo numa versão futura) é ignorado no cálculo da permissão efetiva.

## 3. Catálogo e tabela de equivalência

Catálogo fixo: enum `br.com.navitasassist.access.Permission(code, module, label)`, com módulos no enum `PermissionModule(label)`. As permissões estão na ordem do enum, que é a ordem de exibição. A = Administrador (ADMIN), S = Atendimento (SERVICE_DESK), T = Técnico (TECHNICIAN), V = Consulta (VIEWER): são os perfis migrados e os nomes atuais de `ROLE_LABELS`.

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

A ordem das regras é a atual. Cada linha diz quem acessa hoje e com que permissão passa a acessar.

| Endpoint(s) | Hoje | Depois |
|:---|:---|:---|
| `/health`, `GET /api/auth/csrf`, `POST /api/auth/login` | público | público |
| `GET /api/users/assignable`, `/api/kanban-views/**`, `/api/notifications/**`, `GET /api/auth/me`, `POST /api/auth/logout` | autenticado | autenticado (pessoal) |
| `/api/notification-rules/**` | ADMIN | `notificacoes.regras` |
| `/api/users/**` (exceto assignable) | ADMIN | `usuarios.gerir` |
| `GET /api/reports/rmas` | ADMIN, TECHNICIAN, VIEWER | `relatorios.ver` |
| `GET /api/clients/**`, `GET /api/products/**` | autenticado | `cadastros.ver` |
| `GET /api/rmas/**` (inclui `/api/rmas/*/parts`) | autenticado | `rma.ver` |
| `POST /api/clients`, `POST /api/products`; `PUT /api/clients/*`, `/api/products/*`; `DELETE /api/clients/*`, `/api/products/*` | ADMIN, SERVICE_DESK | `cadastros.editar` |
| `POST /api/rmas` | ADMIN, SERVICE_DESK | `rma.abrir` |
| `PUT /api/rmas/*` | ADMIN, SERVICE_DESK | `rma.editar` |
| `PUT /api/rmas/*/diagnosis` | ADMIN, TECHNICIAN | `rma.diagnosticar` |
| `PATCH /api/rmas/*/status`, `/api/rmas/*/bulk-status` | ADMIN, SERVICE_DESK, TECHNICIAN | `rma.status` |
| `PATCH /api/rmas/*/assignee` | ADMIN, SERVICE_DESK | `rma.responsavel` |
| `POST /api/rmas/*/blocks`, `PATCH /api/rmas/*/blocks/*` | ADMIN, SERVICE_DESK, TECHNICIAN | `rma.impedimentos` |
| `GET /api/parts/**` | autenticado | `pecas.ver` |
| `POST /api/parts`, `PUT /api/parts/*`, `POST /api/parts/*/movements`, `POST /api/parts/movements/*/reversal` | ADMIN, SERVICE_DESK | `pecas.movimentar` |
| `POST /api/rmas/*/parts`, `POST /api/rmas/*/parts/*/*` (reservar, alocar, consumir, cancelar) | ADMIN, TECHNICIAN | `pecas.reservar` |
| `GET /api/protocols/**` | autenticado | `protocolos.ver` |
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
| `kanban.component` prioridade em lote (hoje via `canManage` = `canUpdateAssignee`) | ADMIN, SERVICE_DESK | `canUpdatePriority` = `rma.editar` (entrada nova do `kanban-bulk-actions`) |
| Seleção/ações em lote no Kanban (hoje `canUpdateStatus`) | ADMIN, SERVICE_DESK, TECHNICIAN | qualquer uma de `rma.status`, `rma.editar`, `rma.responsavel` |
| `dashboard.component` resumo de usuários (`isAdmin`) | ADMIN | `usuarios.gerir` |
| `notifications.component` aba Regras (`isAdmin`) | ADMIN | `notificacoes.regras` |
| `parts.component` `canManage` | ADMIN, SERVICE_DESK | `pecas.movimentar` |
| `rma-block-panel` `canEdit` | ADMIN, SERVICE_DESK, TECHNICIAN | `rma.impedimentos` |
| `rma-parts-panel` `canReserve` | ADMIN, TECHNICIAN | `pecas.reservar` |
| `rma-protocols` `canExecute` | ADMIN, TECHNICIAN | `protocolos.executar` |
| Rodapé da lateral (`currentRoleLabel`) | rótulo do role | nome do perfil |

Os 4 perfis migrados produzem exatamente o comportamento atual em todas as linhas das tabelas 3.1 e 3.2. A única ressalva é D3, que também mantém o comportamento atual.

## 4. Backend

### 4.1 Permissão efetiva e autenticação

- `EffectivePermissionService.effectivePermissions(UserAccount) : Set<Permission>` devolve a união de `profile.permissions` com `extraPermissions`, convertida para o catálogo e sem códigos desconhecidos. `isAdministrator(UserAccount)` exige `USUARIOS_GERIR` e `PERFIS_GERIR` e não olha `active`.
- `NavitasUserDetailsService` concede como authorities os códigos efetivos (ex.: `rma.ver`). Não há mais `ROLE_*`.
- `SecurityConfig` usa `hasAuthority`/`hasAnyAuthority` com os códigos de `Permission`, na ordem da tabela 3.1. O catch-all usa `AuthorizationManagers.allOf(hasAuthority(usuarios.gerir), hasAuthority(perfis.gerir))`.
- As authorities são uma foto tirada no login. Qualquer mudança de acesso revoga as sessões afetadas, como já acontece hoje: perfil ou extras do usuário (`UserAccountService.update`) e permissões de um perfil (todos os seus usuários).

### 4.2 API

Contratos JSON. Datas são ISO, e as listas de permissões vêm na ordem do catálogo.

- `GET /api/permissions` → `[{ "module": "RMA", "label": "RMAs", "permissions": [{ "code": "rma.ver", "label": "Ver RMAs, Kanban e dashboard" }, …] }, …]`: os 6 módulos na ordem do enum.
- `GET /api/profiles?query&page&size` → `PageResponse<ProfileResponse>`, ordenado por `lower(name)`, `id`. O `query` procura no nome.
  `ProfileResponse = { id, name, permissions: string[], userCount, createdAt, updatedAt }`.
- `GET /api/profiles/options` → `[{ id, name, permissions: string[] }]`, ordenado por nome.
- `GET /api/profiles/{id}` → `ProfileResponse`. 404 se não existir.
- `POST /api/profiles` (201) e `PUT /api/profiles/{id}` (200), corpo `ProfileRequest = { name: string(1..60, aparado), permissions: string[] }`. Erros 400: nome vazio ou longo (validação); `"Já existe um perfil com o nome {nome}."`; `"Permissão desconhecida: {código}."`; proteção do administrador (4.3).
- `DELETE /api/profiles/{id}` → 204. Com usuários vinculados: 400 `"Perfil possui usuários vinculados e não pode ser excluído."`
- Usuários: `UserAccountRequest`/`UserAccountUpdateRequest` trocam `role` por `profileId: number` (obrigatório) e `extraPermissions: string[]` (opcional; `null` vale `[]`). `UserAccountResponse` troca `role` por `profile: { id, name }` e `extraPermissions: string[]`. O filtro `GET /api/users?role=` vira `profileId=`. Um `profileId` inexistente no cadastro gera 400 `"Perfil não encontrado: {id}."`.
- `POST /api/auth/login` e `GET /api/auth/me` → `CurrentUserResponse = UserAccountResponse + permissions: string[]` (efetivas).
- Regras de notificação: `NotificationRuleRequest.recipientRoles` vira `recipientProfileIds: number[]`, e `NotificationRuleResponse.recipientRoles` vira `recipientProfiles: [{ id, name }]` (ordenado por nome). Id inexistente gera 400 `"Perfil não encontrado: {id}."`.

### 4.3 Proteção do administrador

`AdministratorGuard` (serviço transacional):

- `lockAccessGraph()`: trava, nesta ordem, todos os perfis (`PESSIMISTIC_WRITE`, ordem por id) e depois todos os usuários ativos (ordem por id). Toda operação que pode reduzir acesso chama esse método antes de travar o alvo. Isso substitui `findActiveByRoleForUpdate(UserRole.ADMIN)` em `UserAccountService.java:161-165` e mantém a ordem única de locks.
- `ensureRemainsAfterUserChange(UserAccount atual, AccessProfile novoPerfil, Set<String> novasExtras, boolean novoAtivo)`, `ensureRemainsAfterUserDeletion(UserAccount)` e `ensureRemainsAfterProfileChange(AccessProfile, Set<String> novasPermissoes)` simulam a mudança sobre os usuários ativos travados. Se havia ≥ 1 administrador ativo e passaria a haver 0, lançam `BusinessException("At least one active administrator must remain.")`. Se já havia 0, a mudança passa, para não travar o sistema.
- Usos: atualização e exclusão de usuário, atualização de perfil. A exclusão de perfil não precisa do guard, porque perfil com usuários não é apagado.

## 5. Frontend

- `core/permissions.ts`: `PERMISSIONS` (os 20 códigos, na ordem da tabela 3), `type Permission` e `isPermission(value)`. Os rótulos vêm de `GET /api/permissions`, sem cópia no frontend.
- `core/services/permission.service.ts`: `PermissionService` com `permissions` (signal `ReadonlySet<Permission>` derivado de `AuthService.currentUser()`), `hasPermission(p)`, `hasAll(ps)` (vazio = true) e `hasAny(ps)` (vazio = false). É o único ponto de checagem; `AuthService.hasAnyRole` deixa de existir.
- `AuthService`: `UserSession = { username, name, profileName, permissions: Permission[] }`, montada de `CurrentUserResponse`, descartando códigos desconhecidos.
- `guards/permission.guard.ts` (`permissionGuard`) substitui `role.guard.ts`. Lê `route.data.permissions` (todas exigidas). Quando falha, redireciona para a primeira rota de `NAV_GROUPS` permitida ou, se nenhuma for, para `/notificacoes` (D11). Isso evita o laço com `/dashboard`.
- `NAV_GROUPS` troca `roles` por `permissions` e ganha "Perfis" (`/perfis`, ícone `shield`) depois de "Usuários". `MODULE_CARDS` é removido, porque não tem uso.
- Componentes: a tabela 3.2. `kanban-bulk-actions` troca a entrada `canManage` por `canUpdatePriority` e `canUpdateAssignee`.
- Tela **Perfis** (`pages/profiles/`), no mesmo padrão de `pages/users/`:
  - Cabeçalho "Perfis" com o botão "Novo perfil" e busca por nome (debounce de 300 ms, como as demais listas).
  - Tabela com Nome, Permissões ("{n} de 20"), Usuários, Atualizado e Ações. As ações são Editar (`pencil`), Duplicar (`layers`) e Excluir (`trash`, bloqueado com o motivo "Perfil com usuários vinculados não pode ser excluído." quando `userCount > 0`).
  - `app-pagination` com "perfil"/"perfis".
  - Estados: falha em `empty-state role="alert"` com "Tentar novamente"; carga pelo pop-up global com `aria-busy`; vazio sem filtro "Nenhum perfil cadastrado"; vazio com filtro "Nenhum perfil encontrado" com "Limpar busca". Não há texto solto de carregamento.
  - Modal com `appModalFocus`: Nome, e um `fieldset` por módulo (legenda = rótulo do módulo, com "{marcadas} de {total}") com uma caixa por permissão. Ao editar perfil com usuários, mostra a dica "Usuários com este perfil precisarão entrar novamente." (D8).
  - Exclusão confirma num `alertdialog` estreito, como em Usuários. Sucesso aparece no banner `alert-banner--success`; erros do servidor, em `modal-feedback`.
- Tela **Usuários**:
  - O seletor de perfil (`profileId`, obrigatório, mensagem "Selecione o perfil.") usa `GET /api/profiles/options`.
  - A seção "Permissões extras" agrupa por módulo. As permissões do perfil escolhido aparecem marcadas e desabilitadas com a dica "Incluída no perfil"; as outras podem ser marcadas.
  - Ao salvar, envia só as extras que não estão no perfil.
  - O filtro "Perfil" usa as opções de perfil. A coluna Perfil mostra o nome e, se houver extras, "+{n} extras".
  - Se as opções ou o catálogo não carregarem, o modal mostra "Não foi possível carregar os perfis. Tente novamente." em `modal-feedback` e desabilita o envio.
- **Regras de notificação**: as caixas de destinatário passam a ser os perfis de `GET /api/profiles/options`, e o resumo usa `recipientProfiles[].name`.

## 6. Migração e rollback

As migrations Flyway seguem o histórico real. Existem V1, V4, V6 e V7. V2, V3 e V5 foram usadas e revertidas (`git log`: NAV-43, NAV-38 e NAV-44), então os números não são reaproveitados.

- `V8__create_access_profiles.sql`:
  1. Cria `access_profiles`, `access_profile_permissions` e `user_account_extra_permissions`.
  2. Insere Administrador/`ADMIN`, Atendimento/`SERVICE_DESK`, Técnico/`TECHNICIAN` e Consulta/`VIEWER`, sem id explícito.
  3. Insere as permissões da tabela 3, com um `INSERT … SELECT id, '<código>' FROM access_profiles WHERE legacy_code IN (…)` por permissão.
  4. Adiciona `user_accounts.profile_id` e preenche com `legacy_code = role`.
  5. Torna a coluna `NOT NULL` (`MODIFY COLUMN`) e cria `fk_user_accounts_profile`. A coluna `role` fica até a V10.
- `V9__notification_recipient_profiles.sql`:
  1. Cria `notification_rule_recipient_profiles`.
  2. Preenche a partir do CSV com `CONCAT(',', REPLACE(recipient_roles, ' ', ''), ',') LIKE CONCAT('%,', legacy_code, ',%')`.
  3. Remove `recipient_roles`.
- `V10__drop_user_role.sql`: `ALTER TABLE user_accounts DROP CONSTRAINT ck_user_accounts_role;` e depois `DROP COLUMN role`.

A divisão em três arquivos acompanha a ordem do plano. Cada migration entra quando o código deixa de usar a coluna antiga. As três saem juntas na mesma versão.

Compatibilidade: o SQL precisa rodar em MySQL 8.0 (`compose.yaml`, imagem `mysql:8.0`; `DROP CONSTRAINT` exige 8.0.19+, coberto pela imagem atual) e no H2 em `MODE=MySQL` dos testes. A conferência em MySQL real faz parte do plano.

Rollback (manual; Flyway Community não tem undo). Pré-requisito da implantação: backup do banco antes de aplicar a V8. Restaurar esse backup é o caminho preferido. Sem backup, aplique em ordem a reversão abaixo e volte o código para o commit anterior à etapa:

```sql
ALTER TABLE user_accounts ADD COLUMN role VARCHAR(30) NULL;
UPDATE user_accounts u SET role = COALESCE((SELECT p.legacy_code FROM access_profiles p WHERE p.id = u.profile_id), 'VIEWER');
ALTER TABLE user_accounts MODIFY COLUMN role VARCHAR(30) NOT NULL;
ALTER TABLE user_accounts ADD CONSTRAINT ck_user_accounts_role CHECK (role IN ('ADMIN', 'TECHNICIAN', 'SERVICE_DESK', 'VIEWER'));
ALTER TABLE notification_rules ADD COLUMN recipient_roles VARCHAR(120) NOT NULL DEFAULT '';
UPDATE notification_rules r SET recipient_roles = COALESCE((SELECT GROUP_CONCAT(p.legacy_code ORDER BY p.legacy_code SEPARATOR ',') FROM notification_rule_recipient_profiles rp JOIN access_profiles p ON p.id = rp.profile_id WHERE rp.rule_id = r.id AND p.legacy_code IS NOT NULL), '');
ALTER TABLE user_accounts DROP FOREIGN KEY fk_user_accounts_profile;
ALTER TABLE user_accounts DROP COLUMN profile_id;
DROP TABLE notification_rule_recipient_profiles;
DROP TABLE user_account_extra_permissions;
DROP TABLE access_profile_permissions;
DROP TABLE access_profiles;
DELETE FROM flyway_schema_history WHERE version IN ('8', '9', '10');
```

Na reversão, usuários de perfis personalizados viram `VIEWER`, e as extras e os perfis personalizados se perdem. Depois dela, confira se ainda existe um `ADMIN` ativo.

## 7. Testes (TDD)

- **Rede de segurança antes de mudar** (`PermissionEquivalenceIntegrationTest`): escrita e verde sobre o código atual.
  - Para cada linha da tabela 3.1 (método + caminho de exemplo com ids inexistentes ou corpo inválido, para nunca alterar dados) e cada um dos 4 perfis, o teste autentica um usuário real do banco via `NavitasUserDetailsService`.
  - Quem pode recebe status diferente de 401/403; quem não pode recebe 403. Anônimo recebe 401 fora das rotas públicas.
  - A matriz esperada é literal, copiada da regra atual, e não é derivada do catálogo. Continua idêntica depois da troca; só a criação dos usuários muda quando o perfil vira tabela.
- **Migração** (`AccessProfileMigrationTest`): Flyway num H2 próprio até a V7, com usuários dos 4 roles e as regras-semente. Depois migra até a V8, V9 e V10.
  - Confere os perfis, as permissões exatas da tabela 3 (comparadas a `LegacyProfiles`, mapa de teste usado também pelos testes de MockMvc) e `profile_id` de cada usuário.
  - Confere os destinatários das regras, exemplo `RMA_CREATED` → {Administrador, Atendimento}, e que as colunas antigas sumiram.
- **Permissão efetiva**: unidade (perfil ∪ extras; código desconhecido ignorado; `isAdministrator`) e integração (Consulta + extra `rma.abrir` pode `POST /api/rmas`; perfil só com `relatorios.ver` recebe 403 em `GET /api/rmas`).
- **Proteção contra bloqueio**: os casos abaixo não podem deixar o sistema sem administrador.
  - Rebaixar, desativar ou excluir o último administrador.
  - Tirar `usuarios.gerir` ou `perfis.gerir` do perfil do último administrador.
  - Um administrador apenas por extras conta como administrador.
  - Administrador inativo não conta.
  - Concorrência: duas reduções simultâneas não deixam 0 administradores (padrão de `UserAdminSafetyIntegrationTest`).
- **API de perfis**: CRUD, validações, `userCount`, opções, catálogo, revogação de sessão ao mudar permissões (e não ao renomear) e exclusão bloqueada.
- **Frontend**: `PermissionService`, `permissionGuard` (permitido; negado → primeira rota permitida; nenhuma → `/notificacoes`), menus por permissão e, por componente, a tabela 3.2 para os 4 perfis.
  - Os perfis vêm de `testing/permission-fixtures.ts`, `LEGACY_PROFILE_PERMISSIONS`, com o mesmo conteúdo de `LegacyProfiles`.
  - Telas Perfis e Usuários: estados, formulário e duplicar.
- **Catálogo espelhado**: `PermissionTest` (backend) e `permissions.spec.ts` (frontend) comparam a lista de códigos com a mesma lista literal da tabela 3. Mudar o catálogo de um lado só quebra um dos testes.

## 8. Fora de escopo

- Escopo de dados (ex.: "ver só meus RMAs") e negação por usuário (a permissão extra só acrescenta).
- Dependências automáticas entre permissões, e mais de um perfil por usuário.
- Histórico/auditoria de alterações de perfis além de `created_by`/`updated_by`.
- Traduzir as mensagens antigas do backend (D10).
- Portabilidade para PostgreSQL (projeto futuro de hospedagem): o SQL usa `MODIFY COLUMN` do MySQL.
- Mudanças nos relatórios, e-mails e telas além das listadas.

## 9. Riscos

- **R1 Mudança silenciosa de permissão.** Mitigação: a matriz de equivalência é escrita antes e continua verde, e a migração é comparada à tabela 3.
- **R2 Autobloqueio.** Mitigação: `AdministratorGuard` cobre usuários e perfis, com locks em ordem única.
- **R3 Sessões derrubadas em massa ao editar perfil (D8)**, inclusive a do próprio administrador. Mitigação: a dica no modal; o comportamento é o já documentado para mudança de perfil.
- **R4 Diferença H2 × MySQL no DDL** (`MODIFY COLUMN`, `DROP CONSTRAINT`, `CONCAT … LIKE`). Mitigação: conferência das migrations num MySQL 8.0 real (Docker) antes de concluir.
- **R5 Migração irreversível no próprio Flyway (D6).** Mitigação: backup e o SQL de reversão da seção 6.
- **R6 Perfil personalizado incoerente** (ação sem leitura, ou perfil vazio). Ele gera 403 ou cai em `/notificacoes`, sem quebrar o sistema. Uma tela de aviso fica fora do escopo.
- **R7 Cargas EAGER** (perfil + 2 coleções) nos locks `PESSIMISTIC_WRITE` do login. São tabelas pequenas. Se o Hibernate recusar `FOR UPDATE` com join de coleção, use `@Fetch(FetchMode.SELECT)` nas coleções.
- **R8 Catálogo duplicado** entre backend e frontend. Mitigação: os testes espelhados da seção 7.
