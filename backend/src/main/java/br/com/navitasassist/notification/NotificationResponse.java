package br.com.navitasassist.notification;

import java.time.Instant;

public record NotificationResponse(
    Long id,
    NotificationEventType eventType,
    NotificationSeverity severity,
    String title,
    String message,
    Long rmaId,
    String rmaCode,
    String actionPath,
    Instant createdAt,
    Instant readAt,
    Instant snoozedUntil,
    boolean read
) {
    public static NotificationResponse from(Notification notification) {
        return new NotificationResponse(
            notification.getId(),
            notification.getEventType(),
            notification.getSeverity(),
            notification.getTitle(),
            notification.getMessage(),
            notification.getRma() == null ? null : notification.getRma().getId(),
            notification.getRma() == null ? null : notification.getRma().getCode(),
            notification.getActionPath(),
            notification.getCreatedAt(),
            notification.getReadAt(),
            notification.getSnoozedUntil(),
            notification.getReadAt() != null
        );
    }
}
