package br.com.navitasassist.notification;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;

public record NotificationSnoozeRequest(
    @NotNull @Min(5) @Max(10080) Integer minutes
) {
}
