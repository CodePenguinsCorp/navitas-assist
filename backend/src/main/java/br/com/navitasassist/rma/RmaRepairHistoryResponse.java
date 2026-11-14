package br.com.navitasassist.rma;

import java.time.Instant;

public record RmaRepairHistoryResponse(Long id, String entityType, Long entityId, String action, String changedBy, Instant changedAt, String summary) {
    public static RmaRepairHistoryResponse from(RmaRepairHistory event) {
        return new RmaRepairHistoryResponse(event.getId(), event.getEntityType(), event.getEntityId(), event.getAction(), event.getChangedBy(), event.getChangedAt(), event.getSummary());
    }
}
