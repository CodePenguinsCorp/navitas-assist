package br.com.navitasassist.service;

import br.com.navitasassist.access.Permission;
import br.com.navitasassist.config.NotificationProperties;
import br.com.navitasassist.controller.*;
import br.com.navitasassist.notification.*;
import br.com.navitasassist.notification.email.*;
import br.com.navitasassist.repository.*;
import br.com.navitasassist.user.UserAccount;
import java.time.*;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
@Slf4j
public class NotificationEmailAdminService {
    private final AuditService audit;
    private final NotificationRepository notifications;
    private final UserAccountRepository users;
    private final NotificationEmailQueue queue;
    private final NotificationProperties properties;
    private final NotificationEmailContentFactory content;
    private final EmailProvider provider;
    private final EffectivePermissionService permissions;
    private final Clock clock;
    private final NotificationEmailQuota quota;
    private final Map<Long, Instant> lastTests = new ConcurrentHashMap<>();

    public NotificationEmailStatusResponse status() {
        NotificationEmailQuota.Usage usage = quota.usage();
        return new NotificationEmailStatusResponse(properties.getEmail().isEnabled(), properties.getEmail().getProvider(),
            usage.sentToday(), usage.dailyLimit(), usage.sentThisMonth(), usage.monthlyLimit(), usage.limitReached());
    }

    @Transactional
    public NotificationEmailActionResponse retry(Long id, String actor) {
        requireActor(actor);
        Notification n = notifications.findById(id).orElseThrow(() -> new ResourceNotFoundException("Notification not found."));
        if (n.getEmailStatus() != NotificationEmailStatus.FAILED) throw new NotificationEmailActionException(HttpStatus.CONFLICT, "Only FAILED emails can be retried.");
        if (!queue.eligible(n)) throw new BusinessException("Email is not eligible for delivery.");
        if (notifications.retryFailedEmail(id, clock.instant()) != 1) throw new NotificationEmailActionException(HttpStatus.CONFLICT, "Email already rescheduled.");
        audit.record("EMAIL_RETRY", "NOTIFICATION", id, "Notificação #" + id, "Reenvio de e-mail solicitado.");
        log.info("action=EMAIL_RETRY notificationId={} actorId={}", id, users.findByUsernameIgnoreCase(actor).orElseThrow().getId());
        return new NotificationEmailActionResponse(id, NotificationEmailStatus.PENDING, properties.getEmail().getProvider());
    }

    /** Records the test request before HTTP; no transaction remains open during provider delivery. */
    public NotificationEmailTestResponse test(String actor) {
        UserAccount user = requireActor(actor);
        if (!properties.getEmail().isEnabled() || !EmailMessage.validAddress(user.getEmail())) throw new BusinessException("Email channel disabled or no email registered.");
        // O teste não é gravado nem contado, mas consome a cota do provedor real: com o teto atingido, não sai.
        if (NotificationEmailQuota.countsTowardQuota(properties.getEmail().getProvider()) && quota.usage().limitReached()) {
            throw new NotificationEmailActionException(HttpStatus.TOO_MANY_REQUESTS, "Email sending limit reached.");
        }
        Instant now = clock.instant();
        lastTests.entrySet().removeIf(entry -> !entry.getValue().plusSeconds(30).isAfter(now));
        if (lastTests.putIfAbsent(user.getId(), now) != null) throw new NotificationEmailActionException(HttpStatus.TOO_MANY_REQUESTS, "Wait 30 seconds before another email test.");
        audit.recordEmailTest(user.getId());
        try {
            provider.send(content.test(user.getEmail()), "test-" + user.getId() + "-" + java.util.UUID.randomUUID());
            log.info("action=EMAIL_TEST actorId={} provider={} result=SENT", user.getId(), properties.getEmail().getProvider());
            return new NotificationEmailTestResponse("fake".equals(properties.getEmail().getProvider()) ? "simulado" : "enviado", properties.getEmail().getProvider());
        } catch (RuntimeException error) {
            log.warn("action=EMAIL_TEST actorId={} result=PROVIDER_ERROR", user.getId());
            throw new NotificationEmailActionException(HttpStatus.BAD_GATEWAY, "Email provider could not accept the test.");
        }
    }

    private UserAccount requireActor(String actor) {
        UserAccount user = users.findByUsernameIgnoreCase(actor).orElseThrow(() -> new ResourceNotFoundException("User not found."));
        if (!user.isActive() || !permissions.has(user, Permission.NOTIFICACOES_REGRAS)) throw new org.springframework.security.access.AccessDeniedException("Access denied");
        return user;
    }
}
