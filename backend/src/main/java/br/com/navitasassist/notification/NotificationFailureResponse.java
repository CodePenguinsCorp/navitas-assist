package br.com.navitasassist.notification;

import java.time.Instant;

/**
 * Processing failure visible to administrators: {@code EVENT} for an event that could not be processed, {@code EMAIL} for a
 * notification whose optional e-mail delivery failed (the in-app notification still exists).
 */
public record NotificationFailureResponse(
    String source,
    String eventKey,
    NotificationEventType eventType,
    String rmaCode,
    String recipient,
    String error,
    Instant occurredAt,
    Long notificationId,
    int attempts,
    String provider,
    NotificationEmailStatus status,
    Instant nextAttemptAt,
    boolean retryAllowed
) {
    public NotificationFailureResponse(String source, String eventKey, NotificationEventType eventType, String rmaCode, String recipient, String error, Instant occurredAt) {
        this(source, eventKey, eventType, rmaCode, recipient, error, occurredAt, null, 0, null, null, null, false);
    }

}
