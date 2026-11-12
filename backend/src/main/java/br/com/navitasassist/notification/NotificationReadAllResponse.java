package br.com.navitasassist.notification;

import java.time.Instant;
import java.util.UUID;

public record NotificationReadAllResponse(int markedCount, UUID undoToken, Instant expiresAt) {
}
