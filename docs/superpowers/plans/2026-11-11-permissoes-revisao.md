# Revisão independente da spec e do plano de permissões (etapa 8A) — a aplicar

> **Nota (13 nov 2026): migrações zeradas.** Não havia dados em produção, só dados de teste, e as migrações V1–V10 foram substituídas por uma única `V1__baseline.sql` com o schema final. As colunas legadas `user_accounts.role` e `notification_rules.recipient_roles` não existem mais, então não há V11 de remoção nem rollback manual: o que este documento diz sobre V8–V11, expand/contract, backup antes da V8 e rollback fica só como histórico. Perfis prontos, permissões, extras e destinatários por perfil continuam iguais, semeados pela baseline.

Origem: revisão por leitura do código real. Tudo abaixo DEVE ser aplicado à spec (`docs/superpowers/specs/2026-11-11-permissoes-design.md`) e ao plano (`docs/superpowers/plans/2026-11-11-permissoes.md`). Decisões do dono do produto (delegadas): aceitar todas as correções; D8 muda; D6 vira expand/contract.

## Decisões finais
- D1 aprovar (`rma.atribuivel`). D3 aprovar + regra anti-escalada (item 1). D4 aprovar. D5, D7, D9, D10, D11, D12, D13 mantidas.
- **D2 alterada:** `GET /api/clients/**`, `/api/products/**`, `/api/parts/**`, `/api/protocols/**` continuam `authenticated()` como hoje (dashboard, relatórios, ordens de serviço e painéis dependem dessas leituras: `dashboard.component.ts:299-303`, `reports.component.ts:81`). `cadastros.ver`, `pecas.ver`, `protocolos.ver` passam a controlar só menu e rota (continua exigindo ver+editar para as telas Clientes/Produtos/Protocolos, como hoje). `rma.ver` e `relatorios.ver` continuam controlando a API. Ajustar spec L21, §3.1 L95/L104/L107 e remover a parte do R6 que deixa de existir.
- **D6 alterada (expand/contract):** a V10 NÃO apaga `user_accounts.role` nem `notification_rules.recipient_roles`: remove o CHECK e o NOT NULL (tornam-se colunas legadas nulas, sem uso pelo código) e apaga as colunas numa migração posterior (V11, em tarefa separada e opcional, só depois da conferência do dono). Rollback com mapeamento correto de ADMIN (item 13). Backup obrigatório antes da V8.
- **D8 trocada:** em vez de revogar sessões ao editar perfil/extras, um `OncePerRequestFilter` logo depois de `SecurityContextHolderFilter` recalcula as permissões efetivas a cada requisição autenticada (usuário + perfil EAGER; se o custo pesar, `access_version`), troca a `Authentication` por uma com as authorities novas e grava com `securityContextRepository.saveContext` (`requireExplicitSave` está ligado). O frontend chama `/api/auth/me` ao receber 403 e depois de salvar perfil/usuário e atualiza a sessão. Revogação só ao desativar, excluir ou mudar senha/usuário. Atualizar o caso `"role"` de `SessionRevocationIntegrationTest` para "authorities atualizadas". Somem R3 e a dica do modal. Adicionar mesmo assim o `authErrorInterceptor` (item 4).

## Itens por severidade
ALTO
1. **Escalada de privilégio:** §4.3 e Tasks 6/8: quem não é administrador (tem só `usuarios.gerir` ou só `perfis.gerir`) só pode atribuir perfil, extras ou permissões de perfil contidos nas PRÓPRIAS permissões efetivas; senão 400 `Você não pode conceder permissões que não possui.` Testes `nonAdminCannotGrantPermissionItLacks` nas Tasks 6 e 8.
2. D2 (acima).
3. **Matriz polui H2 compartilhado (plano L96):** `@BeforeEach` cria os 4 usuários e `@AfterEach` os apaga; idem `AdministratorGuardIntegrationTest`, `EffectivePermissionIntegrationTest`, `ProfileControllerIntegrationTest` (inclui perfis personalizados criados). Motivo: `UserAdminSafetyIntegrationTest` faz `assertEquals(1, activeAdmins())`; banco `jdbc:h2:mem:navitas_assist;DB_CLOSE_DELAY=-1` é compartilhado.
4. **Sem tratamento de 401 no frontend:** Task 10 ganha `authErrorInterceptor`: 401 fora de `/api/auth/login` zera a sessão e navega para `/login?redirectTo=<url>` com aviso "Sua sessão expirou. Entre novamente."

