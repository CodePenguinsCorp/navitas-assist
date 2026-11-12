package br.com.navitasassist.access;

import static br.com.navitasassist.access.AccessTestSupport.asProfile;
import static org.hamcrest.Matchers.contains;
import static org.hamcrest.Matchers.hasItem;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.reset;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.Callable;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;

import br.com.navitasassist.auth.NavitasUserDetailsService;
import br.com.navitasassist.repository.AccessProfileRepository;
import br.com.navitasassist.repository.UserAccountRepository;
import br.com.navitasassist.service.EffectivePermissionService;
import br.com.navitasassist.user.UserAccount;
import br.com.navitasassist.user.UserAccountTestSupport;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.SpyBean;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockHttpSession;
import org.springframework.security.core.session.SessionRegistry;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.request.RequestPostProcessor;

@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
class ProfileControllerIntegrationTest {

    private static final String PREFIX = "Teste perfis ";
    private static final String ADMIN_MESSAGE = "At least one active administrator must remain.";
    private static final String GRANT_MESSAGE = "Você não pode conceder permissões que não possui.";
    private static final String MEMBER = "profiles.member";
    private static final String MANAGER = "profiles.manager";
    private static final String ADMIN_A = "profiles.admin.a";
    private static final String ADMIN_B = "profiles.admin.b";

    @Autowired private MockMvc mvc;
    @Autowired private ObjectMapper mapper;
    @Autowired private UserAccountRepository users;
    @SpyBean private AccessProfileRepository profiles;
    @Autowired private PasswordEncoder passwordEncoder;
    @Autowired private NavitasUserDetailsService userDetailsService;
    @Autowired private EffectivePermissionService effectivePermissions;
    @Autowired private SessionRegistry sessionRegistry;
    private final List<MockHttpSession> sessions = new ArrayList<>();
    private UserAccount admin;

    @BeforeEach
    void prepare() {
        cleanup();
        admin = users.findByUsernameIgnoreCase("admin").orElseThrow();
    }

    @AfterEach
    void cleanup() {
        reset(profiles);
        for (MockHttpSession session : sessions) {
            sessionRegistry.removeSessionInformation(session.getId());
            if (!session.isInvalid()) session.invalidate();
        }
        sessions.clear();
        AccessTestSupport.deleteAccounts(users, MEMBER, MANAGER, ADMIN_A, ADMIN_B);
        profiles.findAll().stream().filter(profile -> profile.getName().toLowerCase().startsWith(PREFIX.toLowerCase())).forEach(profiles::delete);
        profiles.flush();
        AccessProfile adminProfile = profiles.findByLegacyCode("ADMIN").orElseThrow();
        adminProfile.setPermissions(new HashSet<>(LegacyProfiles.PERMISSIONS.get("ADMIN")));
        profiles.saveAndFlush(adminProfile);
        UserAccount seed = UserAccountTestSupport.ensureAdmin(users, profiles, passwordEncoder);
        AccessTestSupport.assignProfile(profiles, seed, "ADMIN");
        seed.setExtraPermissions(new HashSet<>());
        seed.setActive(true);
        users.saveAndFlush(seed);
    }

    // Listagem e catálogo

