package br.com.navitasassist.notification;

import java.util.Set;

import br.com.navitasassist.user.UserRole;
import jakarta.validation.constraints.NotNull;

public record NotificationRuleRequest(
    @NotNull Boolean enabled,
    @NotNull NotificationSeverity severity,
    @NotNull Set<@NotNull UserRole> recipientRoles,
    @NotNull Boolean notifyAssignee,
    @NotNull Boolean emailEnabled,
    @NotNull Boolean userMutable
) {
}
