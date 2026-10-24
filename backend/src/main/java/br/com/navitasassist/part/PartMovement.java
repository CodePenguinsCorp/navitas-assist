package br.com.navitasassist.part;

import java.math.BigDecimal;
import java.time.Instant;

import br.com.navitasassist.rma.RmaRecord;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;
import org.hibernate.annotations.Immutable;

/**
 * Immutable stock ledger entry. Corrections are recorded as a new {@link PartMovementType#REVERSAL} movement.
 */
@Getter
@Setter
@NoArgsConstructor
@Entity
@Immutable
@Table(name = "part_movements")
public class PartMovement {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "part_id", nullable = false)
    private Part part;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 30)
    private PartMovementType type;

    @Column(nullable = false, precision = 12, scale = 3)
    private BigDecimal quantity;

    @Column(nullable = false, precision = 12, scale = 3)
    private BigDecimal onHandChange;

    @Column(nullable = false, precision = 12, scale = 3)
    private BigDecimal reservedChange;

    @Column(nullable = false, precision = 12, scale = 3)
    private BigDecimal onHandAfter;

    @Column(nullable = false, precision = 12, scale = 3)
    private BigDecimal reservedAfter;

    @Column(nullable = false, precision = 12, scale = 2)
    private BigDecimal unitCost;

    @Column(nullable = false, precision = 14, scale = 2)
    private BigDecimal totalCost;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "rma_id")
    private RmaRecord rma;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "reservation_id")
    private PartReservation reservation;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "reversed_movement_id", unique = true)
    private PartMovement reversedMovement;

    @Column(length = 255)
    private String reason;

    @Column(nullable = false, length = 120)
    private String createdBy;

    @Column(nullable = false)
    private Instant createdAt;
}
