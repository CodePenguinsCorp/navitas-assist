package br.com.navitasassist.access;

import static br.com.navitasassist.access.AccessTestSupport.asProfile;
import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.util.HashSet;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;

import br.com.navitasassist.controller.BusinessException;
import br.com.navitasassist.repository.AccessProfileRepository;
import br.com.navitasassist.repository.UserAccountRepository;
import br.com.navitasassist.service.AdministratorGuard;
import br.com.navitasassist.service.EffectivePermissionService;
import br.com.navitasassist.user.UserAccount;
import br.com.navitasassist.user.UserAccountTestSupport;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

/** Spec §4.3: sempre resta ao menos um usuário ativo com {@code usuarios.gerir} e {@code perfis.gerir}. */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
class AdministratorGuardIntegrationTest {

    private static final String MESSAGE = "É preciso manter ao menos um administrador ativo.";
    private static final String SECOND = "guard.second";
    private static final String BY_EXTRAS = "guard.by.extras";

    @Autowired private MockMvc mvc;
    @Autowired private ObjectMapper mapper;
    @Autowired private UserAccountRepository users;
    @Autowired private AccessProfileRepository profiles;
    @Autowired private PasswordEncoder passwordEncoder;
    @Autowired private AdministratorGuard guard;
    @Autowired private EffectivePermissionService effectivePermissions;
    @Autowired private PlatformTransactionManager transactions;
    private UserAccount admin;

    @BeforeEach
    void prepare() {
        restore();
        admin = users.findByUsernameIgnoreCase("admin").orElseThrow();
    }

    @AfterEach
    void restore() {
        AccessTestSupport.deleteAccounts(users, SECOND, BY_EXTRAS);
        UserAccount seed = UserAccountTestSupport.ensureAdmin(users, profiles, passwordEncoder);
        AccessTestSupport.assignProfile(profiles, seed, "ADMIN");
        seed.setExtraPermissions(new HashSet<>());
        seed.setActive(true);
        users.saveAndFlush(seed);
    }

    @Test
    void rejectsDemotingLastAdministrator() throws Exception {
        mvc.perform(put("/api/users/{id}", admin.getId()).with(asProfile("admin", "ADMIN")).with(csrf())
                .contentType(MediaType.APPLICATION_JSON).content(payload(admin, "SERVICE_DESK", true)))
            .andExpect(status().isBadRequest()).andExpect(jsonPath("$.message").value(MESSAGE));
        assertEquals(1, activeAdministrators());
    }

    @Test
    void rejectsDeactivatingLastAdministrator() throws Exception {
        mvc.perform(put("/api/users/{id}", admin.getId()).with(asProfile("admin", "ADMIN")).with(csrf())
                .contentType(MediaType.APPLICATION_JSON).content(payload(admin, "ADMIN", false)))
            .andExpect(status().isBadRequest()).andExpect(jsonPath("$.message").value(MESSAGE));
        assertEquals(1, activeAdministrators());
    }

    @Test
    void rejectsRemovingAdminPermissionFromLastAdministratorsProfile() {
        AccessProfile adminProfile = profiles.findByLegacyCode("ADMIN").orElseThrow();
        Set<String> withoutProfiles = new HashSet<>(adminProfile.getPermissions());
        withoutProfiles.remove("perfis.gerir");

        BusinessException refused = assertThrows(BusinessException.class, () -> inTransaction(() -> {
            guard.lockAccessGraph();
            guard.ensureRemainsAfterProfileChange(adminProfile, withoutProfiles);
        }));
        assertEquals(MESSAGE, refused.getMessage());

        Set<String> withoutRules = new HashSet<>(adminProfile.getPermissions());
        withoutRules.remove("notificacoes.regras");
        assertDoesNotThrow(() -> inTransaction(() -> {
            guard.lockAccessGraph();
            guard.ensureRemainsAfterProfileChange(adminProfile, withoutRules);
        }));
    }

    @Test
    void extrasCountAsAdministrator() throws Exception {
        saveByExtras(true);

        mvc.perform(put("/api/users/{id}", admin.getId()).with(asProfile("admin", "ADMIN")).with(csrf())
                .contentType(MediaType.APPLICATION_JSON).content(payload(admin, "VIEWER", true)))
            .andExpect(status().isOk());
        assertEquals(1, activeAdministrators());

        UserAccount byExtras = users.findByUsernameIgnoreCase(BY_EXTRAS).orElseThrow();
        // O ator é um administrador inativo: passa na regra anti-escalada e não conta como administrador restante.
        UserAccount inactiveActor = AccessTestSupport.saveAccount(users, profiles, passwordEncoder, SECOND, "ADMIN");
        inactiveActor.setActive(false);
        users.saveAndFlush(inactiveActor);
        // Único administrador, só pelas extras: trocar o perfil mantendo as extras mantém a administração.
        mvc.perform(put("/api/users/{id}", byExtras.getId()).with(asProfile(SECOND, "ADMIN")).with(csrf())
                .contentType(MediaType.APPLICATION_JSON).content(payload(byExtras, "TECHNICIAN", Set.of("usuarios.gerir", "perfis.gerir"), true)))
            .andExpect(status().isOk());
        assertEquals(1, activeAdministrators());

        mvc.perform(delete("/api/users/{id}", byExtras.getId()).with(asProfile("admin", "ADMIN")).with(csrf()))
            .andExpect(status().isBadRequest()).andExpect(jsonPath("$.message").value(MESSAGE));
        assertTrue(users.existsById(byExtras.getId()));
    }

