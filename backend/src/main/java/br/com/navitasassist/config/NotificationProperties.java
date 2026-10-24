package br.com.navitasassist.config;

import java.time.Duration;

import lombok.Getter;
import lombok.Setter;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.stereotype.Component;

@Getter
@Setter
@Component
@ConfigurationProperties(prefix = "navitas.notifications")
public class NotificationProperties {

    private final Email email = new Email();
    private final SlaScan slaScan = new SlaScan();
    private final Async async = new Async();

    /**
     * Optional corporate e-mail channel. Disabled by default; addresses are built only as {@code username@domain}, so
     * messages never leave the corporate domain and never reach clients.
     */
    @Getter
    @Setter
    public static class Email {
        private boolean enabled;
        private String domain;
        private String from = "navitas-assist@localhost";
    }

    @Getter
    @Setter
    public static class SlaScan {
        private boolean enabled = true;
        private Duration interval = Duration.ofMinutes(5);
    }

    @Getter
    @Setter
    public static class Async {
        private int corePoolSize = 2;
        private int maxPoolSize = 4;
        private int queueCapacity = 500;
    }
}
