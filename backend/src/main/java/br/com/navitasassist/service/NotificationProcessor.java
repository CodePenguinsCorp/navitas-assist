package br.com.navitasassist.service;

import java.util.List;

import br.com.navitasassist.notification.RmaNotificationEvent;
import br.com.navitasassist.config.NotificationAsyncConfig;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.core.task.TaskExecutor;
import org.springframework.core.task.TaskRejectedException;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.event.TransactionPhase;
import org.springframework.transaction.event.TransactionalEventListener;

/**
 * Entry point for notification events: claim (idempotency), dispatch, then optional e-mail. Each step has its own
 * transaction and no exception leaves this class. Events published by requests are processed on the dedicated
 * notification executor after the producer commits, so producers never wait for or fail because of notifications.
 */
@Slf4j
@Service
public class NotificationProcessor {

    private final NotificationEventStore eventStore;
    private final NotificationDispatcher dispatcher;
    private final NotificationEmailService emailService;
    private final TaskExecutor notificationExecutor;

    public NotificationProcessor(NotificationEventStore eventStore, NotificationDispatcher dispatcher, NotificationEmailService emailService,
                                 @Qualifier(NotificationAsyncConfig.NOTIFICATION_EXECUTOR) TaskExecutor notificationExecutor) {
        this.eventStore = eventStore;
        this.dispatcher = dispatcher;
        this.emailService = emailService;
        this.notificationExecutor = notificationExecutor;
    }

    /**
     * Runs once the producer's transaction has committed (or immediately when published outside a transaction) and only
     * hands the event to the notification executor.
     */
    @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT, fallbackExecution = true)
    public void onEvent(RmaNotificationEvent event) {
        try {
            notificationExecutor.execute(() -> process(event));
        } catch (TaskRejectedException rejected) {
            log.warn("Notification queue is full; event {} recorded as failed", event.eventKey());
            try {
                eventStore.recordRejected(event, "Notification queue is full.");
            } catch (RuntimeException exception) {
                log.error("Could not record rejected notification event {}", event.eventKey(), exception);
            }
        }
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