    @Test
    void listsPagedWithUserCount() throws Exception {
        AccessProfile used = AccessTestSupport.saveProfile(profiles, PREFIX + "B usado", "rma.ver", "relatorios.ver");
        AccessTestSupport.saveProfile(profiles, PREFIX + "a vazio");
        AccessTestSupport.saveAccountWithProfile(users, passwordEncoder, MEMBER, used, Set.of());

        mvc.perform(get("/api/profiles").param("query", "teste PERFIS").param("size", "1").with(asProfile("admin", "ADMIN")))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.totalElements").value(2))
            .andExpect(jsonPath("$.totalPages").value(2))
            .andExpect(jsonPath("$.content[0].name").value(PREFIX + "a vazio"))
            .andExpect(jsonPath("$.content[0].userCount").value(0))
            .andExpect(jsonPath("$.content[0].permissions.length()").value(0));
        mvc.perform(get("/api/profiles").param("query", "teste perfis").param("page", "1").param("size", "1").with(asProfile("admin", "ADMIN")))
            .andExpect(jsonPath("$.content[0].name").value(PREFIX + "B usado"))
            .andExpect(jsonPath("$.content[0].userCount").value(1))
            .andExpect(jsonPath("$.content[0].permissions", contains("rma.ver", "relatorios.ver")))
            .andExpect(jsonPath("$.content[0].createdAt").isNotEmpty())
            .andExpect(jsonPath("$.content[0].updatedAt").isNotEmpty());
        mvc.perform(get("/api/profiles/{id}", used.getId()).with(asProfile("admin", "ADMIN")))
            .andExpect(status().isOk()).andExpect(jsonPath("$.userCount").value(1));
        mvc.perform(get("/api/profiles/{id}", 999999).with(asProfile("admin", "ADMIN")))
            .andExpect(status().isNotFound());
    }

    @Test
    void optionsSortedByNameWithPermissions() throws Exception {
        JsonNode options = json(mvc.perform(get("/api/profiles/options").with(asProfile("admin", "ADMIN")))
            .andExpect(status().isOk()).andReturn().getResponse().getContentAsString(StandardCharsets.UTF_8));
        List<String> legacy = new ArrayList<>();
        for (JsonNode option : options) {
            String name = option.get("name").asText();
            if (List.of("Administrador", "Atendimento", "Consulta", "Técnico").contains(name)) legacy.add(name);
            if (name.equals("Consulta")) {
                assertEquals(List.of("rma.ver", "cadastros.ver", "pecas.ver", "protocolos.ver", "relatorios.ver"),
                    mapper.convertValue(option.get("permissions"), List.class));
                assertNotNull(option.get("id"));
            }
        }
        assertEquals(List.of("Administrador", "Atendimento", "Consulta", "Técnico"), legacy);
        // Quem cadastra usuários ou regras de notificação também lê as opções de perfil.
        mvc.perform(get("/api/profiles/options").with(user("rules").authorities(authorities("notificacoes.regras")))).andExpect(status().isOk());
        mvc.perform(get("/api/profiles/options").with(user("users").authorities(authorities("usuarios.gerir")))).andExpect(status().isOk());
        mvc.perform(get("/api/profiles/options").with(asProfile("desk", "SERVICE_DESK"))).andExpect(status().isForbidden());
        mvc.perform(get("/api/profiles").with(user("users").authorities(authorities("usuarios.gerir")))).andExpect(status().isForbidden());
    }

    @Test
    void catalogReturnsSixModulesInOrder() throws Exception {
        mvc.perform(get("/api/permissions").with(user("users").authorities(authorities("usuarios.gerir"))))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.length()").value(6))
            .andExpect(jsonPath("$[*].module", contains("RMA", "CADASTROS", "PECAS", "PROTOCOLOS", "RELATORIOS", "ADMINISTRACAO")))
            .andExpect(jsonPath("$[0].label").value("RMAs"))
            .andExpect(jsonPath("$[0].permissions.length()").value(8))
            .andExpect(jsonPath("$[0].permissions[5].code").value("rma.atribuivel"))
            .andExpect(jsonPath("$[0].permissions[5].label").value("Pode ser responsável por RMAs"))
            .andExpect(jsonPath("$[5].permissions[*].code", contains("usuarios.gerir", "perfis.gerir", "notificacoes.regras")));
        mvc.perform(get("/api/permissions").with(user("rules").authorities(authorities("notificacoes.regras")))).andExpect(status().isForbidden());
    }

    // Criação e validação

