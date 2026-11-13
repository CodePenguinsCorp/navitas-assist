package br.com.navitasassist.config;

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
    private final Async async = new Async();

    @Getter
    @Setter
    public static class Email {
        private boolean enabled;
        private String provider = "fake";
        private String apiKey;
        private String from;
        private String appBaseUrl;
        private long pollMs = 5000;
        private int batchSize = 50;

        /** @param fakeAllowed true só nos perfis local e test, onde o provedor falso pode ficar ligado. */
        public void validate(boolean fakeAllowed) {
            if (!java.util.Set.of("fake", "resend").contains(provider)) throw new IllegalStateException("Invalid notifications email provider");
            if (pollMs <= 0 || batchSize < 1 || batchSize > 100) throw new IllegalStateException("Invalid notifications email polling limits");
            if (!enabled) return;
            if ("fake".equals(provider) && !fakeAllowed) {
                throw new IllegalStateException("O provedor de e-mail falso só é permitido nos perfis local e test; ajuste NOTIFICATIONS_EMAIL_PROVIDER.");
            }
            if (!br.com.navitasassist.notification.email.EmailMessage.validAddress(from)) throw new IllegalStateException("MAIL_FROM is required and must be a single email address");
            try {
                java.net.URI uri = java.net.URI.create(appBaseUrl == null ? "" : appBaseUrl);
                boolean secure = "https".equals(uri.getScheme());
                boolean local = "fake".equals(provider) && "http".equals(uri.getScheme()) && java.util.Set.of("localhost", "127.0.0.1", "[::1]").contains(uri.getHost());
                if ((!secure && !local) || uri.getHost() == null || uri.getUserInfo() != null || uri.getQuery() != null || uri.getFragment() != null) throw new IllegalArgumentException();
            } catch (IllegalArgumentException e) { throw new IllegalStateException("Invalid APP_BASE_URL"); }
            if ("resend".equals(provider) && (apiKey == null || apiKey.isBlank() || apiKey.contains("\r") || apiKey.contains("\n"))) throw new IllegalStateException("RESEND_API_KEY is required");
        }
    }

    @Getter
    @Setter
    public static class Async {
        private int corePoolSize = 2;
        private int maxPoolSize = 4;
        private int queueCapacity = 500;
    }
}
