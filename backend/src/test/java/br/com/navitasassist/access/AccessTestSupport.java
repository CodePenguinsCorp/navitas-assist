package br.com.navitasassist.access;

import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user;

import java.util.HashSet;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;

import br.com.navitasassist.repository.AccessProfileRepository;
import br.com.navitasassist.repository.UserAccountRepository;
import br.com.navitasassist.user.UserAccount;
import br.com.navitasassist.user.UserRole;
import org.springframework.security.core.authority.AuthorityUtils;
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

    /** Principal de teste (sem consulta ao banco) com as permissões do perfil legado {@code legacyCode} ({@link LegacyProfiles}). */
    public static RequestPostProcessor asProfile(String username, String legacyCode) {
        return user(username).authorities(AuthorityUtils.createAuthorityList(LegacyProfiles.authorities(legacyCode)));
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

    /**
     * Grava um usuário ativo com um perfil qualquer (inclusive personalizado) e extras. O role da ponte segue o
     * {@code legacy_code} do perfil, ou {@code VIEWER} quando não houver.
     */
    public static UserAccount saveAccountWithProfile(
        UserAccountRepository users,
        PasswordEncoder passwordEncoder,
        String username,
        AccessProfile profile,
        Set<String> extraPermissions
    ) {
        UserAccount account = new UserAccount();
        account.setUsername(username);
        account.setFullName(username);
        account.setPasswordHash(PASSWORD_HASHES.computeIfAbsent(passwordEncoder, encoder -> encoder.encode(DEFAULT_PASSWORD)));
        account.setRole(profile.getLegacyCode() == null ? UserRole.VIEWER : UserRole.valueOf(profile.getLegacyCode()));
        account.setProfile(profile);
        account.setExtraPermissions(new HashSet<>(extraPermissions));
        account.setActive(true);
        return users.saveAndFlush(account);
    }

    /** Grava um perfil personalizado com os códigos dados. */
    public static AccessProfile saveProfile(AccessProfileRepository profiles, String name, String... permissions) {
        AccessProfile profile = new AccessProfile();
        profile.setName(name);
        profile.setPermissions(new HashSet<>(Set.of(permissions)));
        return profiles.saveAndFlush(profile);
    }

    public static void deleteProfiles(AccessProfileRepository profiles, String... names) {
        for (String name : names) {
            profiles.findByNameIgnoreCase(name).ifPresent(profiles::delete);
        }
        profiles.flush();
    }

    public static void deleteAccounts(UserAccountRepository users, String... usernames) {
        for (String username : usernames) {
            users.findByUsernameIgnoreCase(username).ifPresent(users::delete);
        }
        users.flush();
    }
}
