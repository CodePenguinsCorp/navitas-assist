package br.com.navitasassist.access;

import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user;

import java.util.HashSet;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;

import br.com.navitasassist.repository.AccessProfileRepository;
import br.com.navitasassist.repository.UserAccountRepository;
import br.com.navitasassist.user.UserAccount;
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

    /** Principal de teste (sem consulta ao banco) com as permissões do perfil de teste {@code profileCode} ({@link TestProfiles}). */
    public static RequestPostProcessor asProfile(String username, String profileCode) {
        return user(username).authorities(AuthorityUtils.createAuthorityList(TestProfiles.authorities(profileCode)));
    }

    /** Grava um usuário ativo com senha {@value #DEFAULT_PASSWORD} e o perfil de teste {@code profileCode}. */
    public static UserAccount saveAccount(
        UserAccountRepository users,
        AccessProfileRepository profiles,
        PasswordEncoder passwordEncoder,
        String username,
        String profileCode
    ) {
        UserAccount account = new UserAccount();
        account.setUsername(username);
        account.setFullName(username);
        account.setPasswordHash(PASSWORD_HASHES.computeIfAbsent(passwordEncoder, encoder -> encoder.encode(DEFAULT_PASSWORD)));
        assignProfile(profiles, account, profileCode);
        account.setActive(true);
        return users.saveAndFlush(account);
    }

    /** Atribui um perfil de teste por nome; não salva a conta. */
    public static UserAccount assignProfile(AccessProfileRepository profiles, UserAccount account, String profileCode) {
        account.setProfile(profile(profiles, profileCode));
        return account;
    }

    public static AccessProfile profile(AccessProfileRepository profiles, String code) {
        String name = switch (code) {
            case "ADMIN" -> "Administrador";
            case "SERVICE_DESK" -> "Atendimento";
            case "TECHNICIAN" -> "Técnico";
            case "VIEWER" -> "Consulta";
            default -> throw new IllegalArgumentException("Perfil de teste desconhecido: " + code);
        };
        return profiles.findByNameIgnoreCase(name).orElseGet(() ->
            saveProfile(profiles, name, TestProfiles.authorities(code)));
    }

    /** Grava um usuário ativo com um perfil qualquer (inclusive personalizado) e extras. */
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
