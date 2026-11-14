package br.com.navitasassist.notification;

/**
 * Supported RMA notification events. New producers publish an {@link RmaNotificationEvent}
 * with a unique occurrence key and seed their notification rule through a new migration.
 */
public enum NotificationEventType {
    RMA_CREATED(true),
    RMA_ASSIGNED(true),
    RMA_BLOCKED(true),
    PART_PENDING(true),
    TEST_FAILED(true);

    private final boolean supported;

    NotificationEventType(boolean supported) {
        this.supported = supported;
    }

    public boolean isSupported() {
        return supported;
    }
}
