package br.com.navitasassist.user;

import br.com.navitasassist.repository.UserAccountRepository;
import org.springframework.security.crypto.password.PasswordEncoder;

public final class UserAccountTestSupport {

    private UserAccountTestSupport() {
    }

    public static UserAccount ensureAdmin(UserAccountRepository users, PasswordEncoder passwordEncoder) {
        return users.findByUsernameIgnoreCase("admin").orElseGet(() -> {
            UserAccount admin = new UserAccount();
            admin.setUsername("admin");
            admin.setFullName("Test administrator");
            admin.setPasswordHash(passwordEncoder.encode("password123"));
            admin.setRole(UserRole.ADMIN);
            admin.setActive(true);
            return users.saveAndFlush(admin);
        });
    }
}