    @Test
    void createsAndTrimsName() throws Exception {
        mvc.perform(post("/api/profiles").with(asProfile("admin", "ADMIN")).with(csrf()).contentType(MediaType.APPLICATION_JSON)
                .content(body("   " + PREFIX + "Novo   ", "relatorios.ver", "rma.ver")))
            .andExpect(status().isCreated())
            .andExpect(jsonPath("$.name").value(PREFIX + "Novo"))
            .andExpect(jsonPath("$.permissions", contains("rma.ver", "relatorios.ver")))
            .andExpect(jsonPath("$.userCount").value(0))
            .andExpect(jsonPath("$.id").isNumber());
        assertTrue(profiles.findByNameIgnoreCase(PREFIX + "Novo").isPresent());
    }

    @Test
    void rejectsBlankOrLongName() throws Exception {
        mvc.perform(post("/api/profiles").with(asProfile("admin", "ADMIN")).with(csrf()).contentType(MediaType.APPLICATION_JSON)
                .content(body("   ")))
            .andExpect(status().isBadRequest()).andExpect(jsonPath("$.message").value("Validation failed"));
        mvc.perform(post("/api/profiles").with(asProfile("admin", "ADMIN")).with(csrf()).contentType(MediaType.APPLICATION_JSON)
                .content(body(PREFIX + "x".repeat(61 - PREFIX.length()))))
            .andExpect(status().isBadRequest()).andExpect(jsonPath("$.message").value("Validation failed"));
        mvc.perform(post("/api/profiles").with(asProfile("admin", "ADMIN")).with(csrf()).contentType(MediaType.APPLICATION_JSON)
                .content("{\"name\":\"" + PREFIX + "sem lista\"}"))
            .andExpect(status().isBadRequest()).andExpect(jsonPath("$.message").value("Validation failed"));
    }

    @Test
    void rejectsDuplicateNameIgnoringCase() throws Exception {
        mvc.perform(post("/api/profiles").with(asProfile("admin", "ADMIN")).with(csrf()).contentType(MediaType.APPLICATION_JSON)
                .content(body("  consulta ", "rma.ver")))
            .andExpect(status().isBadRequest()).andExpect(jsonPath("$.message").value("Já existe um perfil com o nome consulta."));
        AccessProfile own = AccessTestSupport.saveProfile(profiles, PREFIX + "Próprio", "rma.ver");
        mvc.perform(put("/api/profiles/{id}", own.getId()).with(asProfile("admin", "ADMIN")).with(csrf()).contentType(MediaType.APPLICATION_JSON)
                .content(body("TÉCNICO", "rma.ver")))
            .andExpect(status().isBadRequest()).andExpect(jsonPath("$.message").value("Já existe um perfil com o nome TÉCNICO."));
        // Manter o próprio nome (até em outra caixa) não é duplicidade.
        mvc.perform(put("/api/profiles/{id}", own.getId()).with(asProfile("admin", "ADMIN")).with(csrf()).contentType(MediaType.APPLICATION_JSON)
                .content(body((PREFIX + "PRÓPRIO").toLowerCase(), "rma.ver")))
            .andExpect(status().isOk()).andExpect(jsonPath("$.name").value((PREFIX + "PRÓPRIO").toLowerCase()));
    }

    @Test
    void translatesUniqueViolationToDuplicateMessage() throws Exception {
        doThrow(new DataIntegrityViolationException("uk_access_profiles_name")).when(profiles).saveAndFlush(any(AccessProfile.class));
        mvc.perform(post("/api/profiles").with(asProfile("admin", "ADMIN")).with(csrf()).contentType(MediaType.APPLICATION_JSON)
                .content(body(PREFIX + "Corrida", "rma.ver")))
            .andExpect(status().isBadRequest())
            .andExpect(jsonPath("$.message").value("Já existe um perfil com o nome " + PREFIX + "Corrida."));
    }

    @Test
    void rejectsUnknownPermission() throws Exception {
        mvc.perform(post("/api/profiles").with(asProfile("admin", "ADMIN")).with(csrf()).contentType(MediaType.APPLICATION_JSON)
                .content(body(PREFIX + "Inválido", "rma.ver", "modulo.inexistente")))
            .andExpect(status().isBadRequest()).andExpect(jsonPath("$.message").value("Permissão desconhecida: modulo.inexistente."));
        assertFalse(profiles.findByNameIgnoreCase(PREFIX + "Inválido").isPresent());
    }

