package br.com.navitasassist.notification;

import java.time.Instant;
import java.util.Comparator;
import java.util.List;

import br.com.navitasassist.access.ProfileSummary;

public record NotificationRuleResponse(
    NotificationEventType eventType,
    boolean enabled,
    NotificationSeverity severity,
    List<ProfileSummary> recipientProfiles,
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
            rule.getRecipientProfiles().stream()
                .map(ProfileSummary::from)
                .sorted(Comparator.comparing(ProfileSummary::name, String.CASE_INSENSITIVE_ORDER).thenComparing(ProfileSummary::id))
                .toList(),
            rule.isNotifyAssignee(),
            rule.isEmailEnabled(),
            rule.isUserMutable(),
            rule.getUpdatedAt(),
            rule.getUpdatedBy()
        );
    }
}
