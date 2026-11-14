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
@Table(name = "rma_interventions")
public class RmaIntervention extends AuditableEntity {
    @Id @GeneratedValue(strategy = GenerationType.IDENTITY) private Long id;
    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "rma_id", nullable = false, updatable = false) private RmaRecord rma;
    @org.hibernate.annotations.JdbcTypeCode(org.hibernate.type.SqlTypes.VARCHAR)
    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 30) private InterventionType type;
    @Column(nullable = false, length = 1000) private String description;
    @Column(nullable = false) private java.time.LocalDate performedOn;
    @Column(nullable = false, precision = 9, scale = 3) private java.math.BigDecimal hours;
    @Column(nullable = false, length = 120) private String technicianName;
    @Column(length = 120) private String editedBy;
    private java.time.Instant editedAt;
    @Column(length = 120) private String voidedBy;
    private java.time.Instant voidedAt;
    @Column(length = 1000) private String voidReason;
}
