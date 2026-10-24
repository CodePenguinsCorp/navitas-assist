package br.com.navitasassist.notification;

import java.time.Instant;

/**
 * Event published by RMA producers. {@code eventKey} identifies the business occurrence and makes processing idempotent:
 * publishing the same key twice never creates duplicated notifications.
 */
public record RmaNotificationEvent(NotificationEventType type, String eventKey, Long rmaId, Instant occurredAt, String actor) {

    public RmaNotificationEvent(NotificationEventType type, String eventKey, Long rmaId, Instant occurredAt) {
        this(type, eventKey, rmaId, occurredAt, "system");
    }
}
