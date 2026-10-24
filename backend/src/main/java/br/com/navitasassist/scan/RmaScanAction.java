package br.com.navitasassist.scan;

import java.time.Instant;

import br.com.navitasassist.rma.RmaRecord;
import br.com.navitasassist.rma.RmaStatus;
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
 * Audit record of a scan that changed the state of an RMA.
 */
@Getter
@Setter
@NoArgsConstructor
@Entity
@Immutable
@Table(name = "rma_scan_actions")
public class RmaScanAction {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "scan_code_id", nullable = false)
    private RmaScanCode scanCode;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "rma_id", nullable = false)
    private RmaRecord rma;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 30)
    private ScanActionType action;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private ScanSource source;

    @Enumerated(EnumType.STRING)
    @Column(length = 30)
    private RmaStatus fromStatus;

    @Enumerated(EnumType.STRING)
    @Column(length = 30)
    private RmaStatus toStatus;

    @Column(length = 255)
    private String note;

    @Column(nullable = false, length = 120)
    private String performedBy;

    @Column(nullable = false)
    private Instant performedAt;
}
