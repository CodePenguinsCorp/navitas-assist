package br.com.navitasassist.notification;

import jakarta.validation.constraints.NotNull;

public record NotificationPreferenceRequest(
    @NotNull Boolean muted
) {
}
