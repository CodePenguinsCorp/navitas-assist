package br.com.navitasassist.notification;

import java.util.Set;

import jakarta.validation.constraints.NotNull;

public record NotificationRuleRequest(
    @NotNull Boolean enabled,
    @NotNull NotificationSeverity severity,
    @NotNull Set<@NotNull Long> recipientProfileIds,
    @NotNull Boolean notifyAssignee,
    @NotNull Boolean emailEnabled,
    @NotNull Boolean userMutable,
    Boolean appEnabled
) {
    public NotificationRuleRequest(Boolean enabled, NotificationSeverity severity, Set<Long> recipientProfileIds, Boolean notifyAssignee, Boolean emailEnabled, Boolean userMutable) {
        this(enabled, severity, recipientProfileIds, notifyAssignee, emailEnabled, userMutable, null);
    }

}
