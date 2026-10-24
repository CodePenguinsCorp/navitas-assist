package br.com.navitasassist.service;

import java.util.List;

import br.com.navitasassist.notification.RmaNotificationEvent;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.event.TransactionalEventListener;

/**
 * Entry point for notification events: claim (idempotency), dispatch, then optional e-mail. Each step has its own
 * transaction and no exception leaves this class, so producers are never affected by notification problems.
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class NotificationProcessor {

    private final NotificationEventStore eventStore;
    private final NotificationDispatcher dispatcher;
    private final NotificationEmailService emailService;

    /**
     * Runs once the producer's transaction has committed (or immediately when published outside a transaction).
     */
    @TransactionalEventListener(fallbackExecution = true)
    public void onEvent(RmaNotificationEvent event) {
        process(event);
    }

    public void process(RmaNotificationEvent event) {
        try {
            Long eventId;
            try {
                eventId = eventStore.claim(event);
            } catch (DataIntegrityViolationException duplicate) {
                return;
            }
            if (eventId == null) {
                return;
            }

            List<Long> emailNotificationIds;
            try {
                emailNotificationIds = dispatcher.dispatch(eventId, event);
            } catch (RuntimeException exception) {
                log.warn("Notification event {} failed: {}", event.eventKey(), exception.getMessage());
                eventStore.markFailed(eventId, exception.getClass().getSimpleName() + ": " + exception.getMessage());
                return;
            }

            for (Long notificationId : emailNotificationIds) {
                try {
                    emailService.send(notificationId);
                } catch (RuntimeException exception) {
                    log.warn("Notification e-mail {} could not be recorded: {}", notificationId, exception.getMessage());
                }
            }
        } catch (RuntimeException exception) {
            log.error("Unexpected error while processing notification event {}", event.eventKey(), exception);
        }
    }
}
