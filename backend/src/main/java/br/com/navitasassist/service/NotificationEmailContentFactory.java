package br.com.navitasassist.service;

import br.com.navitasassist.config.NotificationProperties;
import br.com.navitasassist.notification.Notification;
import br.com.navitasassist.notification.email.EmailMessage;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;
import org.springframework.web.util.HtmlUtils;

@Component
@RequiredArgsConstructor
public class NotificationEmailContentFactory {
    private final NotificationProperties properties;

    public EmailMessage build(Notification notification, String recipientEmail) {
        String event = switch (notification.getEventType()) {
            case RMA_CREATED -> "OS criada";
            case RMA_ASSIGNED -> "OS atribuída";
            case RMA_BLOCKED -> "Impedimento aberto";
            case PART_PENDING -> "Peça pendente";
            case TEST_FAILED -> "Teste reprovado";
        };
        String code = notification.getRma().getCode();
        String subject = "[Navitas Assist] " + event + " — " + code;
        // Validate before truncation, so CR/LF cannot be hidden in the discarded suffix.
        if (subject.contains("\r") || subject.contains("\n")) throw new br.com.navitasassist.notification.email.EmailDeliveryException("INVALID_CONTENT", false);
        subject = subject.substring(0, Math.min(160, subject.length()));
        String link = baseUrl() + "/rmas?rma=" + notification.getRma().getId();
        String date = notification.getCreatedAt().toString();
        return new EmailMessage(properties.getEmail().getFrom(), recipientEmail, subject,
            event + " — " + code + "\n" + date + "\nAbrir OS: " + link,
            "<p>" + escape(event) + " — " + escape(code) + "</p><p>" + escape(date) + "</p><p><a href=\"" + escape(link) + "\">Abrir OS</a></p>");
    }

    public EmailMessage test(String recipientEmail) {
        return new EmailMessage(properties.getEmail().getFrom(), recipientEmail, "[Navitas Assist] E-mail de teste",
            "Este é um e-mail de teste do Navitas Assist.\n" + baseUrl(),
            "<p>Este é um e-mail de teste do Navitas Assist.</p><p><a href=\"" + escape(baseUrl()) + "\">Abrir Navitas Assist</a></p>");
    }

    private String baseUrl() { return properties.getEmail().getAppBaseUrl().replaceAll("/+$", ""); }
    private String escape(String value) { return HtmlUtils.htmlEscape(value, "UTF-8"); }
}
