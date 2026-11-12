package br.com.navitasassist.notification;

import java.util.UUID;

import jakarta.validation.constraints.NotNull;

public record NotificationReadBatchRequest(@NotNull UUID token) {
}
