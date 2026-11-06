package br.com.navitasassist;

import static org.junit.jupiter.api.Assertions.assertEquals;

import br.com.navitasassist.repository.UserAccountRepository;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;

@SpringBootTest(properties = "spring.datasource.url=jdbc:h2:mem:startup_without_admin;MODE=MySQL;DB_CLOSE_DELAY=-1;DB_CLOSE_ON_EXIT=FALSE")
@ActiveProfiles("test")
class NavitasAssistApplicationTests {

    @Autowired
    private UserAccountRepository users;

    @Test
    void startsWithoutCreatingAnyUser() {
        assertEquals(0, users.count());
    }
}
