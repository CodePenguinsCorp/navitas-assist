package br.com.navitasassist.service;

import br.com.navitasassist.config.NotificationProperties;
import br.com.navitasassist.notification.*;
import br.com.navitasassist.notification.email.*;
import br.com.navitasassist.repository.*;
import br.com.navitasassist.user.UserAccount;
import java.time.*;
import java.util.List;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
public class NotificationEmailQueue {
    public record Delivery(Long id, int attempt, String provider, EmailMessage message) {}
    /** Prazo da reserva: cobre o envio (timeout do provedor) e devolve a linha à fila se a instância cair no meio. */
    static final Duration CLAIM_LEASE = Duration.ofMinutes(5);
    private final NotificationRepository notifications;
    private final NotificationRuleRepository rules;
    private final NotificationMuteRepository mutes;
    private final NotificationVisibilityPolicy visibility;
    private final NotificationProperties properties;
    private final NotificationEmailContentFactory content;
    private final Clock clock;

    @Transactional(readOnly = true)
    public List<Long> due() {
        return notifications.findDueEmailIds(clock.instant(), PageRequest.of(0, properties.getEmail().getBatchSize()));
    }

    @Transactional(readOnly = true)
    public boolean eligible(Notification n) {
        UserAccount user = n.getRecipient();
        var rule = rules.findByEventType(n.getEventType());
        if (n.getRma() == null || !properties.getEmail().isEnabled() || !EmailMessage.validAddress(user.getEmail()) || !visibility.canReceive(user, n.getEventType()) || rule.isEmpty()) return false;
        NotificationRule r = rule.get();
        boolean recipient = r.getRecipientProfiles().stream().anyMatch(p -> p.getId().equals(user.getProfile().getId()))
            || (r.isNotifyAssignee() && n.getRma() != null && n.getRma().getAssignee() != null && n.getRma().getAssignee().getId().equals(user.getId()));
        return n.getEventType().isSupported() && r.isEnabled() && r.isEmailEnabled() && recipient
            && (!r.isUserMutable() || mutes.findByUser_IdAndEventType(user.getId(), n.getEventType()).isEmpty());
    }

    @Transactional
    public Delivery prepare(Long id) {
        if (!properties.getEmail().isEnabled()) return null;
        Notification n = notifications.findById(id).orElse(null);
        if (n == null || n.getEmailStatus() != NotificationEmailStatus.PENDING || n.getEmailNextAttemptAt() == null || n.getEmailNextAttemptAt().isAfter(clock.instant())) return null;
        if (!eligible(n)) {
            n.setEmailStatus(NotificationEmailStatus.NOT_REQUESTED);
            n.setEmailNextAttemptAt(null);
            n.setEmailError(null);
            return null;
        }
        if (n.getEmailAttempts() >= 5) {
            n.setEmailStatus(NotificationEmailStatus.FAILED);
            n.setEmailError("ATTEMPTS_EXHAUSTED");
            n.setEmailNextAttemptAt(null);
            return null;
        }
        int attempts = n.getEmailAttempts();
        EmailMessage message;
        try {
            message = content.build(n, n.getRecipient().getEmail());
        } catch (RuntimeException error) {
            n.setEmailStatus(NotificationEmailStatus.FAILED);
            n.setEmailNextAttemptAt(null);
            n.setEmailError(error instanceof EmailDeliveryException e ? e.code() : "CONTENT_ERROR");
            return null;
        }
        // Reserva atômica: com mais de uma instância, só quem afetar a linha envia esta tentativa.
        String provider = properties.getEmail().getProvider();
        Instant now = clock.instant();
        if (notifications.claimEmail(id, attempts, now, now.plus(CLAIM_LEASE), provider) != 1) return null;
        return new Delivery(id, attempts + 1, provider, message);
    }

    @Transactional
    public void complete(Delivery delivery, EmailDeliveryException error) {
        Notification n = notifications.findById(delivery.id()).orElse(null);
        if (n == null || n.getEmailStatus() != NotificationEmailStatus.PENDING || n.getEmailAttempts() != delivery.attempt()) return;
        if (error == null) {
            n.setEmailStatus(NotificationEmailStatus.SENT);
            n.setEmailSentAt(clock.instant());
            n.setEmailError(null);
            n.setEmailNextAttemptAt(null);
        } else {
            n.setEmailError(error.code());
            if (!error.retryable() || n.getEmailAttempts() >= 5) {
                n.setEmailStatus(NotificationEmailStatus.FAILED);
                n.setEmailNextAttemptAt(null);
            } else {
                long[] delays = {60, 300, 1800, 7200};
                n.setEmailNextAttemptAt(clock.instant().plusSeconds(delays[n.getEmailAttempts() - 1]));
            }
        }
    }
}
