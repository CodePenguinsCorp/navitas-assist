package br.com.navitasassist.scan;

import java.time.Instant;

import br.com.navitasassist.rma.RmaRecord;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
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

/**
 * Opaque, random identifier printed on an RMA label. It carries no RMA data and stops resolving once revoked.
 */
@Getter
@Setter
@NoArgsConstructor
@Entity
@Table(name = "rma_scan_codes")
public class RmaScanCode {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "rma_id", nullable = false, updatable = false)
    private RmaRecord rma;

    @Column(nullable = false, unique = true, length = 40, updatable = false)
    private String token;

    @Column(nullable = false)
    private boolean active = true;

    @Column(nullable = false, updatable = false)
    private Instant createdAt;

    @Column(nullable = false, length = 120, updatable = false)
    private String createdBy;

    private Instant revokedAt;

    @Column(length = 120)
    private String revokedBy;
}
