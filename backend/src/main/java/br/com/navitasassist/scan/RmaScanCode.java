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
 * Opaque, random identifiers printed on an RMA label (QR and barcode). They carry no RMA data and stop resolving once revoked.
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

    /**
     * Shorter numeric identifier (24 random digits, about 80 bits) printed only as Code 128, so the barcode modules stay
     * wide enough for 203 dpi printers. Revoked together with {@link #token}.
     */
    @Column(nullable = false, unique = true, length = 24, updatable = false)
    private String barcodeToken;

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
