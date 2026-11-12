package br.com.navitasassist.access;

import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user;

import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

import br.com.navitasassist.repository.AccessProfileRepository;
import br.com.navitasassist.repository.UserAccountRepository;
import br.com.navitasassist.user.UserAccount;
import br.com.navitasassist.user.UserRole;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.web.servlet.request.RequestPostProcessor;

/**
 * Auxiliares de acesso para os testes. Concentram a forma de simular um perfil, para que a troca de role por
 * permissões aconteça num só lugar.
 */
public final class AccessTestSupport {

    public static final String DEFAULT_PASSWORD = "password123";

    /** Um hash por codificador: o BCrypt é caro, e os testes de matriz criam usuários a cada caso. */
    private static final Map<PasswordEncoder, String> PASSWORD_HASHES = new ConcurrentHashMap<>();

    private AccessTestSupport() {
    }

    /** Principal de teste (sem consulta ao banco) com o acesso do perfil legado {@code legacyCode}. */
    public static RequestPostProcessor asProfile(String username, String legacyCode) {
        return user(username).roles(legacyCode);
    }

    /** Grava um usuário ativo com senha {@value #DEFAULT_PASSWORD} e o perfil legado {@code legacyCode}. */
    public static UserAccount saveAccount(
        UserAccountRepository users,
        AccessProfileRepository profiles,
        PasswordEncoder passwordEncoder,
        String username,
        String legacyCode
    ) {
        UserAccount account = new UserAccount();
        account.setUsername(username);
        account.setFullName(username);
        account.setPasswordHash(PASSWORD_HASHES.computeIfAbsent(passwordEncoder, encoder -> encoder.encode(DEFAULT_PASSWORD)));
        assignProfile(profiles, account, legacyCode);
        account.setActive(true);
        return users.saveAndFlush(account);
    }

    /** Grava o role e o perfil migrado equivalente ({@code legacy_code}); não salva a conta. */
    public static UserAccount assignProfile(AccessProfileRepository profiles, UserAccount account, String legacyCode) {
        account.setRole(UserRole.valueOf(legacyCode));
        account.setProfile(profiles.findByLegacyCode(legacyCode)
            .orElseThrow(() -> new IllegalStateException("Perfil migrado ausente: " + legacyCode)));
        return account;
    }

    public static void deleteAccounts(UserAccountRepository users, String... usernames) {
        for (String username : usernames) {
            users.findByUsernameIgnoreCase(username).ifPresent(users::delete);
        }
        users.flush();
    }
}
