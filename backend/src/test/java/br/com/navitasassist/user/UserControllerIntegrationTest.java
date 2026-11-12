package br.com.navitasassist.user;

import static br.com.navitasassist.access.AccessTestSupport.asProfile;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.hamcrest.Matchers.contains;
import static org.hamcrest.Matchers.hasSize;
import static org.hamcrest.Matchers.not;
import static org.hamcrest.Matchers.hasItem;
import static org.hamcrest.Matchers.startsWith;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

import br.com.navitasassist.access.AccessProfile;
import br.com.navitasassist.access.AccessTestSupport;
import br.com.navitasassist.access.Permission;
import br.com.navitasassist.controller.BusinessException;
import br.com.navitasassist.service.EffectivePermissionService;
import br.com.navitasassist.service.UserAccountService;
import br.com.navitasassist.repository.AccessProfileRepository;
import br.com.navitasassist.repository.UserAccountRepository;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockHttpSession;
import org.springframework.security.core.authority.AuthorityUtils;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.request.RequestPostProcessor;

@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
class UserControllerIntegrationTest {

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private ObjectMapper objectMapper;

    @Autowired
    private UserAccountRepository userAccountRepository;

    @Autowired
    private AccessProfileRepository accessProfiles;

    @Autowired
    private PasswordEncoder passwordEncoder;

    @Autowired
    private EffectivePermissionService effectivePermissions;

    @Autowired
    private UserAccountService userAccountService;

    private static final String CUSTOM_PROFILE = "Teste usuarios personalizado";
    private static final String MANAGER_PROFILE = "Teste usuarios gestor";
    private static final String MANAGER = "users.manager";
    private static final String GRANT_MESSAGE = "Você não pode conceder permissões que não possui.";
    private AccessProfile managerProfile;

    @AfterEach
    void cleanCustomProfiles() {
        userAccountRepository.findAll().stream()
            .filter(user -> !user.getUsername().equalsIgnoreCase("admin"))
            .forEach(userAccountRepository::delete);
        userAccountRepository.flush();
        AccessTestSupport.deleteProfiles(accessProfiles, CUSTOM_PROFILE, MANAGER_PROFILE);
    }

    @BeforeEach
    void cleanTestUsers() {
        userAccountRepository.findAll().stream()
            .filter(user -> !user.getUsername().equalsIgnoreCase("admin"))
            .forEach(userAccountRepository::delete);
        UserAccountTestSupport.ensureAdmin(userAccountRepository, accessProfiles, passwordEncoder);
    }

    @Test
    void shouldUpdateUserAndKeepPasswordWhenItIsOmitted() throws Exception {
        UserAccount user = createUser("operator", "Operator", "old-password");

        mockMvc.perform(put("/api/users/{id}", user.getId())
                .with(asProfile("admin", "ADMIN"))
                .with(csrf())
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(Map.of(
                    "username", "operator.updated",
                    "fullName", "Updated Operator",
                    "profileId", profileId("TECHNICIAN"),
                    "active", true
                ))))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.username").value("operator.updated"))
            .andExpect(jsonPath("$.fullName").value("Updated Operator"))
            .andExpect(jsonPath("$.profile.name").value("Técnico"))
            .andExpect(jsonPath("$.role").doesNotExist());

