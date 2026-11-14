package br.com.navitasassist;

import static org.junit.jupiter.api.Assertions.assertEquals;

import br.com.navitasassist.repository.UserAccountRepository;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;

// Banco próprio e vazio: os outros testes criam usuários no banco compartilhado.
@SpringBootTest(properties = "navitas.test.database=startup")
@ActiveProfiles("test")
class NavitasAssistApplicationTests {

    @Autowired
    private UserAccountRepository users;

    @Test
    void startsWithoutCreatingAnyUser() {
        assertEquals(0, users.count());
    }
}
