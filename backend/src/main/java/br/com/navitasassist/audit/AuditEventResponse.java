package br.com.navitasassist.audit;

import java.time.Instant;

public record AuditEventResponse(Long id, Instant occurredAt, String actorUsername, String action,
                                 String entityType, Long entityId, String entityLabel, String summary) {
    public static AuditEventResponse from(AuditEvent event) {
        return new AuditEventResponse(event.getId(), event.getOccurredAt(), event.getActorUsername(), event.getAction(),
            event.getEntityType(), event.getEntityId(), event.getEntityLabel(), event.getSummary());
    }
}
