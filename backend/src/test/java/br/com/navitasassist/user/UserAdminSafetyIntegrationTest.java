package br.com.navitasassist.user;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.util.Map;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;

import br.com.navitasassist.repository.UserAccountRepository;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;

@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
class UserAdminSafetyIntegrationTest {
    private static final String SECOND = "admin.safety.secondary";
    @Autowired private MockMvc mvc;
    @Autowired private ObjectMapper mapper;
    @Autowired private UserAccountRepository users;
    private UserAccount admin;
    private String originalAdminName;

    @BeforeEach
    void prepare() {
        restore();
        admin = users.findByUsernameIgnoreCase("admin").orElseThrow();
        originalAdminName = admin.getFullName();
    }

    @AfterEach
    void restore() {
        UserAccount seed = users.findByUsernameIgnoreCase("admin").orElseThrow();
        seed.setRole(UserRole.ADMIN);
        seed.setActive(true);
        if (originalAdminName != null) seed.setFullName(originalAdminName);
        users.saveAndFlush(seed);
        users.findByUsernameIgnoreCase(SECOND).ifPresent(users::delete);
    }

    @ParameterizedTest
    @CsvSource({ "ADMIN,false", "VIEWER,true", "TECHNICIAN,false" })
    void rejectsLossOfLastAdminAndPreservesAccount(UserRole role, boolean active) throws Exception {
        mvc.perform(put("/api/users/{id}", admin.getId()).with(user("admin").roles("ADMIN")).with(csrf())
                .contentType(MediaType.APPLICATION_JSON).content(payload(admin, role, active)))
            .andExpect(status().isBadRequest()).andExpect(jsonPath("$.message").value("At least one active administrator must remain."));
        UserAccount saved = users.findById(admin.getId()).orElseThrow();
        assertEquals(UserRole.ADMIN, saved.getRole());
        assertTrue(saved.isActive());
        assertEquals(admin.getPasswordHash(), saved.getPasswordHash());
    }

    @Test
    void inactiveAdminDoesNotCountAsReplacement() throws Exception {
        second(false);
        mvc.perform(put("/api/users/{id}", admin.getId()).with(user("admin").roles("ADMIN")).with(csrf())
                .contentType(MediaType.APPLICATION_JSON).content(payload(admin, UserRole.VIEWER, true)))
            .andExpect(status().isBadRequest());
        assertEquals(1, activeAdmins());
    }

    @Test
    void cannotDeleteLastAdminUsingAnotherPreviouslyAdministrativeSession() throws Exception {
        UserAccount only = second(true);
        admin.setRole(UserRole.VIEWER);
        users.saveAndFlush(admin);
        mvc.perform(delete("/api/users/{id}", only.getId()).with(user("admin").roles("ADMIN")).with(csrf()))
            .andExpect(status().isBadRequest()).andExpect(jsonPath("$.message").value("At least one active administrator must remain."));
        assertTrue(users.existsById(only.getId()));
        assertEquals(1, activeAdmins());
    }

    @Test
    void allowsHarmlessEditToLastAdmin() throws Exception {
        mvc.perform(put("/api/users/{id}", admin.getId()).with(user("admin").roles("ADMIN")).with(csrf())
                .contentType(MediaType.APPLICATION_JSON).content(mapper.writeValueAsString(Map.of("username", admin.getUsername(), "fullName", "Administrator updated", "role", "ADMIN", "active", true))))
            .andExpect(status().isOk()).andExpect(jsonPath("$.role").value("ADMIN")).andExpect(jsonPath("$.active").value(true))
            .andExpect(jsonPath("$.fullName").value("Administrator updated"));
        assertEquals(1, activeAdmins());
    }

