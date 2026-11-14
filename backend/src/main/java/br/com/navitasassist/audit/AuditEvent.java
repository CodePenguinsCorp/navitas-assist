package br.com.navitasassist.audit;

import jakarta.persistence.*;
import java.time.Instant;
import lombok.Getter;

@Entity
@Table(name = "audit_events")
@Getter
public class AuditEvent {
    @Id @GeneratedValue(strategy = GenerationType.IDENTITY) private Long id;
    @Column(nullable = false, updatable = false) private Instant occurredAt;
    @Column(updatable = false) private Long actorId;
    @Column(nullable = false, length = 60, updatable = false) private String actorUsername;
    @Column(nullable = false, length = 60, updatable = false) private String action;
    @Column(nullable = false, length = 40, updatable = false) private String entityType;
    @Column(updatable = false) private Long entityId;
    @Column(length = 120, updatable = false) private String entityLabel;
    @Column(nullable = false, length = 500, updatable = false) private String summary;
    @Column(length = 45, updatable = false) private String ip;
    protected AuditEvent() {}
    public AuditEvent(Instant occurredAt, Long actorId, String actorUsername, String action, String entityType,
                      Long entityId, String entityLabel, String summary, String ip) {
        this.occurredAt = occurredAt; this.actorId = actorId; this.actorUsername = actorUsername;
        this.action = action; this.entityType = entityType; this.entityId = entityId;
        this.entityLabel = entityLabel; this.summary = summary; this.ip = ip;
    }
}
