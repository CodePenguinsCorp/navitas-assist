package br.com.navitasassist.service;

import java.time.Instant;

import br.com.navitasassist.notification.NotificationEvent;
import br.com.navitasassist.notification.NotificationEventStatus;
import br.com.navitasassist.notification.RmaNotificationEvent;
import br.com.navitasassist.repository.NotificationEventRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

/**
 * Event log writes, each in its own transaction so a failure while dispatching can still be recorded.
 */
@Service
@RequiredArgsConstructor
public class NotificationEventStore {

    private final NotificationEventRepository notificationEventRepository;

    /**
     * Registers the event key. Returns {@code null} when the key was already processed; a concurrent duplicate fails on the
     * unique key and surfaces as {@link org.springframework.dao.DataIntegrityViolationException}.
     */
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public Long claim(RmaNotificationEvent event) {
        if (notificationEventRepository.existsByEventKey(event.eventKey())) {
            return null;
        }

        NotificationEvent record = new NotificationEvent();
        record.setEventKey(event.eventKey());
        record.setEventType(event.type());
        record.setStatus(NotificationEventStatus.RECEIVED);
        record.setOccurredAt(event.occurredAt() == null ? Instant.now() : event.occurredAt());
        return notificationEventRepository.save(record).getId();
    }

    /**
     * Records an event that could not even be queued, so it shows up in the failure list instead of disappearing.
     */
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void recordRejected(RmaNotificationEvent event, String error) {
        if (notificationEventRepository.existsByEventKey(event.eventKey())) {
            return;
        }

        NotificationEvent record = new NotificationEvent();
        record.setEventKey(event.eventKey());
        record.setEventType(event.type());
        record.setStatus(NotificationEventStatus.FAILED);
        record.setErrorMessage(truncate(error));
        record.setOccurredAt(event.occurredAt() == null ? Instant.now() : event.occurredAt());
        record.setProcessedAt(Instant.now());
        notificationEventRepository.save(record);
    }

    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void markFailed(Long eventId, String error) {
        notificationEventRepository.findById(eventId).ifPresent(record -> {
            record.setStatus(NotificationEventStatus.FAILED);
            record.setErrorMessage(truncate(error));
            record.setProcessedAt(Instant.now());
        });
    }

    static String truncate(String value) {
        if (value == null) {
            return null;
        }
        return value.length() <= 500 ? value : value.substring(0, 500);
    }
}
