package br.com.navitasassist.auth;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertNotEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.doAnswer;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.TimeoutException;

import br.com.navitasassist.repository.UserAccountRepository;
import br.com.navitasassist.service.UserAccountService;
import br.com.navitasassist.user.UserAccount;
import br.com.navitasassist.user.UserAccountUpdateRequest;
import br.com.navitasassist.user.UserRole;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.SpyBean;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockHttpSession;
import org.springframework.security.authentication.AuthenticationManager;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.session.SessionRegistry;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
class SessionRevocationIntegrationTest {
    private static final String TARGET = "session.target";
    @Autowired private MockMvc mvc;
    @Autowired private ObjectMapper mapper;
    @Autowired private UserAccountRepository users;
    @Autowired private UserAccountService service;
    @Autowired private PasswordEncoder encoder;
    @Autowired private PlatformTransactionManager transactions;
    @Autowired private ObjectProvider<SessionRegistry> registries;
    @SpyBean private AuthenticationManager authenticationManager;
    private final List<MockHttpSession> sessions = new ArrayList<>();
    private UserAccount target;
    private MockHttpSession actor;
    private MockHttpSession first;
    private MockHttpSession second;

    @BeforeEach
    void prepare() throws Exception {
        users.findAll().stream().filter(account -> account.getUsername().startsWith(TARGET)).forEach(users::delete);
        target = createTarget();
        actor = login("admin", "admin123");
        first = login(TARGET, "password123");
        second = login(TARGET, "password123");
    }

    @AfterEach
    void cleanup() {
        SessionRegistry registry = registries.getIfAvailable();
        for (MockHttpSession session : sessions) {
            if (registry != null) registry.removeSessionInformation(session.getId());
            if (!session.isInvalid()) session.invalidate();
        }
        users.findAll().stream().filter(account -> account.getUsername().startsWith(TARGET)).forEach(users::delete);
    }

    @ParameterizedTest
    @ValueSource(strings = { "inactive", "role", "username", "password", "delete" })
    void securityChangeRevokesAllTargetSessionsAndKeepsOtherAccounts(String change) throws Exception {
        Map<String, Object> payload = updatePayload();
        switch (change) {
            case "inactive" -> payload.put("active", false);
            case "role" -> payload.put("role", "VIEWER");
            case "username" -> payload.put("username", TARGET + ".renamed");
            case "password" -> payload.put("password", "replacement-password");
            default -> { }
        }
        if (change.equals("delete")) {
            mvc.perform(delete("/api/users/{id}", target.getId()).session(actor).with(csrf())).andExpect(status().isNoContent());
        } else {
            mvc.perform(put("/api/users/{id}", target.getId()).session(actor).with(csrf()).contentType(MediaType.APPLICATION_JSON).content(mapper.writeValueAsString(payload))).andExpect(status().isOk());
        }
        for (MockHttpSession session : List.of(first, second)) {
            mvc.perform(get("/api/products").session(session)).andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.message").value("Unauthorized")).andExpect(header().doesNotExist(HttpHeaders.WWW_AUTHENTICATE));
            assertTrue(session.isInvalid());
        }
        mvc.perform(get("/api/users").session(actor)).andExpect(status().isOk());
        if (List.of("inactive", "delete", "password", "username").contains(change)) {
            mvc.perform(post("/api/auth/login").with(csrf()).contentType(MediaType.APPLICATION_JSON).content(mapper.writeValueAsString(Map.of("username", TARGET, "password", "password123"))))
                .andExpect(status().isUnauthorized());
        }
        if (change.equals("role")) {
            MockHttpSession refreshed = login(TARGET, "password123");
            mvc.perform(get("/api/products").session(refreshed)).andExpect(status().isOk());
            mvc.perform(get("/api/users").session(refreshed)).andExpect(status().isForbidden());
            mvc.perform(put("/api/users/{id}", target.getId()).session(refreshed).with(csrf())
                .contentType(MediaType.APPLICATION_JSON).content(mapper.writeValueAsString(updatePayload())))
                .andExpect(status().isForbidden());
            mvc.perform(delete("/api/users/{id}", target.getId()).session(refreshed).with(csrf()))
                .andExpect(status().isForbidden());
            mvc.perform(get("/api/products").session(refreshed)).andExpect(status().isOk());
        } else if (change.equals("password")) {
            mvc.perform(get("/api/auth/me").session(login(TARGET, "replacement-password"))).andExpect(status().isOk());
        } else if (change.equals("username")) {
            mvc.perform(get("/api/auth/me").session(login(TARGET + ".renamed", "password123"))).andExpect(status().isOk());
        }
    }

    @Test
    void harmlessEditAndInvalidOperationsKeepSessions() throws Exception {
        Map<String, Object> payload = updatePayload();
        payload.put("fullName", "Updated display name");
        mvc.perform(put("/api/users/{id}", target.getId()).session(actor).with(csrf()).contentType(MediaType.APPLICATION_JSON).content(mapper.writeValueAsString(payload)))
            .andExpect(status().isOk());
        mvc.perform(put("/api/users/{id}", target.getId()).session(actor).with(csrf()).contentType(MediaType.APPLICATION_JSON).content("{}"))
            .andExpect(status().isBadRequest());
        mvc.perform(delete("/api/users/{id}", target.getId()).session(first).with(csrf())).andExpect(status().isBadRequest());
        mvc.perform(get("/api/auth/me").session(first)).andExpect(status().isOk()).andExpect(jsonPath("$.fullName").value("Updated display name"));
        mvc.perform(get("/api/auth/me").session(second)).andExpect(status().isOk());
    }

