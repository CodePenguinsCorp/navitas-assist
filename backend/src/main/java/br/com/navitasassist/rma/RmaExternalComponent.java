package br.com.navitasassist.rma;

import br.com.navitasassist.config.AuditableEntity;
import jakarta.persistence.*;
import lombok.Getter;
import lombok.Setter;
import lombok.NoArgsConstructor;

@Getter
@Setter
@NoArgsConstructor
@Entity
@Table(name = "rma_external_components")
public class RmaExternalComponent extends AuditableEntity {
    @Id @GeneratedValue(strategy = GenerationType.IDENTITY) private Long id;
    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "rma_id", nullable = false, updatable = false) private RmaRecord rma;
    @Column(length = 60) private String code;
    @Column(nullable = false, length = 120) private String description;
    @Column(nullable = false, precision = 12, scale = 3) private java.math.BigDecimal quantity;
    @Column(nullable = false, length = 20) private String unit;
    @Column(length = 120) private String componentBatch;
    @Column(nullable = false, length = 1000) private String replacementReason;
    @Column(nullable = false) private java.time.Instant appliedAt;
    @Column(nullable = false, length = 120) private String appliedBy;
    @Column(length = 120) private String editedBy;
    private java.time.Instant editedAt;
    @Column(length = 120) private String voidedBy;
    private java.time.Instant voidedAt;
    @Column(length = 1000) private String voidReason;
}
