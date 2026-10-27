package br.com.navitasassist.auth;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.util.LinkedHashMap;
import java.nio.charset.StandardCharsets;
import java.util.Map;
import java.util.UUID;
import java.util.stream.Stream;

import br.com.navitasassist.config.InitialDataConfig;
import br.com.navitasassist.controller.BusinessException;
import br.com.navitasassist.repository.UserAccountRepository;
import br.com.navitasassist.user.UserAccount;
import br.com.navitasassist.user.UserRole;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.MethodSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.web.context.HttpSessionSecurityContextRepository;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;

@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
class PasswordBoundaryIntegrationTest {

    @Autowired private MockMvc mockMvc;
    @Autowired private ObjectMapper objectMapper;
    @Autowired private UserAccountRepository accounts;
    @Autowired private PasswordEncoder encoder;
    private String username;

    @BeforeEach
    void prepareUsername() {
        username = "password." + UUID.randomUUID();
    }

    @AfterEach
    void cleanOwnAccounts() {
        accounts.findAll().stream().filter(account -> account.getUsername().equals(username)).forEach(accounts::delete);
    }

    static Stream<String> excessivePasswords() {
        return Stream.of("A".repeat(73), "á".repeat(37), "😀".repeat(19));
    }

    static Stream<String> validPasswords() {
        return Stream.of("A".repeat(72), "á".repeat(36), "😀".repeat(18), " padded-password ");
    }

    static Stream<String> excessiveUpdatePasswords() {
        return Stream.concat(excessivePasswords(), Stream.of("\u3000".repeat(25)));
    }

    @ParameterizedTest
    @MethodSource("excessivePasswords")
    void shouldRejectExcessivePasswordOnCreate(String password) throws Exception {
        long count = accounts.count();
        MvcResult result = mockMvc.perform(post("/api/users").with(user("admin").roles("ADMIN")).with(csrf())
                .contentType(MediaType.APPLICATION_JSON).content(userJson(password)))
            .andExpect(status().isBadRequest()).andReturn();
        assertThat(result.getResponse().getContentAsString(StandardCharsets.UTF_8)).doesNotContain(password);
        assertThat(accounts.count()).isEqualTo(count);
        assertThat(accounts.findByUsernameIgnoreCase(username)).isEmpty();
    }

    @ParameterizedTest
    @MethodSource("excessiveUpdatePasswords")
    void shouldRejectExcessivePasswordOnUpdateWithoutPartialChanges(String password) throws Exception {
        UserAccount original = existingAccount("original-password");
        mockMvc.perform(put("/api/users/{id}", original.getId()).with(user("admin").roles("ADMIN")).with(csrf())
                .contentType(MediaType.APPLICATION_JSON).content(userJson(password)))
            .andExpect(status().isBadRequest());
        UserAccount persisted = accounts.findById(original.getId()).orElseThrow();
        assertThat(persisted.getPasswordHash()).isEqualTo(original.getPasswordHash());
        assertThat(persisted.getFullName()).isEqualTo("Original user");
        assertThat(persisted.getRole()).isEqualTo(UserRole.VIEWER);
        assertThat(persisted.isActive()).isTrue();
        login("original-password", 200);
    }

    @ParameterizedTest
    @MethodSource("validPasswords")
    void shouldAcceptValidPasswordsAndRejectAnAppendedSuffix(String password) throws Exception {
        String response = mockMvc.perform(post("/api/users").with(user("admin").roles("ADMIN")).with(csrf())
                .contentType(MediaType.APPLICATION_JSON).content(userJson(password, true)))
            .andExpect(status().isCreated())
            .andExpect(jsonPath("$.password").doesNotExist())
            .andExpect(jsonPath("$.passwordHash").doesNotExist())
            .andReturn().getResponse().getContentAsString(StandardCharsets.UTF_8);
        long id = objectMapper.readTree(response).get("id").asLong();
        login(password, 200);
        login(password + "x", 401);

        mockMvc.perform(put("/api/users/{id}", id).with(user("admin").roles("ADMIN")).with(csrf())
                .contentType(MediaType.APPLICATION_JSON).content(userJson(password, true)))
            .andExpect(status().isOk());
        UserAccount updated = accounts.findById(id).orElseThrow();
        assertThat(encoder.matches(password, updated.getPasswordHash())).isTrue();
        login(password, 200);
    }