        UserAccount updatedUser = userAccountRepository.findById(user.getId()).orElseThrow();
        assertTrue(passwordEncoder.matches("old-password", updatedUser.getPasswordHash()));
    }

    @Test
    void profileIsStoredOnCreateAndUpdate() throws Exception {
        mockMvc.perform(post("/api/users")
                .with(asProfile("admin", "ADMIN"))
                .with(csrf())
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(Map.of(
                    "username", "bridge.user",
                    "fullName", "Bridge User",
                    "password", "password123",
                    "profileId", profileId("VIEWER"),
                    "active", true
                ))))
            .andExpect(status().isCreated());
        UserAccount created = userAccountRepository.findByUsernameIgnoreCase("bridge.user").orElseThrow();
        assertEquals("VIEWER", created.getProfile().getLegacyCode());

        mockMvc.perform(put("/api/users/{id}", created.getId())
                .with(asProfile("admin", "ADMIN"))
                .with(csrf())
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(Map.of(
                    "username", "bridge.user",
                    "fullName", "Bridge User",
                    "profileId", profileId("TECHNICIAN"),
                    "active", true
                ))))
            .andExpect(status().isOk());
        UserAccount updated = userAccountRepository.findById(created.getId()).orElseThrow();
        assertEquals("TECHNICIAN", updated.getProfile().getLegacyCode());
    }

    @Test
    void shouldDeleteAnotherUser() throws Exception {
        UserAccount user = createUser("delete.me", "Delete Me", "password123");

        mockMvc.perform(delete("/api/users/{id}", user.getId())
                .with(asProfile("admin", "ADMIN"))
                .with(csrf()))
            .andExpect(status().isNoContent());

        assertFalse(userAccountRepository.existsById(user.getId()));
    }

    @Test
    void shouldNotDeleteAuthenticatedUser() throws Exception {
        UserAccount admin = userAccountRepository.findByUsernameIgnoreCase("admin").orElseThrow();

        mockMvc.perform(delete("/api/users/{id}", admin.getId())
                .with(asProfile("admin", "ADMIN"))
                .with(csrf()))
            .andExpect(status().isBadRequest())
            .andExpect(jsonPath("$.message").value("You cannot delete your own user account."));

        assertTrue(userAccountRepository.existsById(admin.getId()));
    }

    @ParameterizedTest
    @ValueSource(strings = {"operator", "OPERATOR", " operator ", " OPERATOR ", "\toperator\t"})
    void shouldRejectNormalizedDuplicateOnCreateAndPreserveLogin(String username) throws Exception {
        UserAccount existing = createUser("operator", "Original Operator", "original-password");
        long count = userAccountRepository.count();

        mockMvc.perform(post("/api/users")
                .with(asProfile("admin", "ADMIN")).with(csrf())
                .contentType(MediaType.APPLICATION_JSON)
                .content(userJson(username, "Changed name", "changed-password", "ADMIN", false)))
            .andExpect(status().isBadRequest())
            .andExpect(jsonPath("$.status").value(400))
            .andExpect(jsonPath("$.message").value("Username already registered: " + username.trim()));

        assertThat(userAccountRepository.count()).isEqualTo(count);
        assertUnchanged(existing);
        assertLogin(existing.getId(), "operator", "original-password");
    }

    @ParameterizedTest
    @ValueSource(strings = {"operator", "OPERATOR", " operator ", " OPERATOR ", "\toperator\t"})
    void shouldRejectNormalizedDuplicateOnUpdateWithoutChangingEitherAccount(String username) throws Exception {
        UserAccount existing = createUser("operator", "Original Operator", "original-password");
        UserAccount edited = createUser("editor", "Original Editor", "editor-password");
        long count = userAccountRepository.count();

        mockMvc.perform(put("/api/users/{id}", edited.getId())
                .with(asProfile("admin", "ADMIN")).with(csrf())
                .contentType(MediaType.APPLICATION_JSON)
                .content(userJson(username, "Changed name", "changed-password", "ADMIN", false)))
            .andExpect(status().isBadRequest())
            .andExpect(jsonPath("$.message").value("Username already registered: " + username.trim()));

        assertThat(userAccountRepository.count()).isEqualTo(count);
        assertUnchanged(existing);
        assertUnchanged(edited);
        assertLogin(edited.getId(), "editor", "editor-password");
        assertLogin(existing.getId(), "operator", "original-password");
    }

    @ParameterizedTest
    @ValueSource(strings = {"operator", " operator ", " OPERATOR "})
    void shouldAllowOwnNormalizedUsernameAndKeepPassword(String username) throws Exception {
        UserAccount existing = createUser("operator", "Original Operator", "original-password");
        long count = userAccountRepository.count();

        mockMvc.perform(put("/api/users/{id}", existing.getId())
                .with(asProfile("admin", "ADMIN")).with(csrf())
                .contentType(MediaType.APPLICATION_JSON)
                .content(userJson(username, "Updated Operator", null, "SERVICE_DESK", true)))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.id").value(existing.getId()))
            .andExpect(jsonPath("$.username").value(username.trim()))
            .andExpect(jsonPath("$.password").doesNotExist())
            .andExpect(jsonPath("$.passwordHash").doesNotExist());

        UserAccount persisted = userAccountRepository.findById(existing.getId()).orElseThrow();
        assertThat(userAccountRepository.count()).isEqualTo(count);
        assertThat(persisted.getUsername()).isEqualTo(username.trim());
        assertThat(persisted.getPasswordHash()).isEqualTo(existing.getPasswordHash());
        assertLogin(existing.getId(), " OPERATOR ", "original-password");
    }

    @Test
    void shouldNormalizeUniqueUsernamesAndPreserveInternalSpaces() throws Exception {
        String response = mockMvc.perform(post("/api/users")
                .with(asProfile("admin", "ADMIN")).with(csrf())
                .contentType(MediaType.APPLICATION_JSON)
                .content(userJson(" unique user ", "Unique User", "original-password", "SERVICE_DESK", true)))
            .andExpect(status().isCreated())
            .andExpect(jsonPath("$.username").value("unique user"))
            .andExpect(jsonPath("$.password").doesNotExist())
            .andExpect(jsonPath("$.passwordHash").doesNotExist())
            .andReturn().getResponse().getContentAsString();
        long id = objectMapper.readTree(response).get("id").asLong();
        assertThat(userAccountRepository.findById(id).orElseThrow().getUsername()).isEqualTo("unique user");

        mockMvc.perform(put("/api/users/{id}", id)
                .with(asProfile("admin", "ADMIN")).with(csrf())
                .contentType(MediaType.APPLICATION_JSON)
                .content(userJson(" changed user ", "Changed User", null, "SERVICE_DESK", true)))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.username").value("changed user"));

        assertThat(userAccountRepository.findById(id).orElseThrow().getUsername()).isEqualTo("changed user");
        assertLogin(id, " CHANGED USER ", "original-password");
    }

    @ParameterizedTest
    @ValueSource(strings = {"SERVICE_DESK", "TECHNICIAN", "VIEWER"})
    void shouldRejectAccountWritesByNonAdministrators(String role) throws Exception {
        UserAccount existing = createUser("protected.user", "Protected User", "original-password");
        long count = userAccountRepository.count();
        String body = userJson(" unauthorized.user ", "Changed name", "changed-password", "ADMIN", false);

        mockMvc.perform(post("/api/users").with(asProfile("unauthorized", role)).with(csrf())
                .contentType(MediaType.APPLICATION_JSON).content(body))
            .andExpect(status().isForbidden());
        mockMvc.perform(put("/api/users/{id}", existing.getId()).with(asProfile("unauthorized", role)).with(csrf())
                .contentType(MediaType.APPLICATION_JSON).content(body))
            .andExpect(status().isForbidden());

        assertThat(userAccountRepository.count()).isEqualTo(count);
        assertUnchanged(existing);
    }

    @Test
    void shouldRejectAccountWritesWithoutCsrf() throws Exception {
        UserAccount existing = createUser("protected.user", "Protected User", "original-password");
        long count = userAccountRepository.count();
        String body = userJson(" unauthorized.user ", "Changed name", "changed-password", "ADMIN", false);

        mockMvc.perform(post("/api/users").with(asProfile("admin", "ADMIN"))
                .contentType(MediaType.APPLICATION_JSON).content(body))
            .andExpect(status().isForbidden());
        mockMvc.perform(put("/api/users/{id}", existing.getId()).with(asProfile("admin", "ADMIN"))
                .contentType(MediaType.APPLICATION_JSON).content(body))
            .andExpect(status().isForbidden());

        assertThat(userAccountRepository.count()).isEqualTo(count);
        assertUnchanged(existing);
    }

    @Test
    void shouldRejectUnauthenticatedAccountWrites() throws Exception {
        UserAccount existing = createUser("protected.user", "Protected User", "original-password");
        long count = userAccountRepository.count();
        String body = userJson(" unauthorized.user ", "Changed name", "changed-password", "ADMIN", false);

        mockMvc.perform(post("/api/users").with(csrf()).contentType(MediaType.APPLICATION_JSON).content(body))
            .andExpect(status().isUnauthorized());
        mockMvc.perform(put("/api/users/{id}", existing.getId()).with(csrf()).contentType(MediaType.APPLICATION_JSON).content(body))
            .andExpect(status().isUnauthorized());

        assertThat(userAccountRepository.count()).isEqualTo(count);
        assertUnchanged(existing);
    }

    @Test
    void shouldKeepUsernameLengthLimitOnCreateAndUpdate() throws Exception {
        UserAccount existing = createUser("protected.user", "Protected User", "original-password");
        long count = userAccountRepository.count();
        String body = userJson("u".repeat(61), "Changed name", "changed-password", "ADMIN", false);

        mockMvc.perform(post("/api/users").with(asProfile("admin", "ADMIN")).with(csrf())
                .contentType(MediaType.APPLICATION_JSON).content(body))
            .andExpect(status().isBadRequest())
            .andExpect(jsonPath("$.details", hasItem(startsWith("username:"))));
        mockMvc.perform(put("/api/users/{id}", existing.getId()).with(asProfile("admin", "ADMIN")).with(csrf())
                .contentType(MediaType.APPLICATION_JSON).content(body))
            .andExpect(status().isBadRequest())
            .andExpect(jsonPath("$.details", hasItem(startsWith("username:"))));

        assertThat(userAccountRepository.count()).isEqualTo(count);
        assertUnchanged(existing);
    }

    // Perfil e permissões extras (etapa 8A)

    @Test
    void createsAndUpdatesWithProfileAndExtras() throws Exception {
        String response = mockMvc.perform(post("/api/users").with(asProfile("admin", "ADMIN")).with(csrf())
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(Map.of(
                    "username", "extras.user", "fullName", "Extras User", "password", "password123",
                    "profileId", profileId("VIEWER"), "extraPermissions", List.of("rma.abrir"), "active", true))))
            .andExpect(status().isCreated())
            .andExpect(jsonPath("$.profile.id").value(profileId("VIEWER")))
            .andExpect(jsonPath("$.profile.name").value("Consulta"))
            .andExpect(jsonPath("$.extraPermissions", contains("rma.abrir")))
            .andReturn().getResponse().getContentAsString();
        long id = objectMapper.readTree(response).get("id").asLong();
        assertThat(userAccountRepository.findById(id).orElseThrow().getExtraPermissions()).containsExactly("rma.abrir");

        mockMvc.perform(put("/api/users/{id}", id).with(asProfile("admin", "ADMIN")).with(csrf())
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(Map.of(
                    "username", "extras.user", "fullName", "Extras User",
                    "profileId", profileId("TECHNICIAN"), "extraPermissions", List.of("pecas.movimentar", "rma.abrir"), "active", true))))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.profile.name").value("Técnico"))
            .andExpect(jsonPath("$.extraPermissions", contains("rma.abrir", "pecas.movimentar")));
        UserAccount updated = userAccountRepository.findById(id).orElseThrow();
        assertEquals("TECHNICIAN", updated.getProfile().getLegacyCode());
        assertThat(updated.getExtraPermissions()).containsExactlyInAnyOrder("rma.abrir", "pecas.movimentar");
    }

    @Test
    void rejectsUnknownProfile() throws Exception {
        UserAccount existing = createUser("protected.user", "Protected User", "original-password");
        long count = userAccountRepository.count();
        Map<String, Object> body = new LinkedHashMap<>(Map.of("username", "unknown.profile", "fullName", "Unknown",
            "password", "password123", "profileId", 999999, "active", true));

        mockMvc.perform(post("/api/users").with(asProfile("admin", "ADMIN")).with(csrf())
                .contentType(MediaType.APPLICATION_JSON).content(objectMapper.writeValueAsString(body)))
            .andExpect(status().isBadRequest())
            .andExpect(jsonPath("$.message").value("Perfil não encontrado: 999999."));
        mockMvc.perform(put("/api/users/{id}", existing.getId()).with(asProfile("admin", "ADMIN")).with(csrf())
                .contentType(MediaType.APPLICATION_JSON).content(objectMapper.writeValueAsString(body)))
            .andExpect(status().isBadRequest())
            .andExpect(jsonPath("$.message").value("Perfil não encontrado: 999999."));

        body.remove("profileId");
        mockMvc.perform(post("/api/users").with(asProfile("admin", "ADMIN")).with(csrf())
                .contentType(MediaType.APPLICATION_JSON).content(objectMapper.writeValueAsString(body)))
            .andExpect(status().isBadRequest())
            .andExpect(jsonPath("$.details", hasItem(startsWith("profileId:"))));

        assertThat(userAccountRepository.count()).isEqualTo(count);
        assertUnchanged(existing);
    }

    @Test
    void rejectsUnknownExtraPermission() throws Exception {
        UserAccount existing = createUser("protected.user", "Protected User", "original-password");
        long count = userAccountRepository.count();
        Map<String, Object> body = Map.of("username", "unknown.extra", "fullName", "Unknown", "password", "password123",
            "profileId", profileId("VIEWER"), "extraPermissions", List.of("rma.ver", "rma.voar"), "active", true);

        mockMvc.perform(post("/api/users").with(asProfile("admin", "ADMIN")).with(csrf())
                .contentType(MediaType.APPLICATION_JSON).content(objectMapper.writeValueAsString(body)))
            .andExpect(status().isBadRequest())
            .andExpect(jsonPath("$.message").value("Permissão desconhecida: rma.voar."));
        mockMvc.perform(put("/api/users/{id}", existing.getId()).with(asProfile("admin", "ADMIN")).with(csrf())
                .contentType(MediaType.APPLICATION_JSON).content(objectMapper.writeValueAsString(body)))
            .andExpect(status().isBadRequest())
            .andExpect(jsonPath("$.message").value("Permissão desconhecida: rma.voar."));

        assertThat(userAccountRepository.count()).isEqualTo(count);
        assertUnchanged(existing);
    }

    @Test
    void nullExtrasMeansEmpty() throws Exception {
        UserAccount existing = createUser("with.extras", "With Extras", "password123");
        existing.getExtraPermissions().add("rma.diagnosticar");
        userAccountRepository.saveAndFlush(existing);
        Map<String, Object> body = new LinkedHashMap<>(Map.of("username", "with.extras", "fullName", "With Extras",
            "profileId", profileId("SERVICE_DESK"), "active", true));
        body.put("extraPermissions", null);

        mockMvc.perform(put("/api/users/{id}", existing.getId()).with(asProfile("admin", "ADMIN")).with(csrf())
                .contentType(MediaType.APPLICATION_JSON).content(objectMapper.writeValueAsString(body)))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.extraPermissions", hasSize(0)));
        assertThat(userAccountRepository.findById(existing.getId()).orElseThrow().getExtraPermissions()).isEmpty();

        mockMvc.perform(post("/api/users").with(asProfile("admin", "ADMIN")).with(csrf())
                .contentType(MediaType.APPLICATION_JSON).content(userJson("no.extras", "No Extras", "password123", "VIEWER", true)))
            .andExpect(status().isCreated())
            .andExpect(jsonPath("$.extraPermissions", hasSize(0)));
        assertThat(userAccountRepository.findByUsernameIgnoreCase("no.extras").orElseThrow().getExtraPermissions()).isEmpty();
    }

    @Test
    void responseHasProfileAndExtrasWithoutRole() throws Exception {
        AccessProfile custom = AccessTestSupport.saveProfile(accessProfiles, CUSTOM_PROFILE, "rma.ver");
        Map<String, Object> body = Map.of("username", "custom.user", "fullName", "Custom User", "password", "password123",
            "profileId", custom.getId(), "extraPermissions", List.of("relatorios.ver", "rma.abrir"), "active", true);

        mockMvc.perform(post("/api/users").with(asProfile("admin", "ADMIN")).with(csrf())
                .contentType(MediaType.APPLICATION_JSON).content(objectMapper.writeValueAsString(body)))
            .andExpect(status().isCreated())
            .andExpect(jsonPath("$.profile.id").value(custom.getId()))
            .andExpect(jsonPath("$.profile.name").value(CUSTOM_PROFILE))
            .andExpect(jsonPath("$.extraPermissions", contains("rma.abrir", "relatorios.ver")))
            .andExpect(jsonPath("$.role").doesNotExist())
            .andExpect(jsonPath("$.passwordHash").doesNotExist());

        mockMvc.perform(get("/api/users").param("query", "custom.user").with(asProfile("admin", "ADMIN")))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.content[0].profile.name").value(CUSTOM_PROFILE))
            .andExpect(jsonPath("$.content[0].extraPermissions", contains("rma.abrir", "relatorios.ver")))
            .andExpect(jsonPath("$.content[0].role").doesNotExist());
        mockMvc.perform(get("/api/users").param("query", "admin").with(asProfile("admin", "ADMIN")))
            .andExpect(jsonPath("$.content[0].profile.name").value("Administrador"));
    }

    @Test
    void keepsRedundantExtraWhenProfileLosesIt() throws Exception {
        AccessProfile custom = AccessTestSupport.saveProfile(accessProfiles, CUSTOM_PROFILE, "rma.ver", "rma.abrir");
        String response = mockMvc.perform(post("/api/users").with(asProfile("admin", "ADMIN")).with(csrf())
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(Map.of("username", "redundant.user", "fullName", "Redundant User",
                    "password", "password123", "profileId", custom.getId(), "extraPermissions", List.of("rma.abrir"), "active", true))))
            .andExpect(status().isCreated())
            .andExpect(jsonPath("$.extraPermissions", contains("rma.abrir")))
            .andReturn().getResponse().getContentAsString();
        long id = objectMapper.readTree(response).get("id").asLong();

        custom.getPermissions().remove("rma.abrir");
        accessProfiles.saveAndFlush(custom);

        UserAccount account = userAccountRepository.findById(id).orElseThrow();
        assertThat(account.getProfile().getPermissions()).doesNotContain("rma.abrir");
        assertThat(account.getExtraPermissions()).containsExactly("rma.abrir");
        assertTrue(effectivePermissions.has(account, Permission.RMA_ABRIR));
    }

    @Test
    void nonAdminCannotGrantPermissionItLacks() throws Exception {
        saveManager("usuarios.gerir");
        long count = userAccountRepository.count();

        mockMvc.perform(post("/api/users").with(asManager()).with(csrf())
                .contentType(MediaType.APPLICATION_JSON).content(userJson("escalated.user", "Escalated", "password123", "SERVICE_DESK", true)))
            .andExpect(status().isBadRequest())
            .andExpect(jsonPath("$.message").value(GRANT_MESSAGE));
        mockMvc.perform(post("/api/users").with(asManager()).with(csrf())
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(Map.of("username", "escalated.extra", "fullName", "Escalated",
                    "password", "password123", "profileId", managerProfile.getId(), "extraPermissions", List.of("perfis.gerir"), "active", true))))
            .andExpect(status().isBadRequest())
            .andExpect(jsonPath("$.message").value(GRANT_MESSAGE));

        assertThat(userAccountRepository.count()).isEqualTo(count);
    }

    @Test
    void nonAdminCanAssignProfileWithinOwnPermissions() throws Exception {
        saveManager("usuarios.gerir", "rma.ver", "cadastros.ver", "pecas.ver", "protocolos.ver", "relatorios.ver");

        mockMvc.perform(post("/api/users").with(asManager()).with(csrf())
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(Map.of("username", "granted.user", "fullName", "Granted",
                    "password", "password123", "profileId", profileId("VIEWER"), "extraPermissions", List.of("usuarios.gerir"), "active", true))))
            .andExpect(status().isCreated())
            .andExpect(jsonPath("$.profile.name").value("Consulta"))
            .andExpect(jsonPath("$.extraPermissions", contains("usuarios.gerir")));
    }

    @Test
    void nonAdminCannotEditUserWithMorePermissions() throws Exception {
        saveManager("usuarios.gerir", "rma.ver", "cadastros.ver", "pecas.ver", "protocolos.ver", "relatorios.ver");
        UserAccount desk = createUser("desk.user", "Desk User", "password123");

        mockMvc.perform(put("/api/users/{id}", desk.getId()).with(asManager()).with(csrf())
                .contentType(MediaType.APPLICATION_JSON).content(userJson("desk.user", "Renamed by manager", null, "SERVICE_DESK", true)))
            .andExpect(status().isBadRequest())
            .andExpect(jsonPath("$.message").value(GRANT_MESSAGE));

        assertUnchanged(desk);
    }

    /** A regra também olha o estado atual: rebaixar quem tem permissões que o ator não tem é recusado. */
    @Test
    void nonAdminCannotDemoteUserWithPermissionsItLacks() throws Exception {
        saveManager("usuarios.gerir", "rma.ver", "cadastros.ver", "pecas.ver", "protocolos.ver", "relatorios.ver");
        UserAccount desk = createUser("desk.user", "Desk User", "password123");

        mockMvc.perform(put("/api/users/{id}", desk.getId()).with(asManager()).with(csrf())
                .contentType(MediaType.APPLICATION_JSON).content(userJson("desk.user", "Desk User", null, "VIEWER", true)))
            .andExpect(status().isBadRequest())
            .andExpect(jsonPath("$.message").value(GRANT_MESSAGE));

        assertUnchanged(desk);
    }

    @Test
    void nonAdminCannotDeleteUserWithPermissionsItLacks() throws Exception {
        saveManager("usuarios.gerir", "rma.ver", "cadastros.ver", "pecas.ver", "protocolos.ver", "relatorios.ver");
        UserAccount desk = createUser("desk.user", "Desk User", "password123");
        UserAccount viewer = createUser("viewer.user", "Viewer User", "password123");
        AccessTestSupport.assignProfile(accessProfiles, viewer, "VIEWER");
        userAccountRepository.saveAndFlush(viewer);

        mockMvc.perform(delete("/api/users/{id}", desk.getId()).with(asManager()).with(csrf()))
            .andExpect(status().isBadRequest())
            .andExpect(jsonPath("$.message").value(GRANT_MESSAGE));
        assertTrue(userAccountRepository.existsById(desk.getId()));

        mockMvc.perform(delete("/api/users/{id}", viewer.getId()).with(asManager()).with(csrf()))
            .andExpect(status().isNoContent());
        assertFalse(userAccountRepository.existsById(viewer.getId()));
    }

    @Test
    void updateKeepsCustomProfile() throws Exception {
        AccessProfile custom = AccessTestSupport.saveProfile(accessProfiles, CUSTOM_PROFILE, "rma.ver", "pecas.ver");
        UserAccount account = AccessTestSupport.saveAccountWithProfile(userAccountRepository, passwordEncoder, "custom.kept", custom, Set.of());

        mockMvc.perform(put("/api/users/{id}", account.getId()).with(asProfile("admin", "ADMIN")).with(csrf())
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(Map.of("username", "custom.kept", "fullName", "Renamed",
                    "profileId", custom.getId(), "active", true))))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.profile.id").value(custom.getId()))
            .andExpect(jsonPath("$.role").doesNotExist());
        assertEquals(custom.getId(), userAccountRepository.findById(account.getId()).orElseThrow().getProfile().getId());
    }

    @Test
    void viewerWithAtribuivelExtraIsAssignable() throws Exception {
        UserAccount viewer = createUser("assignable.viewer", "Assignable Viewer", "password123");
        AccessTestSupport.assignProfile(accessProfiles, viewer, "VIEWER");
        viewer.getExtraPermissions().add("rma.atribuivel");
        userAccountRepository.saveAndFlush(viewer);
        UserAccount technician = createUser("plain.technician", "Plain Technician", "password123");
        AccessTestSupport.assignProfile(accessProfiles, technician, "TECHNICIAN");
        userAccountRepository.saveAndFlush(technician);
        createUser("plain.desk", "Plain Desk", "password123");

        mockMvc.perform(get("/api/users/assignable").with(asProfile("viewer", "VIEWER")))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$[*].username", contains("assignable.viewer", "plain.technician")));
        assertEquals(viewer.getId(), userAccountService.getAssignableTechnicianById(viewer.getId()).getId());
    }

    @Test
    void administratorIsNotAssignable() throws Exception {
        UserAccount admin = userAccountRepository.findByUsernameIgnoreCase("admin").orElseThrow();

        mockMvc.perform(get("/api/users/assignable").with(asProfile("viewer", "VIEWER")))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$[*].username", not(hasItem("admin"))));
        assertThatThrownBy(() -> userAccountService.getAssignableTechnicianById(admin.getId()))
            .isInstanceOf(BusinessException.class)
            .hasMessage("Only technicians can be assigned to an RMA.");
    }

    private void saveManager(String... permissions) {
        managerProfile = AccessTestSupport.saveProfile(accessProfiles, MANAGER_PROFILE, permissions);
        AccessTestSupport.saveAccountWithProfile(userAccountRepository, passwordEncoder, MANAGER, managerProfile, Set.of());
    }

    /** Principal com as authorities do gestor; a regra anti-escalada lê as permissões efetivas dele no banco. */
    private RequestPostProcessor asManager() {
        return user(MANAGER).authorities(AuthorityUtils.createAuthorityList(managerProfile.getPermissions().toArray(String[]::new)));
    }

    private Long profileId(String legacyCode) {
        return accessProfiles.findByLegacyCode(legacyCode).orElseThrow().getId();
    }

    private void assertUnchanged(UserAccount original) {
        UserAccount persisted = userAccountRepository.findById(original.getId()).orElseThrow();
        assertThat(persisted.getUsername()).isEqualTo(original.getUsername());
        assertThat(persisted.getFullName()).isEqualTo(original.getFullName());
        assertThat(persisted.getPasswordHash()).isEqualTo(original.getPasswordHash());
        assertThat(persisted.getProfile().getId()).isEqualTo(original.getProfile().getId());
        assertThat(persisted.getExtraPermissions()).isEqualTo(original.getExtraPermissions());
        assertThat(persisted.isActive()).isEqualTo(original.isActive());
    }

    private void assertLogin(Long id, String username, String password) throws Exception {
        MockHttpSession session = (MockHttpSession) mockMvc.perform(post("/api/auth/login").with(csrf())
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(Map.of("username", username, "password", password))))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.id").value(id))
            .andExpect(jsonPath("$.password").doesNotExist())
            .andExpect(jsonPath("$.passwordHash").doesNotExist())
            .andReturn().getRequest().getSession(false);

        assertThat(session).isNotNull();
        mockMvc.perform(get("/api/auth/me").session(session))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.id").value(id))
            .andExpect(jsonPath("$.passwordHash").doesNotExist());
    }

    private String userJson(String username, String fullName, String password, String legacyCode, boolean active) throws Exception {
        Map<String, Object> body = new LinkedHashMap<>(Map.of("username", username, "fullName", fullName, "profileId", profileId(legacyCode), "active", active));
        if (password != null) {
            body.put("password", password);
        }
        return objectMapper.writeValueAsString(body);
    }

    private UserAccount createUser(String username, String fullName, String password) {
        UserAccount user = new UserAccount();
        user.setUsername(username);
        user.setFullName(fullName);
        user.setPasswordHash(passwordEncoder.encode(password));
        AccessTestSupport.assignProfile(accessProfiles, user, "SERVICE_DESK");
        user.setActive(true);
        return userAccountRepository.save(user);
    }
}
