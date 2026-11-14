package br.com.navitasassist.migration;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.ArrayList;
import java.util.List;
import java.util.Set;
import java.util.concurrent.Callable;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;

import br.com.navitasassist.controller.BusinessException;
import br.com.navitasassist.access.ProfileRequest;
import br.com.navitasassist.repository.AccessProfileRepository;
import br.com.navitasassist.repository.UserAccountRepository;
import br.com.navitasassist.service.AccessProfileService;
import br.com.navitasassist.service.UserAccountService;
import br.com.navitasassist.user.UserAccountRequest;
import br.com.navitasassist.user.UserAccountTestSupport;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.context.ActiveProfiles;

/**
 * No PostgreSQL uma violação de constraint aborta a transação. Gravações concorrentes do mesmo nome/e-mail (caixa
 * diferente) terminam com uma gravação e um erro de negócio, nunca com 500, e a aplicação segue gravando depois.
 * Threads reais, sem @Transactional no teste.
 */
@SpringBootTest
@ActiveProfiles("test")
class AbortedTransactionTest {

    @Autowired AccessProfileService profiles;
    @Autowired UserAccountService users;
    @Autowired AccessProfileRepository profileRepository;
    @Autowired UserAccountRepository userRepository;
    @Autowired PasswordEncoder passwordEncoder;

    @BeforeEach
    void ensureAdmin() {
        UserAccountTestSupport.ensureAdmin(userRepository, profileRepository, passwordEncoder);
    }

    @AfterEach
    void cleanUp() {
        userRepository.findAll().stream().filter(user -> user.getUsername().startsWith("race.")).forEach(userRepository::delete);
        profileRepository.findAll().stream().filter(profile -> profile.getName().toLowerCase().startsWith("corrida ")).forEach(profileRepository::delete);
    }

    @Test
    void concurrentProfileNamesDifferingByCaseKeepOneAndRejectTheOther() throws Exception {
        List<Object> outcomes = race(
            () -> profiles.create(new ProfileRequest("Corrida perfil", Set.of("rma.ver")), "admin"),
            () -> profiles.create(new ProfileRequest("CORRIDA PERFIL", Set.of("rma.ver")), "admin"));

        assertOneSuccessAndOneBusinessError(outcomes, "Já existe um perfil com o nome");
        assertThat(profiles.create(new ProfileRequest("Corrida depois", Set.of("rma.ver")), "admin").name()).isEqualTo("Corrida depois");
    }

    @Test
    void concurrentEmailsDifferingByCaseKeepOneAndRejectTheOther() throws Exception {
        Long profileId = profileRepository.findByLegacyCode("VIEWER").orElseThrow().getId();
        List<Object> outcomes = race(
            () -> users.create(new UserAccountRequest("race.one", "Corrida", "password123", profileId, Set.of(), true, "Race@Example.invalid"), "admin"),
            () -> users.create(new UserAccountRequest("race.two", "Corrida", "password123", profileId, Set.of(), true, "race@example.INVALID"), "admin"));

        assertOneSuccessAndOneBusinessError(outcomes, "Email already registered.");
        assertThat(users.create(new UserAccountRequest("race.three", "Corrida", "password123", profileId, Set.of(), true, "race.three@example.invalid"), "admin").username())
            .isEqualTo("race.three");
    }

    private static void assertOneSuccessAndOneBusinessError(List<Object> outcomes, String message) {
        assertThat(outcomes).filteredOn(outcome -> !(outcome instanceof Throwable)).hasSize(1);
        assertThat(outcomes).filteredOn(Throwable.class::isInstance).singleElement()
            .isInstanceOfSatisfying(BusinessException.class, error -> assertThat(error.getMessage()).startsWith(message));
    }

    @SafeVarargs
    private static List<Object> race(Callable<Object>... tasks) throws Exception {
        CountDownLatch start = new CountDownLatch(1);
        ExecutorService executor = Executors.newFixedThreadPool(tasks.length);
        try {
            List<Future<Object>> futures = new ArrayList<>();
            for (Callable<Object> task : tasks) {
                futures.add(executor.submit(() -> {
                    start.await();
                    try {
                        return task.call();
                    } catch (RuntimeException error) {
                        return error;
                    }
                }));
            }
            start.countDown();
            List<Object> outcomes = new ArrayList<>();
            for (Future<Object> future : futures) {
                outcomes.add(future.get(30, TimeUnit.SECONDS));
            }
            return outcomes;
        } finally {
            executor.shutdownNow();
        }
    }
}