    @Test
    void rolledBackSecurityChangeDoesNotRevoke() throws Exception {
        new TransactionTemplate(transactions).executeWithoutResult(transaction -> {
            service.update(target.getId(), new UserAccountUpdateRequest(TARGET, target.getFullName(), null, UserRole.VIEWER, false));
            transaction.setRollbackOnly();
        });
        UserAccount saved = users.findById(target.getId()).orElseThrow();
        assertTrue(saved.isActive());
        assertEquals(UserRole.ADMIN, saved.getRole());
        mvc.perform(get("/api/users").session(first)).andExpect(status().isOk());
        mvc.perform(get("/api/users").session(second)).andExpect(status().isOk());
    }

    @Test
    void reusingDeletedUsernameDoesNotRestoreOldSessions() throws Exception {
        mvc.perform(delete("/api/users/{id}", target.getId()).session(actor).with(csrf())).andExpect(status().isNoContent());
        UserAccount replacement = createTarget();
        assertTrue(!replacement.getId().equals(target.getId()));
        MockHttpSession newSession = login(TARGET, "password123");
        mvc.perform(get("/api/users").session(first)).andExpect(status().isUnauthorized());
        mvc.perform(get("/api/users").session(newSession)).andExpect(status().isOk());
    }

    @Test
    void loginRotationAndLogoutRemoveOldRegistryEntries() throws Exception {
        SessionRegistry registry = registries.getObject();
        String oldId = first.getId();
        mvc.perform(post("/api/auth/login").session(first).with(csrf()).contentType(MediaType.APPLICATION_JSON)
            .content(mapper.writeValueAsString(Map.of("username", TARGET, "password", "password123"))))
            .andExpect(status().isOk());
        assertNotEquals(oldId, first.getId());
        assertNull(registry.getSessionInformation(oldId));
        assertEquals(target.getId(), registry.getSessionInformation(first.getId()).getPrincipal());
        mvc.perform(post("/api/auth/logout").session(first).with(csrf())).andExpect(status().isNoContent());
        assertTrue(first.isInvalid());
        assertNull(registry.getSessionInformation(first.getId()));
        mvc.perform(get("/api/users").session(second)).andExpect(status().isOk());
    }

    @Test
    void revokedSessionReturnsUnauthorizedEvenForWriteWithoutCsrf() throws Exception {
        Map<String, Object> payload = updatePayload();
        payload.put("active", false);
        mvc.perform(put("/api/users/{id}", target.getId()).session(actor).with(csrf())
            .contentType(MediaType.APPLICATION_JSON).content(mapper.writeValueAsString(payload))).andExpect(status().isOk());
        mvc.perform(delete("/api/users/{id}", target.getId()).session(first))
            .andExpect(status().isUnauthorized()).andExpect(jsonPath("$.message").value("Unauthorized"));
        assertTrue(first.isInvalid());
        mvc.perform(get("/api/users").session(actor)).andExpect(status().isOk());
    }

    @Test
    void concurrentAccessChangeCannotMissALoginThatAlreadyValidatedOldCredentials() throws Exception {
        var validated = new CountDownLatch(1);
        var finishLogin = new CountDownLatch(1);
        doAnswer(invocation -> {
            Authentication authenticated = (Authentication) invocation.callRealMethod();
            if (authenticated.getName().equals(TARGET)) {
                validated.countDown();
                if (!finishLogin.await(15, TimeUnit.SECONDS)) throw new IllegalStateException("Login barrier timed out");
            }
            return authenticated;
        }).when(authenticationManager).authenticate(any(Authentication.class));
        var pool = Executors.newFixedThreadPool(2);
        try {
            var loggingIn = pool.submit(() -> login(TARGET, "password123"));
            assertTrue(validated.await(10, TimeUnit.SECONDS));
            Map<String, Object> payload = updatePayload();
            payload.put("role", "VIEWER");
            var changing = pool.submit(() -> mvc.perform(put("/api/users/{id}", target.getId()).session(actor).with(csrf())
                .contentType(MediaType.APPLICATION_JSON).content(mapper.writeValueAsString(payload))).andReturn().getResponse().getStatus());
            assertThrows(TimeoutException.class, () -> changing.get(1, TimeUnit.SECONDS));
            finishLogin.countDown();
            MockHttpSession justCreated = loggingIn.get(10, TimeUnit.SECONDS);
            assertEquals(200, changing.get(10, TimeUnit.SECONDS));
            mvc.perform(get("/api/users").session(justCreated)).andExpect(status().isUnauthorized());
        } finally {
            finishLogin.countDown();
            pool.shutdown();
            assertTrue(pool.awaitTermination(20, TimeUnit.SECONDS));
        }
    }

    private UserAccount createTarget() {
        UserAccount account = new UserAccount();
        account.setUsername(TARGET);
        account.setFullName("Session target");
        account.setPasswordHash(encoder.encode("password123"));
        account.setRole(UserRole.ADMIN);
        account.setActive(true);
        return users.saveAndFlush(account);
    }

    private Map<String, Object> updatePayload() {
        return new LinkedHashMap<>(Map.of("username", TARGET, "fullName", target.getFullName(), "role", "ADMIN", "active", true));
    }

    private MockHttpSession login(String username, String password) throws Exception {
        var result = mvc.perform(post("/api/auth/login").with(csrf()).contentType(MediaType.APPLICATION_JSON).content(mapper.writeValueAsString(Map.of("username", username, "password", password))))
            .andExpect(status().isOk()).andReturn();
        MockHttpSession session = (MockHttpSession) result.getRequest().getSession(false);
        assertNotNull(session);
        sessions.add(session);
        return session;
    }
}
