package br.com.navitasassist.user;

import br.com.navitasassist.access.AccessTestSupport;
import br.com.navitasassist.repository.AccessProfileRepository;
import br.com.navitasassist.repository.UserAccountRepository;
import org.springframework.security.crypto.password.PasswordEncoder;

public final class UserAccountTestSupport {

    private UserAccountTestSupport() {
    }

    public static UserAccount ensureAdmin(
        UserAccountRepository users,
        AccessProfileRepository accessProfiles,
        PasswordEncoder passwordEncoder
    ) {
        return users.findByUsernameIgnoreCase("admin").orElseGet(() -> {
            UserAccount admin = new UserAccount();
            admin.setUsername("admin");
            admin.setFullName("Test administrator");
            admin.setPasswordHash(passwordEncoder.encode("password123"));
            AccessTestSupport.assignProfile(accessProfiles, admin, "ADMIN");
            admin.setActive(true);
            return users.saveAndFlush(admin);
        });
    }
}
