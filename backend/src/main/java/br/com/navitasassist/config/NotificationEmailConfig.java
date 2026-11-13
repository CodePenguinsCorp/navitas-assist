package br.com.navitasassist.config;

import br.com.navitasassist.notification.email.*;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.time.Clock;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.scheduling.annotation.EnableScheduling;

@Configuration
@EnableScheduling
public class NotificationEmailConfig {
    @Bean public EmailProvider emailProvider(NotificationProperties properties, ObjectMapper mapper) {
        var config = properties.getEmail();
        config.validate();
        return "resend".equals(config.getProvider()) ? new ResendEmailProvider(config.getApiKey(), mapper) : new FakeEmailProvider();
    }
    @Bean public Clock notificationEmailClock() { return Clock.systemUTC(); }
}
