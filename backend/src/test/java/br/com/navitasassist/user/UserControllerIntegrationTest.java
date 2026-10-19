package br.com.navitasassist.user;

import static org.hamcrest.Matchers.hasItem;
import static org.hamcrest.Matchers.startsWith;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.httpBasic;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.util.Map;

import br.com.navitasassist.repository.UserAccountRepository;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
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
                .with(httpBasic("admin", "admin123"))
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
    void shouldCreateUserWithNameAndUsernameAtTheirLimits() throws Exception {
        String username = "u".repeat(60);
        String fullName = "N".repeat(80);

        mockMvc.perform(post("/api/users")
                .with(httpBasic("admin", "admin123"))
                .contentType(MediaType.APPLICATION_JSON)
                .content(userJson(username, fullName)))
            .andExpect(status().isCreated())
            .andExpect(jsonPath("$.username").value(username))
            .andExpect(jsonPath("$.fullName").value(fullName));

        assertEquals(fullName, userAccountRepository.findByUsernameIgnoreCase(username).orElseThrow().getFullName());
    }

    @Test
    void shouldUpdateUserWithNameAndUsernameAtTheirLimits() throws Exception {
        UserAccount user = createUser("operator", "Operator", "password123");
        String username = "u".repeat(60);
        String fullName = "N".repeat(80);

        mockMvc.perform(put("/api/users/{id}", user.getId())
                .with(httpBasic("admin", "admin123"))
                .contentType(MediaType.APPLICATION_JSON)
                .content(userJson(username, fullName)))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.username").value(username))
            .andExpect(jsonPath("$.fullName").value(fullName));

        UserAccount updatedUser = userAccountRepository.findById(user.getId()).orElseThrow();
        assertEquals(username, updatedUser.getUsername());
        assertEquals(fullName, updatedUser.getFullName());
    }

    @Test
    void shouldRejectUsernameOverSixtyCharactersOnCreate() throws Exception {
        String username = "u".repeat(61);

        mockMvc.perform(post("/api/users")
                .with(httpBasic("admin", "admin123"))
                .contentType(MediaType.APPLICATION_JSON)
                .content(userJson(username, "Operator")))
            .andExpect(status().isBadRequest())
            .andExpect(jsonPath("$.details", hasItem(startsWith("username:"))));

        assertFalse(userAccountRepository.findByUsernameIgnoreCase(username).isPresent());
    }

    @Test
    void shouldRejectNameOverEightyCharactersOnCreate() throws Exception {
        mockMvc.perform(post("/api/users")
                .with(httpBasic("admin", "admin123"))
                .contentType(MediaType.APPLICATION_JSON)
                .content(userJson("operator", "N".repeat(81))))
            .andExpect(status().isBadRequest())
            .andExpect(jsonPath("$.details", hasItem(startsWith("fullName:"))));

        assertFalse(userAccountRepository.findByUsernameIgnoreCase("operator").isPresent());
    }

    @Test
    void shouldRejectUsernameOverSixtyCharactersOnUpdate() throws Exception {
        UserAccount user = createUser("operator", "Operator", "password123");

        mockMvc.perform(put("/api/users/{id}", user.getId())
                .with(httpBasic("admin", "admin123"))
                .contentType(MediaType.APPLICATION_JSON)
                .content(userJson("u".repeat(61), "Operator")))
            .andExpect(status().isBadRequest())
            .andExpect(jsonPath("$.details", hasItem(startsWith("username:"))));

        assertEquals("operator", userAccountRepository.findById(user.getId()).orElseThrow().getUsername());
    }

    @Test
    void shouldRejectNameOverEightyCharactersOnUpdate() throws Exception {
        UserAccount user = createUser("operator", "Operator", "password123");

        mockMvc.perform(put("/api/users/{id}", user.getId())
                .with(httpBasic("admin", "admin123"))
                .contentType(MediaType.APPLICATION_JSON)
                .content(userJson("operator", "N".repeat(81))))
            .andExpect(status().isBadRequest())
            .andExpect(jsonPath("$.details", hasItem(startsWith("fullName:"))));

        assertEquals("Operator", userAccountRepository.findById(user.getId()).orElseThrow().getFullName());
    }

    @Test
    void shouldDeleteAnotherUser() throws Exception {
        UserAccount user = createUser("delete.me", "Delete Me", "password123");

        mockMvc.perform(delete("/api/users/{id}", user.getId())
                .with(httpBasic("admin", "admin123")))
            .andExpect(status().isNoContent());

        assertFalse(userAccountRepository.existsById(user.getId()));
    }

    @Test
    void shouldNotDeleteAuthenticatedUser() throws Exception {
        UserAccount admin = userAccountRepository.findByUsernameIgnoreCase("admin").orElseThrow();

        mockMvc.perform(delete("/api/users/{id}", admin.getId())
                .with(httpBasic("admin", "admin123")))
            .andExpect(status().isBadRequest())
            .andExpect(jsonPath("$.message").value("You cannot delete your own user account."));

        assertTrue(userAccountRepository.existsById(admin.getId()));
    }

    private String userJson(String username, String fullName) throws Exception {
        return objectMapper.writeValueAsString(Map.of(
            "username", username,
            "fullName", fullName,
            "password", "password123",
            "role", "SERVICE_DESK",
            "active", true
        ));
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
