package br.com.navitasassist.rma;

import java.time.Instant;
import jakarta.persistence.*;
import lombok.Getter;
import lombok.Setter;
import lombok.NoArgsConstructor;

@Getter
@Setter
@NoArgsConstructor
@Entity
@Table(name = "rma_repair_history")
public class RmaRepairHistory {
    @Id @GeneratedValue(strategy = GenerationType.IDENTITY) private Long id;
    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "rma_id", nullable = false, updatable = false) private RmaRecord rma;
    @Column(nullable = false, length = 30) private String entityType;
    @Column(nullable = false) private Long entityId;
    @Column(nullable = false, length = 20) private String action;
    @Column(nullable = false, length = 120) private String changedBy;
    @Column(nullable = false) private Instant changedAt;
    @Column(nullable = false, length = 1500) private String summary;

    public static void record(RmaRecord rma, String entityType, Long entityId, String action, String summary, String changedBy) {
        RmaRepairHistory event = new RmaRepairHistory();
        event.setRma(rma); event.setEntityType(entityType); event.setEntityId(entityId); event.setAction(action);
        event.setSummary(summary.length() > 1500 ? summary.substring(0, 1500) : summary);
        event.setChangedBy(changedBy); event.setChangedAt(Instant.now());
        rma.getRepairHistory().add(event);
    }
}