    @ParameterizedTest
    @MethodSource("excessivePasswords")
    void shouldRejectExcessiveEncodingAtTheConfiguredEncoder(String password) {
        assertThatThrownBy(() -> encoder.encode(password)).isInstanceOf(BusinessException.class)
            .hasMessage("Password must contain at most 72 UTF-8 bytes.");
    }

    @ParameterizedTest
    @MethodSource("excessivePasswords")
    void shouldRejectExcessiveSeedPasswordBeforeSavingAnAdministrator(String password) {
        UserAccountRepository emptyAccounts = mock(UserAccountRepository.class);
        InitialDataConfig initialData = new InitialDataConfig(encoder);
        ReflectionTestUtils.setField(initialData, "seedUsername", "test-seed");
        ReflectionTestUtils.setField(initialData, "seedFullName", "Test seed");
        ReflectionTestUtils.setField(initialData, "seedPassword", password);
        assertThatThrownBy(() -> initialData.seedAdminUser(emptyAccounts).run()).isInstanceOf(BusinessException.class)
            .hasMessage("Password must contain at most 72 UTF-8 bytes.");
        verify(emptyAccounts, never()).save(any());
    }

    @Test
    void shouldPreserveAnExistingShortBcryptHashAndAnOmittedPassword() throws Exception {
        UserAccount existing = existingAccount("original-password");
        String originalHash = existing.getPasswordHash();
        login("original-password", 200);
        mockMvc.perform(put("/api/users/{id}", existing.getId()).with(user("admin").roles("ADMIN")).with(csrf())
                .contentType(MediaType.APPLICATION_JSON).content(userJson(null)))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.passwordHash").doesNotExist());
        assertThat(accounts.findById(existing.getId()).orElseThrow().getPasswordHash()).isEqualTo(originalHash);
    }

    @Test
    void shouldPreserveAnOptionalBlankPassword() throws Exception {
        UserAccount existing = existingAccount("original-password");
        mockMvc.perform(put("/api/users/{id}", existing.getId()).with(user("admin").roles("ADMIN")).with(csrf())
                .contentType(MediaType.APPLICATION_JSON).content(userJson("      ")))
            .andExpect(status().isOk());
        assertThat(accounts.findById(existing.getId()).orElseThrow().getPasswordHash()).isEqualTo(existing.getPasswordHash());
    }

    @Test
    void shouldRejectAnExcessiveLoginAgainstAnOldTruncatedHash() throws Exception {
        existingAccount("A".repeat(72) + "a");
        login("A".repeat(72) + "b", 401);
        login("unknown-password-user", "A".repeat(72) + "b", 401);
    }

    private UserAccount existingAccount(String password) {
        UserAccount account = new UserAccount();
        account.setUsername(username);
        account.setFullName("Original user");
        account.setRole(UserRole.VIEWER);
        account.setActive(true);
        account.setPasswordHash(new BCryptPasswordEncoder().encode(password));
        return accounts.saveAndFlush(account);
    }

    private void login(String password, int expectedStatus) throws Exception {
        login(username, password, expectedStatus);
    }

    private void login(String loginUsername, String password, int expectedStatus) throws Exception {
        MvcResult result = mockMvc.perform(post("/api/auth/login").with(csrf()).contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(Map.of("username", loginUsername, "password", password))))
            .andExpect(status().is(expectedStatus)).andReturn();
        if (expectedStatus == 401) {
            assertThat(objectMapper.readTree(result.getResponse().getContentAsString(StandardCharsets.UTF_8)).get("message").asText())
                .isEqualTo("Usuário ou senha inválidos.");
            if (result.getRequest().getSession(false) != null) {
                assertThat(result.getRequest().getSession(false).getAttribute(HttpSessionSecurityContextRepository.SPRING_SECURITY_CONTEXT_KEY)).isNull();
            }
        }
    }

    private String userJson(String password) throws Exception {
        return userJson(password, false);
    }

    private String userJson(String password, boolean active) throws Exception {
        Map<String, Object> body = new LinkedHashMap<>(Map.of("username", username, "fullName", "Changed user", "role", "ADMIN", "active", active));
        if (password != null) {
            body.put("password", password);
        }
        return objectMapper.writeValueAsString(body);
    }
}
