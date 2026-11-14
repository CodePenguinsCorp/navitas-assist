package br.com.navitasassist.notification;

import java.util.Arrays;
import java.util.List;

/**
 * Supported RMA notification events. New producers publish an {@link RmaNotificationEvent}
 * with a unique occurrence key and seed their notification rule through a new migration.
 *
 * <p>{@code snoozable} marks the events that ask the recipient to act (impedimento, peça pendente,
 * teste reprovado): only those can be adiadas. The others are informative; a snooze stored on them
 * is ignored. The criterion is the event type, not the severity, because the severity is editable
 * per rule.</p>
 */
public enum NotificationEventType {
    RMA_CREATED(true, false),
    RMA_ASSIGNED(true, false),
    RMA_BLOCKED(true, true),
    PART_PENDING(true, true),
    TEST_FAILED(true, true);

    private static final List<NotificationEventType> SNOOZABLE = Arrays.stream(values()).filter(NotificationEventType::isSnoozable).toList();

    private final boolean supported;
    private final boolean snoozable;

    NotificationEventType(boolean supported, boolean snoozable) {
        this.supported = supported;
        this.snoozable = snoozable;
    }

    public boolean isSupported() {
        return supported;
    }

    public boolean isSnoozable() {
        return snoozable;
    }

    public static List<NotificationEventType> snoozableTypes() {
        return SNOOZABLE;
    }
}
