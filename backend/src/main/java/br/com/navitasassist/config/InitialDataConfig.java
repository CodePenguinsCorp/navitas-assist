package br.com.navitasassist.config;

import br.com.navitasassist.repository.UserAccountRepository;
import br.com.navitasassist.user.UserAccount;
import br.com.navitasassist.user.UserRole;
import lombok.RequiredArgsConstructor;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.CommandLineRunner;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.security.crypto.password.PasswordEncoder;

@Configuration
@RequiredArgsConstructor
public class InitialDataConfig {

    @Value("${navitas.security.seed-admin.username:admin}")
    private String seedUsername;

    @Value("${navitas.security.seed-admin.password:admin123}")
    private String seedPassword;

    @Value("${navitas.security.seed-admin.full-name:Administrador}")
    private String seedFullName;

    private final PasswordEncoder passwordEncoder;

    @Bean
    public CommandLineRunner seedAdminUser(UserAccountRepository userAccountRepository) {
        return args -> {
            if (userAccountRepository.count() > 0) {
                return;
            }

            UserAccount admin = new UserAccount();
            admin.setUsername(seedUsername);
            admin.setFullName(seedFullName);
            admin.setPasswordHash(passwordEncoder.encode(seedPassword));
            admin.setRole(UserRole.ADMIN);
            admin.setActive(true);

            userAccountRepository.save(admin);
        };
    }
}
