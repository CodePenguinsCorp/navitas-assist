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
    public record Delivery(Long id, int attempt, String provider, EmailMessage message, String idempotencyKey) {}
    /** Prazo da reserva: cobre o envio (timeout do provedor) e devolve a linha à fila se a instância cair no meio. */
    static final Duration CLAIM_LEASE = Duration.ofMinutes(5);
    static final int MAX_ATTEMPTS = 5;
    /** Recuo após a tentativa 1, 2, 3 e 4: 1 min, 5 min, 30 min e 2 h. */
    private static final long[] RETRY_DELAYS_SECONDS = {60, 300, 1800, 7200};
    static final String PROCESSING_ERROR = "PROCESSING_ERROR";
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
        if (n.getEmailAttempts() >= MAX_ATTEMPTS) {
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
        int generation = n.getEmailGeneration();
        if (notifications.claimEmail(id, attempts, generation, now, now.plus(CLAIM_LEASE), provider) != 1) return null;
        return new Delivery(id, attempts + 1, provider, message, idempotencyKey(id, generation));
    }

    /** Mesma chave entre as tentativas automáticas de uma geração; cada reenvio manual muda a geração e a chave. */
    static String idempotencyKey(Long id, int generation) {
        return generation == 0 ? id.toString() : id + "-" + generation;
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
            if (!error.retryable() || n.getEmailAttempts() >= MAX_ATTEMPTS) {
                n.setEmailStatus(NotificationEmailStatus.FAILED);
                n.setEmailNextAttemptAt(null);
            } else {
                n.setEmailNextAttemptAt(clock.instant().plusSeconds(RETRY_DELAYS_SECONDS[n.getEmailAttempts() - 1]));
            }
        }
    }

    /**
     * Erro fora do envio (leitura, elegibilidade ou conclusão), em transação própria: conta a tentativa, se ainda não
     * contada pela reserva, e recua como uma falha transitória; ao esgotar as tentativas, vira FAILED. Sem isso a linha
     * continuaria devida e seria reprocessada a cada varredura, à frente das demais.
     *
     * @param claimedAttempt tentativa já reservada por {@link #prepare}, ou null se o erro ocorreu antes da reserva
     */
    @Transactional
    public void recordProcessingError(Long id, Integer claimedAttempt) {
        Notification n = notifications.findById(id).orElse(null);
        if (n == null || n.getEmailStatus() != NotificationEmailStatus.PENDING) return;
        Instant now = clock.instant();
        int attempts = n.getEmailAttempts();
        int counted;
        if (claimedAttempt != null) {
            if (attempts != claimedAttempt) return;
            counted = attempts;
        } else {
            // Antes da reserva: só mexe na linha ainda devida (outra instância pode tê-la reservado).
            if (n.getEmailNextAttemptAt() == null || n.getEmailNextAttemptAt().isAfter(now)) return;
            counted = attempts + 1;
        }
        boolean exhausted = counted >= MAX_ATTEMPTS;
        notifications.deferEmail(id, attempts, counted, exhausted ? NotificationEmailStatus.FAILED : NotificationEmailStatus.PENDING,
            exhausted ? null : now.plusSeconds(RETRY_DELAYS_SECONDS[counted - 1]), PROCESSING_ERROR);
    }
}