    // Atualização

    @Test
    void updatePermissionsAppliesToLoggedUsersWithoutLogout() throws Exception {
        AccessProfile profile = AccessTestSupport.saveProfile(profiles, PREFIX + "Sessão", "rma.ver", "relatorios.ver");
        AccessTestSupport.saveAccountWithProfile(users, passwordEncoder, MEMBER, profile, Set.of());
        MockHttpSession session = login(MEMBER);
        mvc.perform(get("/api/rmas").session(session)).andExpect(status().isOk());

        mvc.perform(put("/api/profiles/{id}", profile.getId()).with(asProfile("admin", "ADMIN")).with(csrf()).contentType(MediaType.APPLICATION_JSON)
                .content(body(PREFIX + "Sessão", "relatorios.ver")))
            .andExpect(status().isOk()).andExpect(jsonPath("$.permissions", contains("relatorios.ver")));

        mvc.perform(get("/api/rmas").session(session)).andExpect(status().isForbidden());
        mvc.perform(get("/api/reports/rmas").session(session)).andExpect(status().isOk());
        mvc.perform(get("/api/auth/me").session(session)).andExpect(status().isOk());
        assertFalse(session.isInvalid());
    }

    @Test
    void rejectsRemovingAdminPermissionFromLastAdministratorsProfile() throws Exception {
        AccessProfile adminProfile = profiles.findByLegacyCode("ADMIN").orElseThrow();
        Set<String> reduced = new HashSet<>(adminProfile.getPermissions());
        reduced.remove("perfis.gerir");

        mvc.perform(put("/api/profiles/{id}", adminProfile.getId()).with(asProfile("admin", "ADMIN")).with(csrf()).contentType(MediaType.APPLICATION_JSON)
                .content(body("Administrador", reduced.toArray(String[]::new))))
            .andExpect(status().isBadRequest()).andExpect(jsonPath("$.message").value(ADMIN_MESSAGE));
        assertEquals(LegacyProfiles.PERMISSIONS.get("ADMIN"), profiles.findByLegacyCode("ADMIN").orElseThrow().getPermissions());
        // A permissão do administrador segue a mesma na requisição seguinte.
        mvc.perform(get("/api/profiles").with(user(userDetailsService.loadUserByUsername("admin")))).andExpect(status().isOk());
    }

    // Anti-escalada

    @Test
    void nonAdminCannotGrantPermissionItLacks() throws Exception {
        saveManager();
        mvc.perform(post("/api/profiles").with(as(MANAGER)).with(csrf()).contentType(MediaType.APPLICATION_JSON)
                .content(body(PREFIX + "Escalada", "rma.ver", "rma.abrir")))
            .andExpect(status().isBadRequest()).andExpect(jsonPath("$.message").value(GRANT_MESSAGE));
        assertFalse(profiles.findByNameIgnoreCase(PREFIX + "Escalada").isPresent());

        AccessProfile target = AccessTestSupport.saveProfile(profiles, PREFIX + "Alvo", "rma.ver");
        mvc.perform(put("/api/profiles/{id}", target.getId()).with(as(MANAGER)).with(csrf()).contentType(MediaType.APPLICATION_JSON)
                .content(body(PREFIX + "Alvo", "rma.ver", "usuarios.gerir")))
            .andExpect(status().isBadRequest()).andExpect(jsonPath("$.message").value(GRANT_MESSAGE));
        assertEquals(Set.of("rma.ver"), profiles.findById(target.getId()).orElseThrow().getPermissions());
    }

