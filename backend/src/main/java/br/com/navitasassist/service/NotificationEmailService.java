package br.com.navitasassist.service;

import java.util.regex.Pattern;

import br.com.navitasassist.config.NotificationProperties;
import br.com.navitasassist.notification.Notification;
import br.com.navitasassist.notification.NotificationEmailStatus;
import br.com.navitasassist.repository.NotificationRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.mail.SimpleMailMessage;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

/**
 * Optional corporate e-mail channel. Delivery problems are stored on the notification and never propagate.
 */
@Service
@RequiredArgsConstructor
public class NotificationEmailService {

    private static final Pattern LOCAL_PART = Pattern.compile("[A-Za-z0-9._-]+");

    private final ObjectProvider<JavaMailSender> mailSender;
    private final NotificationProperties properties;
    private final NotificationRepository notificationRepository;

    public boolean isAvailable() {
        NotificationProperties.Email email = properties.getEmail();
        return email.isEnabled() && email.getDomain() != null && !email.getDomain().isBlank() && mailSender.getIfAvailable() != null;
    }

    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void send(Long notificationId) {
        Notification notification = notificationRepository.findById(notificationId).orElseThrow();
        String username = notification.getRecipient().getUsername();

        try {
            if (!LOCAL_PART.matcher(username).matches()) {
                throw new IllegalStateException("Username cannot be used as a corporate e-mail address: " + username);
            }

            SimpleMailMessage message = new SimpleMailMessage();
            message.setFrom(properties.getEmail().getFrom());
            message.setTo(username + "@" + properties.getEmail().getDomain().trim());
            message.setSubject("[Navitas Assist] " + notification.getTitle());
            message.setText(notification.getMessage() + "\n\nAbra o Navitas Assist e acesse Notificações para ver o RMA.");
            mailSender.getObject().send(message);
            notification.setEmailStatus(NotificationEmailStatus.SENT);
            notification.setEmailError(null);
        } catch (RuntimeException exception) {
            notification.setEmailStatus(NotificationEmailStatus.FAILED);
            notification.setEmailError(NotificationEventStore.truncate(exception.getClass().getSimpleName() + ": " + exception.getMessage()));
        }
    }
}
