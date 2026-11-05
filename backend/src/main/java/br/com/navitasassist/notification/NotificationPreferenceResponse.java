package br.com.navitasassist.notification;

public record NotificationPreferenceResponse(
    NotificationEventType eventType,
    NotificationSeverity severity,
    boolean enabled,
    boolean userMutable,
    boolean muted
) {
}
