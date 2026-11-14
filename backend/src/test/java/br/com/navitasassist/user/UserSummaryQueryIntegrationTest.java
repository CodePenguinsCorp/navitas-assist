package br.com.navitasassist.user;

import br.com.navitasassist.access.AccessTestSupport;
import br.com.navitasassist.repository.AccessProfileRepository;
import br.com.navitasassist.repository.UserAccountRepository;
import br.com.navitasassist.service.UserAccountService;
import jakarta.persistence.EntityManager;
import jakarta.persistence.EntityManagerFactory;
import org.hibernate.SessionFactory;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.transaction.annotation.Transactional;
import java.util.Set;
import static org.junit.jupiter.api.Assertions.*;

@SpringBootTest
@ActiveProfiles("test")
@Transactional
class UserSummaryQueryIntegrationTest {
    @Autowired UserAccountService service;
    @Autowired UserAccountRepository users;
    @Autowired AccessProfileRepository profiles;
    @Autowired PasswordEncoder encoder;
    @Autowired EntityManager em;
    @Autowired EntityManagerFactory factory;

    @Test
    void countsAllAccountsIncludingInactiveWithoutLoadingAccounts() {
        long before = service.summarize().total();
        var split = AccessTestSupport.saveProfile(profiles, "Resumo dividido", "usuarios.gerir");
        var empty = AccessTestSupport.saveProfile(profiles, "Resumo vazio");
        var inactive = AccessTestSupport.saveAccountWithProfile(users, encoder, "summary-inactive", split, Set.of("perfis.gerir"));
        inactive.setActive(false);
        AccessTestSupport.saveAccountWithProfile(users, encoder, "summary-extra", empty, Set.of("usuarios.gerir", "perfis.gerir"));
        AccessTestSupport.saveAccountWithProfile(users, encoder, "summary-partial", split, Set.of());
        em.flush();
        em.clear();
        var stats = factory.unwrap(SessionFactory.class).getStatistics();
        stats.setStatisticsEnabled(true);
        stats.clear();
        try {
            assertEquals(before + 3, service.summarize().total());
            assertEquals(0, stats.getEntityLoadCount(), "O resumo deve usar somente contagens.");
            assertTrue(stats.getPrepareStatementCount() == 1);
        } finally {
            stats.setStatisticsEnabled(false);
        }
    }
}
