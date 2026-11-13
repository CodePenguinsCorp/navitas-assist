package br.com.navitasassist.config;

import br.com.navitasassist.notification.email.*;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.time.Clock;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.env.Environment;
import org.springframework.core.env.Profiles;
import org.springframework.scheduling.annotation.EnableScheduling;

@Configuration
@EnableScheduling
public class NotificationEmailConfig {
    /** Mesmos perfis que aceitam padrões locais em {@link RequiredSecretsEnvironmentPostProcessor}. */
    private static final Profiles FAKE_EMAIL_PROFILES = Profiles.of("local", "test");

    @Bean public EmailProvider emailProvider(NotificationProperties properties, ObjectMapper mapper, Environment environment) {
        var config = properties.getEmail();
        config.validate(environment.acceptsProfiles(FAKE_EMAIL_PROFILES));
        return "resend".equals(config.getProvider()) ? new ResendEmailProvider(config.getApiKey(), mapper) : new FakeEmailProvider();
    }
    @Bean public Clock notificationEmailClock() { return Clock.systemUTC(); }
}
