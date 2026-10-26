package br.com.navitasassist.notification;

import java.time.Instant;
import java.util.Set;

import br.com.navitasassist.user.UserRole;

public record NotificationRuleResponse(
    NotificationEventType eventType,
    boolean enabled,
    NotificationSeverity severity,
    Set<UserRole> recipientRoles,
    boolean notifyAssignee,
    boolean emailEnabled,
    boolean userMutable,
    Instant updatedAt,
    String updatedBy
) {
    public static NotificationRuleResponse from(NotificationRule rule) {
        return new NotificationRuleResponse(
            rule.getEventType(),
            rule.isEnabled(),
            rule.getSeverity(),
            rule.getRecipientRoles(),
            rule.isNotifyAssignee(),
            rule.isEmailEnabled(),
            rule.isUserMutable(),
            rule.getUpdatedAt(),
            rule.getUpdatedBy()
        );
    }
}
