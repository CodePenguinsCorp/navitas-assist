package br.com.navitasassist.user;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.hasItem;
import static org.hamcrest.Matchers.startsWith;
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
import java.util.Map;

import br.com.navitasassist.repository.UserAccountRepository;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockHttpSession;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;

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
    private PasswordEncoder passwordEncoder;

    @BeforeEach
    void cleanTestUsers() {
        userAccountRepository.findAll().stream()
            .filter(user -> !user.getUsername().equalsIgnoreCase("admin"))
            .forEach(userAccountRepository::delete);
    }

    @Test
    void shouldUpdateUserAndKeepPasswordWhenItIsOmitted() throws Exception {
        UserAccount user = createUser("operator", "Operator", "old-password");

        mockMvc.perform(put("/api/users/{id}", user.getId())
                .with(user("admin").roles("ADMIN"))
                .with(csrf())
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(Map.of(
                    "username", "operator.updated",
                    "fullName", "Updated Operator",
                    "role", "TECHNICIAN",
                    "active", true
                ))))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.username").value("operator.updated"))
            .andExpect(jsonPath("$.fullName").value("Updated Operator"))
            .andExpect(jsonPath("$.role").value("TECHNICIAN"));

        UserAccount updatedUser = userAccountRepository.findById(user.getId()).orElseThrow();
        assertTrue(passwordEncoder.matches("old-password", updatedUser.getPasswordHash()));
    }

    @Test
    void shouldDeleteAnotherUser() throws Exception {
        UserAccount user = createUser("delete.me", "Delete Me", "password123");

        mockMvc.perform(delete("/api/users/{id}", user.getId())
                .with(user("admin").roles("ADMIN"))
                .with(csrf()))
            .andExpect(status().isNoContent());

        assertFalse(userAccountRepository.existsById(user.getId()));
    }

    @Test
    void shouldNotDeleteAuthenticatedUser() throws Exception {
        UserAccount admin = userAccountRepository.findByUsernameIgnoreCase("admin").orElseThrow();

        mockMvc.perform(delete("/api/users/{id}", admin.getId())
                .with(user("admin").roles("ADMIN"))
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
                .with(user("admin").roles("ADMIN")).with(csrf())
                .contentType(MediaType.APPLICATION_JSON)
                .content(userJson(username, "Changed name", "changed-password", UserRole.ADMIN, false)))
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
                .with(user("admin").roles("ADMIN")).with(csrf())
                .contentType(MediaType.APPLICATION_JSON)
                .content(userJson(username, "Changed name", "changed-password", UserRole.ADMIN, false)))
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
                .with(user("admin").roles("ADMIN")).with(csrf())
                .contentType(MediaType.APPLICATION_JSON)
                .content(userJson(username, "Updated Operator", null, UserRole.SERVICE_DESK, true)))
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
                .with(user("admin").roles("ADMIN")).with(csrf())
                .contentType(MediaType.APPLICATION_JSON)
                .content(userJson(" unique user ", "Unique User", "original-password", UserRole.SERVICE_DESK, true)))
            .andExpect(status().isCreated())
            .andExpect(jsonPath("$.username").value("unique user"))
            .andExpect(jsonPath("$.password").doesNotExist())
            .andExpect(jsonPath("$.passwordHash").doesNotExist())
            .andReturn().getResponse().getContentAsString();
        long id = objectMapper.readTree(response).get("id").asLong();
        assertThat(userAccountRepository.findById(id).orElseThrow().getUsername()).isEqualTo("unique user");

        mockMvc.perform(put("/api/users/{id}", id)
                .with(user("admin").roles("ADMIN")).with(csrf())
                .contentType(MediaType.APPLICATION_JSON)
                .content(userJson(" changed user ", "Changed User", null, UserRole.SERVICE_DESK, true)))
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
        String body = userJson(" unauthorized.user ", "Changed name", "changed-password", UserRole.ADMIN, false);

        mockMvc.perform(post("/api/users").with(user("unauthorized").roles(role)).with(csrf())
                .contentType(MediaType.APPLICATION_JSON).content(body))
            .andExpect(status().isForbidden());
        mockMvc.perform(put("/api/users/{id}", existing.getId()).with(user("unauthorized").roles(role)).with(csrf())
                .contentType(MediaType.APPLICATION_JSON).content(body))
            .andExpect(status().isForbidden());

        assertThat(userAccountRepository.count()).isEqualTo(count);
        assertUnchanged(existing);
    }

    @Test
    void shouldRejectAccountWritesWithoutCsrf() throws Exception {
        UserAccount existing = createUser("protected.user", "Protected User", "original-password");
        long count = userAccountRepository.count();
        String body = userJson(" unauthorized.user ", "Changed name", "changed-password", UserRole.ADMIN, false);

        mockMvc.perform(post("/api/users").with(user("admin").roles("ADMIN"))
                .contentType(MediaType.APPLICATION_JSON).content(body))
            .andExpect(status().isForbidden());
        mockMvc.perform(put("/api/users/{id}", existing.getId()).with(user("admin").roles("ADMIN"))
                .contentType(MediaType.APPLICATION_JSON).content(body))
            .andExpect(status().isForbidden());

        assertThat(userAccountRepository.count()).isEqualTo(count);
        assertUnchanged(existing);
    }

    @Test
    void shouldRejectUnauthenticatedAccountWrites() throws Exception {
        UserAccount existing = createUser("protected.user", "Protected User", "original-password");
        long count = userAccountRepository.count();
        String body = userJson(" unauthorized.user ", "Changed name", "changed-password", UserRole.ADMIN, false);

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
        String body = userJson("u".repeat(61), "Changed name", "changed-password", UserRole.ADMIN, false);

        mockMvc.perform(post("/api/users").with(user("admin").roles("ADMIN")).with(csrf())
                .contentType(MediaType.APPLICATION_JSON).content(body))
            .andExpect(status().isBadRequest())
            .andExpect(jsonPath("$.details", hasItem(startsWith("username:"))));
        mockMvc.perform(put("/api/users/{id}", existing.getId()).with(user("admin").roles("ADMIN")).with(csrf())
                .contentType(MediaType.APPLICATION_JSON).content(body))
            .andExpect(status().isBadRequest())
            .andExpect(jsonPath("$.details", hasItem(startsWith("username:"))));

        assertThat(userAccountRepository.count()).isEqualTo(count);
        assertUnchanged(existing);
    }

    private void assertUnchanged(UserAccount original) {
        UserAccount persisted = userAccountRepository.findById(original.getId()).orElseThrow();
        assertThat(persisted.getUsername()).isEqualTo(original.getUsername());
        assertThat(persisted.getFullName()).isEqualTo(original.getFullName());
        assertThat(persisted.getPasswordHash()).isEqualTo(original.getPasswordHash());
        assertThat(persisted.getRole()).isEqualTo(original.getRole());
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

    private String userJson(String username, String fullName, String password, UserRole role, boolean active) throws Exception {
        Map<String, Object> body = new LinkedHashMap<>(Map.of("username", username, "fullName", fullName, "role", role, "active", active));
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
        user.setRole(UserRole.SERVICE_DESK);
        user.setActive(true);
        return userAccountRepository.save(user);
    }
}