    @Test
    void nonAdminCanGrantSubsetOfOwnPermissions() throws Exception {
        saveManager();
        mvc.perform(post("/api/profiles").with(as(MANAGER)).with(csrf()).contentType(MediaType.APPLICATION_JSON)
                .content(body(PREFIX + "Subconjunto", "rma.ver", "perfis.gerir")))
            .andExpect(status().isCreated());
        // O administrador pode conceder qualquer permissão, inclusive as que nenhum perfil dele tem (rma.atribuivel).
        mvc.perform(post("/api/profiles").with(asProfile("admin", "ADMIN")).with(csrf()).contentType(MediaType.APPLICATION_JSON)
                .content(body(PREFIX + "Atribuível", "rma.atribuivel")))
            .andExpect(status().isCreated());
    }

    // Exclusão

    /** A regra também olha o conjunto atual: quem não é administrador não reduz perfil com permissões que não tem. */
    @Test
    void nonAdminCannotReduceProfileWithPermissionsItLacks() throws Exception {
        saveManager();
        AccessProfile target = AccessTestSupport.saveProfile(profiles, PREFIX + "Alvo", "rma.ver", "rma.abrir");

        mvc.perform(put("/api/profiles/{id}", target.getId()).with(as(MANAGER)).with(csrf()).contentType(MediaType.APPLICATION_JSON)
                .content(body(PREFIX + "Alvo", "rma.ver")))
            .andExpect(status().isBadRequest())
            .andExpect(jsonPath("$.message").value(GRANT_MESSAGE));
        assertEquals(Set.of("rma.ver", "rma.abrir"), profiles.findById(target.getId()).orElseThrow().getPermissions());
    }

    @Test
    void nonAdminCannotDeleteProfileWithPermissionsItLacks() throws Exception {
        saveManager();
        AccessProfile richer = AccessTestSupport.saveProfile(profiles, PREFIX + "Mais acesso", "rma.ver", "rma.abrir");
        AccessProfile within = AccessTestSupport.saveProfile(profiles, PREFIX + "Dentro", "rma.ver");

        mvc.perform(delete("/api/profiles/{id}", richer.getId()).with(as(MANAGER)).with(csrf()))
            .andExpect(status().isBadRequest())
            .andExpect(jsonPath("$.message").value(GRANT_MESSAGE));
        assertTrue(profiles.existsById(richer.getId()));
        mvc.perform(delete("/api/profiles/{id}", within.getId()).with(as(MANAGER)).with(csrf()))
            .andExpect(status().isNoContent());
        assertFalse(profiles.existsById(within.getId()));
    }

    @Test
    void deleteBlockedWhenProfileHasUsers() throws Exception {
        AccessProfile used = AccessTestSupport.saveProfile(profiles, PREFIX + "Em uso", "rma.ver");
        AccessTestSupport.saveAccountWithProfile(users, passwordEncoder, MEMBER, used, Set.of());
        mvc.perform(delete("/api/profiles/{id}", used.getId()).with(asProfile("admin", "ADMIN")).with(csrf()))
            .andExpect(status().isBadRequest())
            .andExpect(jsonPath("$.message").value("Perfil possui usuários vinculados e não pode ser excluído."));
        assertTrue(profiles.existsById(used.getId()));
    }

    /** Enquanto a coluna role existir, os perfis migrados (legacy_code) sustentam o rollback (spec §6). */
    @Test
    void deleteBlockedForMigratedProfile() throws Exception {
        AccessProfile migrated = AccessTestSupport.saveProfile(profiles, PREFIX + "Migrado", "rma.ver");
        migrated.setLegacyCode("TESTE_LEGADO");
        profiles.saveAndFlush(migrated);

        mvc.perform(delete("/api/profiles/{id}", migrated.getId()).with(asProfile("admin", "ADMIN")).with(csrf()))
            .andExpect(status().isBadRequest())
            .andExpect(jsonPath("$.message").value("Perfil migrado não pode ser excluído."));
        assertTrue(profiles.existsById(migrated.getId()));
    }