    @ParameterizedTest
    @ValueSource(strings = { "deactivate", "demote", "delete" })
    void allowsLossWhenAnotherActiveAdminRemains(String operation) throws Exception {
        UserAccount other = second(true);
        if (operation.equals("delete")) {
            mvc.perform(delete("/api/users/{id}", other.getId()).with(user("admin").roles("ADMIN")).with(csrf())).andExpect(status().isNoContent());
        } else {
            mvc.perform(put("/api/users/{id}", other.getId()).with(user("admin").roles("ADMIN")).with(csrf())
                    .contentType(MediaType.APPLICATION_JSON).content(payload(other, operation.equals("demote") ? UserRole.SERVICE_DESK : UserRole.ADMIN, !operation.equals("deactivate"))))
                .andExpect(status().isOk());
        }
        assertEquals(1, activeAdmins());
    }

    @ParameterizedTest
    @ValueSource(booleans = { false, true })
    void concurrentReductionsLeaveOneActiveAdmin(boolean deleteSecond) throws Exception {
        UserAccount other = second(true);
        var pool = Executors.newFixedThreadPool(2);
        var ready = new CountDownLatch(2);
        var start = new CountDownLatch(1);
        try {
            var first = pool.submit(() -> {
                ready.countDown();
                if (!start.await(10, TimeUnit.SECONDS)) throw new IllegalStateException("Barrier timed out");
                return mvc.perform(put("/api/users/{id}", admin.getId()).with(user(SECOND).roles("ADMIN")).with(csrf())
                    .contentType(MediaType.APPLICATION_JSON).content(payload(admin, UserRole.VIEWER, true))).andReturn().getResponse().getStatus();
            });
            var second = pool.submit(() -> {
                ready.countDown();
                if (!start.await(10, TimeUnit.SECONDS)) throw new IllegalStateException("Barrier timed out");
                var request = deleteSecond ? delete("/api/users/{id}", other.getId()) : put("/api/users/{id}", other.getId()).contentType(MediaType.APPLICATION_JSON).content(payload(other, UserRole.ADMIN, false));
                return mvc.perform(request.with(user("admin").roles("ADMIN")).with(csrf())).andReturn().getResponse().getStatus();
            });
            assertTrue(ready.await(10, TimeUnit.SECONDS));
            start.countDown();
            int firstStatus = first.get(20, TimeUnit.SECONDS);
            int secondStatus = second.get(20, TimeUnit.SECONDS);
            assertTrue((firstStatus == 200 && secondStatus == 400) || (firstStatus == 400 && secondStatus == (deleteSecond ? 204 : 200)), "Expected one success and one business refusal, got " + firstStatus + "/" + secondStatus);
            assertEquals(1, activeAdmins());
        } finally {
            start.countDown();
            pool.shutdownNow();
            assertTrue(pool.awaitTermination(10, TimeUnit.SECONDS));
        }
    }

    @Test
    void nonAdminsRemainForbidden() throws Exception {
        for (String role : new String[] { "VIEWER", "TECHNICIAN", "SERVICE_DESK" }) {
            mvc.perform(put("/api/users/{id}", admin.getId()).with(user("operator").roles(role)).with(csrf())
                    .contentType(MediaType.APPLICATION_JSON).content(payload(admin, UserRole.VIEWER, true))).andExpect(status().isForbidden());
            mvc.perform(delete("/api/users/{id}", admin.getId()).with(user("operator").roles(role)).with(csrf())).andExpect(status().isForbidden());
        }
        assertEquals(1, activeAdmins());
    }

    private UserAccount second(boolean active) {
        UserAccount other = new UserAccount();
        other.setUsername(SECOND);
        other.setFullName("Safety test administrator");
        other.setPasswordHash(admin.getPasswordHash());
        other.setRole(UserRole.ADMIN);
        other.setActive(active);
        return users.saveAndFlush(other);
    }

    private String payload(UserAccount account, UserRole role, boolean active) throws Exception {
        return mapper.writeValueAsString(Map.of("username", account.getUsername(), "fullName", account.getFullName(), "role", role, "active", active));
    }

    private long activeAdmins() {
        return users.findAll().stream().filter(account -> account.isActive() && account.getRole() == UserRole.ADMIN).count();
    }
}