MÉDIO
5. **App quebrado entre T8 e T16:** T8 e T9 devolvem `role: legacyCode|null` provisório (removido na T17) para o frontend antigo continuar funcionando; ajustar T9 (L338 exigia `$.role` ausente) e a frase "ordem que mantém tudo verde" (L582).
6. **`firstAllowedRoute` (plano L390/L393, spec L191):** é a primeira rota de `NAV_GROUPS` com `permissions` não vazio e permitidas; senão `/notificacoes`. O guard espera `restoreSession()` como `roleGuard`.
7. **Ordem de locks (spec L182, plano L196):** o lock do login trava só `user_accounts` (consulta sem join); perfil e coleções são lidos depois, sem lock; `lockAccessGraph` trava perfis→usuários. Teste: login concorrente com `PUT /api/profiles/{id}` sem erro. Em R7 trocar "Se o Hibernate recusar…" por esse requisito.
8. **Kanban (plano L413):** `toggleBulkSelection`, `selectVisibleRmas` (`kanban.component.ts:344,349`) e `[bulkSelectionEnabled]` (`.html:272`) passam a `canBulkEdit`; `kanban.component.profiles.spec.ts` é "Modify" na Task 12.
9. **Migrations em MySQL real em cada tarefa (T3, T7, T8):** projeto Docker isolado (`docker compose -p navitas-mig`, volume próprio, nunca o `mysql_data` do desenvolvedor), com `mysqldump` antes. Descrever como obter "dados da V7": subir o commit `ec26e91`, inserir 4 usuários (um por role) e editar uma regra, depois trocar de branch. Acrescentar à §6 a recuperação de migration falha (DDL do MySQL não é transacional): apagar objetos parciais e `flyway repair`.
10. **README.md:340 (Contas de acesso):** o INSERT do primeiro admin passa a `INSERT … (…, profile_id) VALUES (…, (SELECT id FROM access_profiles WHERE legacy_code = 'ADMIN'))`; incluir na Task 17 (L563).
11. **Nome único (spec L26/L40):** violação de `uk_access_profiles_name` vira 400 com a mesma mensagem (tratar `DataIntegrityViolationException` no `RestExceptionHandler`); no MySQL nomes que diferem só por acento também conflitam (collation `utf8mb4_0900_ai_ci`).
12. **Task 8 dividida:** 8a (API `profileId`/extras, gravando `role = legacyCode ?: 'VIEWER'` como ponte) e 8b (V10 expand, remoção de `UserRole` do código e do teste `config/EnumPersistenceIntegrationTest.shouldStoreEveryRoleAsItsName` linhas ~104-110, limpeza de `findAllByActiveTrueAndRoleNotOrderByFullNameAsc`).
13. **Rollback (spec L229-247):** `UPDATE … SET role = CASE WHEN <perfil ou extras têm usuarios.gerir E perfis.gerir> THEN 'ADMIN' ELSE COALESCE(legacy_code,'VIEWER') END` para não deixar o sistema sem ADMIN.
14. **Oráculo independente:** `AccessProfileMigrationTest` e os testes de componente não podem usar a mesma tabela §3 (`LegacyProfiles`, `LEGACY_PROFILE_PERMISSIONS`) como único oráculo: nas Tasks 12 e 13, primeiro trocar só o mock `hasAnyRole` por `providePermissions(profilePermissions(code))`, sem mudar asserções (as asserções antigas são o oráculo). A matriz cobre os 76 mapeamentos (faltam: `POST /api/kanban-views`, `PATCH /api/kanban-views/1/default`, `POST /api/notifications/read-all`, `GET /api/rmas/1/parts`, `POST …/consume` e `…/cancel`, `GET /api/parts/1/movements`, `GET /api/protocols/rmas/1/executions`) e um teste percorre `RequestMappingHandlerMapping` e falha se algum endpoint não estiver na matriz.

BAIXO
15. Plano L180: remover o fallback `WebExpressionAuthorizationManager` (`allOf` existe no Spring Security 6.2.4); se a inferência de tipos falhar usar `AuthorizationManagers.<RequestAuthorizationContext>allOf(...)`.
16. Plano L212: "sem mudança de asserções" (Task 3 troca `setRole` em `UserAdminSafetyIntegrationTest`).
17. Task 10 (L373): o `git add` inclui `pages/login/login.component.spec.ts` e `login-submissions.spec.ts` (fixtures `AuthUserResponse` com `profile` e `permissions`).
18. Plano L20: componentes obrigatórios `app-page-header`, `app-custom-select` (`placeholder="Selecione o perfil"`) e `.checkbox-field`; carregar opções e catálogo uma vez por tela com `shareReplay` (evita abrir o bloqueador global a cada modal).
19. Teste de concorrência entre caminhos: um tira `perfis.gerir` do perfil do admin A enquanto outro rebaixa o admin B; resultado: exatamente uma falha.
20. V9 (spec L221): 4 `INSERT … SELECT` com literal fixo (`LIKE '%,SERVICE_DESK,%'`), pois `_` é curinga.

## Migrações e portabilidade (Postgres/Supabase no futuro)
- Nomear todas as FKs: `fk_access_profile_permissions_profile`, `fk_user_extra_permissions_user`, `fk_rule_recipient_profiles_rule`, `fk_rule_recipient_profiles_profile`; índices explícitos `idx_user_accounts_profile (profile_id)` e `idx_rule_recipient_profiles_profile (profile_id)` antes das FKs.
- SQL portável onde não custa: `INSERT … SELECT`, `CONCAT`, `REPLACE`, `DROP CONSTRAINT`, sem `GROUP_CONCAT`, sem id explícito. Isolar numa única linha comentada o que não tem forma portável: `MODIFY COLUMN profile_id BIGINT NOT NULL` com o comentário `-- PostgreSQL: ALTER COLUMN profile_id SET NOT NULL`.
- Spec L277: "Postgres terá baseline própria; V8-V10 evitam SQL exclusivo do MySQL, exceto a linha de NOT NULL."

## Correções de texto pontuais
- Spec L182: "o login não trava perfis (item 7)". Spec L191: regra do item 6. Spec L251-254: cleanup do item 3 e cobertura do item 14. Plano L99-106: linhas extras da matriz. Plano L139-146: nomes de FK e índices. Plano L563: incluir `README.md:340`. Plano L567: mover a conferência em MySQL para T3, T7 e T8.

## Corretos (não mexer)
Tabela §3.1 vs `SecurityConfig.java:76-104` (30 regras, 76 mapeamentos), totais A=19/S=11/T=11/V=5, checagens fora do SecurityConfig, `AuthorizationManagers.allOf` no Spring Security 6.2.4, viabilidade da troca de 224 `.roles(...)` por `asProfile(...)` (a 224ª é manual em `NotificationIntegrationTest.java:365`), matriz da Task 2 verde no código atual, D13, seeds da V6.