    @Test
    void deletesUnusedProfile() throws Exception {
        AccessProfile unused = AccessTestSupport.saveProfile(profiles, PREFIX + "Sem uso", "rma.ver");
        mvc.perform(delete("/api/profiles/{id}", unused.getId()).with(asProfile("admin", "ADMIN")).with(csrf()))
            .andExpect(status().isNoContent());
        assertFalse(profiles.existsById(unused.getId()));
        mvc.perform(delete("/api/profiles/{id}", unused.getId()).with(asProfile("admin", "ADMIN")).with(csrf()))
            .andExpect(status().isNotFound());
    }

    // Concorrência

    @Test
    void concurrentProfileAndUserReductionsKeepOneAdministrator() throws Exception {
        AccessProfile profileA = AccessTestSupport.saveProfile(profiles, PREFIX + "Admin A", "usuarios.gerir", "perfis.gerir");
        AccessTestSupport.saveAccountWithProfile(users, passwordEncoder, ADMIN_A, profileA, Set.of());
        Map<String, Object> demoteSeed = new LinkedHashMap<>(Map.of(
            "username", admin.getUsername(), "fullName", admin.getFullName(),
            "profileId", profiles.findByLegacyCode("VIEWER").orElseThrow().getId(), "active", true));
        RequestPostProcessor actorA = as(ADMIN_A);

        List<Integer> statuses = runTogether(
            () -> mvc.perform(put("/api/profiles/{id}", profileA.getId()).with(actorA).with(csrf())
                .contentType(MediaType.APPLICATION_JSON).content(body(PREFIX + "Admin A", "usuarios.gerir")))
                .andReturn().getResponse().getStatus(),
            () -> mvc.perform(put("/api/users/{id}", admin.getId()).with(actorA).with(csrf())
                .contentType(MediaType.APPLICATION_JSON).content(mapper.writeValueAsString(demoteSeed)))
                .andReturn().getResponse().getStatus());

        assertTrue(statuses.equals(List.of(200, 400)) || statuses.equals(List.of(400, 200)),
            "Esperava exatamente uma recusa, recebeu " + statuses);
        assertEquals(1, users.findAll().stream()
            .filter(account -> account.isActive() && effectivePermissions.isAdministrator(account)).count());
    }

    /**
     * Cada administrador tira perfis.gerir do perfil do outro, ao mesmo tempo. O lock de todo o grafo vem antes de
     * qualquer leitura (inclusive do ator), então a segunda requisição já vê o ator rebaixado: exatamente uma falha.
     */
    @Test
    void concurrentCrossProfileReductionsKeepOneAdministrator() throws Exception {
        AccessProfile profileA = AccessTestSupport.saveProfile(profiles, PREFIX + "Cruzado A", "usuarios.gerir", "perfis.gerir");
        AccessProfile profileB = AccessTestSupport.saveProfile(profiles, PREFIX + "Cruzado B", "usuarios.gerir", "perfis.gerir");
        AccessTestSupport.saveAccountWithProfile(users, passwordEncoder, ADMIN_A, profileA, Set.of());
        AccessTestSupport.saveAccountWithProfile(users, passwordEncoder, ADMIN_B, profileB, Set.of());
        admin.setActive(false);
        users.saveAndFlush(admin);
        RequestPostProcessor actorA = as(ADMIN_A);
        RequestPostProcessor actorB = as(ADMIN_B);

        List<Integer> statuses = runTogether(
            () -> mvc.perform(put("/api/profiles/{id}", profileB.getId()).with(actorA).with(csrf())
                .contentType(MediaType.APPLICATION_JSON).content(body(PREFIX + "Cruzado B", "usuarios.gerir")))
                .andReturn().getResponse().getStatus(),
            () -> mvc.perform(put("/api/profiles/{id}", profileA.getId()).with(actorB).with(csrf())
                .contentType(MediaType.APPLICATION_JSON).content(body(PREFIX + "Cruzado A", "usuarios.gerir")))
                .andReturn().getResponse().getStatus());

        assertTrue(statuses.equals(List.of(200, 400)) || statuses.equals(List.of(400, 200)),
            "Esperava exatamente uma recusa, recebeu " + statuses);
        assertEquals(1, users.findAll().stream()
            .filter(account -> account.isActive() && effectivePermissions.isAdministrator(account)).count());
    }

