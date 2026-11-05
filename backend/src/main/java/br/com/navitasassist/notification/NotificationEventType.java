package br.com.navitasassist.notification;

/**
 * Internal RMA events that may raise notifications. Types with {@code supported = false} are extension points for modules
 * that are not in the codebase yet (blocking, WIP limits, parts, internal approval, tests, recurrence): their producers must
 * publish an {@link RmaNotificationEvent} and add a {@code notification_rules} row through a migration.
 */
public enum NotificationEventType {
    RMA_CREATED(true),
    RMA_ASSIGNED(true),
    SLA_WARNING(true),
    SLA_OVERDUE(true),
    RMA_BLOCKED(false),
    WIP_LIMIT_EXCEEDED(false),
    PART_PENDING(false),
    INTERNAL_APPROVAL_REQUIRED(false),
    TEST_FAILED(false),
    RECURRENCE_DETECTED(false);

    private final boolean supported;

    NotificationEventType(boolean supported) {
        this.supported = supported;
    }

    public boolean isSupported() {
        return supported;
    }
}