    @Test
    void inactiveAdministratorDoesNotCount() throws Exception {
        saveByExtras(false);
        UserAccount second = AccessTestSupport.saveAccount(users, profiles, passwordEncoder, SECOND, "ADMIN");
        second.setActive(false);
        users.saveAndFlush(second);

        mvc.perform(put("/api/users/{id}", admin.getId()).with(asProfile("admin", "ADMIN")).with(csrf())
                .contentType(MediaType.APPLICATION_JSON).content(payload(admin, "TECHNICIAN", true)))
            .andExpect(status().isBadRequest()).andExpect(jsonPath("$.message").value(MESSAGE));
        assertEquals(1, activeAdministrators());
    }

    @Test
    void allowsChangeWhenNoAdministratorExists() {
        admin.setActive(false);
        users.saveAndFlush(admin);
        AccessProfile adminProfile = profiles.findByLegacyCode("ADMIN").orElseThrow();
        AccessProfile viewer = profiles.findByLegacyCode("VIEWER").orElseThrow();
        UserAccount inactiveAdmin = users.findById(admin.getId()).orElseThrow();

        assertDoesNotThrow(() -> inTransaction(() -> {
            guard.lockAccessGraph();
            guard.ensureRemainsAfterProfileChange(adminProfile, Set.of());
            guard.ensureRemainsAfterUserChange(inactiveAdmin, viewer, Set.of(), false);
            guard.ensureRemainsAfterUserDeletion(inactiveAdmin);
        }));
    }

    @Test
    void reactivatingOrPromotingNeverFails() {
        UserAccount second = AccessTestSupport.saveAccount(users, profiles, passwordEncoder, SECOND, "VIEWER");
        AccessProfile adminProfile = profiles.findByLegacyCode("ADMIN").orElseThrow();

        assertDoesNotThrow(() -> inTransaction(() -> {
            guard.lockAccessGraph();
            guard.ensureRemainsAfterUserChange(second, adminProfile, Set.of(), true);
        }));
        BusinessException refused = assertThrows(BusinessException.class, () -> inTransaction(() -> {
            guard.lockAccessGraph();
            guard.ensureRemainsAfterUserDeletion(users.findById(admin.getId()).orElseThrow());
        }));
        assertEquals(MESSAGE, refused.getMessage());
    }

    @Test
    void concurrentDemotionsKeepOneAdministrator() throws Exception {
        UserAccount byExtras = saveByExtras(true);
        var pool = Executors.newFixedThreadPool(2);
        var ready = new CountDownLatch(2);
        var start = new CountDownLatch(1);
        try {
            var demoteSeed = pool.submit(() -> {
                ready.countDown();
                if (!start.await(10, TimeUnit.SECONDS)) throw new IllegalStateException("Barrier timed out");
                return mvc.perform(put("/api/users/{id}", admin.getId()).with(asProfile(BY_EXTRAS, "ADMIN")).with(csrf())
                    .contentType(MediaType.APPLICATION_JSON).content(payload(admin, "VIEWER", true))).andReturn().getResponse().getStatus();
            });
            var deactivateOther = pool.submit(() -> {
                ready.countDown();
                if (!start.await(10, TimeUnit.SECONDS)) throw new IllegalStateException("Barrier timed out");
                return mvc.perform(put("/api/users/{id}", byExtras.getId()).with(asProfile("admin", "ADMIN")).with(csrf())
                    .contentType(MediaType.APPLICATION_JSON).content(payload(byExtras, "VIEWER", false))).andReturn().getResponse().getStatus();
            });
            assertTrue(ready.await(10, TimeUnit.SECONDS));
            start.countDown();
            int first = demoteSeed.get(20, TimeUnit.SECONDS);
            int second = deactivateOther.get(20, TimeUnit.SECONDS);
            assertTrue((first == 200 && second == 400) || (first == 400 && second == 200),
                "Esperava um sucesso e uma recusa, recebeu " + first + "/" + second);
            assertEquals(1, activeAdministrators());
        } finally {
            start.countDown();
            pool.shutdownNow();
            assertTrue(pool.awaitTermination(10, TimeUnit.SECONDS));
        }
    }

    /** Usuário com o perfil Consulta que é administrador só pelas extras. */
    private UserAccount saveByExtras(boolean active) {
        UserAccount account = AccessTestSupport.saveAccountWithProfile(users, passwordEncoder, BY_EXTRAS,
            profiles.findByLegacyCode("VIEWER").orElseThrow(), Set.of("usuarios.gerir", "perfis.gerir"));
        account.setActive(active);
        return users.saveAndFlush(account);
    }

    private long activeAdministrators() {
        return users.findAll().stream().filter(account -> account.isActive() && effectivePermissions.isAdministrator(account)).count();
    }

    private void inTransaction(Runnable action) {
        new TransactionTemplate(transactions).executeWithoutResult(status -> action.run());
    }

    private String payload(UserAccount account, String role, boolean active) throws Exception {
        return payload(account, role, Set.of(), active);
    }

    private String payload(UserAccount account, String role, Set<String> extras, boolean active) throws Exception {
        return mapper.writeValueAsString(Map.of("username", account.getUsername(), "fullName", account.getFullName(),
            "profileId", profiles.findByLegacyCode(role).orElseThrow().getId(), "extraPermissions", extras, "active", active));
    }
}