    @Test
    void concurrentLoginAndProfileUpdateDoNotDeadlock() throws Exception {
        AccessProfile profile = AccessTestSupport.saveProfile(profiles, PREFIX + "Login", "rma.ver");
        AccessTestSupport.saveAccountWithProfile(users, passwordEncoder, MEMBER, profile, Set.of());
        for (int round = 0; round < 3; round++) {
            String permissions = round % 2 == 0 ? "relatorios.ver" : "rma.ver";
            List<Integer> statuses = runTogether(
                () -> mvc.perform(post("/api/auth/login").with(csrf()).contentType(MediaType.APPLICATION_JSON)
                    .content(mapper.writeValueAsString(Map.of("username", MEMBER, "password", AccessTestSupport.DEFAULT_PASSWORD))))
                    .andReturn().getResponse().getStatus(),
                () -> mvc.perform(put("/api/profiles/{id}", profile.getId()).with(asProfile("admin", "ADMIN")).with(csrf())
                    .contentType(MediaType.APPLICATION_JSON).content(body(PREFIX + "Login", permissions)))
                    .andReturn().getResponse().getStatus());
            assertEquals(List.of(200, 200), statuses, "rodada " + round);
        }
    }

    private List<Integer> runTogether(Callable<Integer> first, Callable<Integer> second) throws Exception {
        var pool = Executors.newFixedThreadPool(2);
        var ready = new CountDownLatch(2);
        var start = new CountDownLatch(1);
        try {
            List<Future<Integer>> futures = new ArrayList<>();
            for (Callable<Integer> task : List.of(first, second)) {
                futures.add(pool.submit(() -> {
                    ready.countDown();
                    if (!start.await(10, TimeUnit.SECONDS)) throw new IllegalStateException("Barrier timed out");
                    return task.call();
                }));
            }
            assertTrue(ready.await(10, TimeUnit.SECONDS));
            start.countDown();
            List<Integer> statuses = new ArrayList<>();
            for (Future<Integer> future : futures) statuses.add(future.get(20, TimeUnit.SECONDS));
            return statuses;
        } finally {
            start.countDown();
            pool.shutdownNow();
            assertTrue(pool.awaitTermination(10, TimeUnit.SECONDS));
        }
    }

    /** Usuário que gerencia perfis sem ser administrador: só {@code perfis.gerir} e {@code rma.ver}. */
    private void saveManager() {
        AccessProfile managerProfile = AccessTestSupport.saveProfile(profiles, PREFIX + "Gestor", "perfis.gerir", "rma.ver");
        AccessTestSupport.saveAccountWithProfile(users, passwordEncoder, MANAGER, managerProfile, Set.of());
    }

    private RequestPostProcessor as(String username) {
        return user(userDetailsService.loadUserByUsername(username));
    }

    private static List<org.springframework.security.core.GrantedAuthority> authorities(String... codes) {
        return org.springframework.security.core.authority.AuthorityUtils.createAuthorityList(codes);
    }

    private String body(String name, String... permissions) throws Exception {
        return mapper.writeValueAsString(Map.of("name", name, "permissions", List.of(permissions)));
    }

    private JsonNode json(String content) throws Exception {
        return mapper.readTree(content);
    }

    private MockHttpSession login(String username) throws Exception {
        var result = mvc.perform(post("/api/auth/login").with(csrf()).contentType(MediaType.APPLICATION_JSON)
                .content(mapper.writeValueAsString(Map.of("username", username, "password", AccessTestSupport.DEFAULT_PASSWORD))))
            .andExpect(status().isOk()).andReturn();
        MockHttpSession session = (MockHttpSession) result.getRequest().getSession(false);
        assertNotNull(session);
        sessions.add(session);
        return session;
    }
}
