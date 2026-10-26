package br.com.navitasassist.rma;

import java.time.Instant;

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

@Getter
@Setter
@NoArgsConstructor
@Entity
@Table(name = "rma_blocks")
public class RmaBlock {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "rma_id", nullable = false)
    private RmaRecord rma;

    @Column(nullable = false, length = 1000)
    private String reason;

    @Column(length = 80)
    private String category;

    @Column(nullable = false, length = 120)
    private String blockedBy;

    @Column(nullable = false)
    private Instant blockedAt;

    @Column(length = 120)
    private String resolvedBy;

    private Instant resolvedAt;

    @Column(length = 1000)
    private String resolutionNote;
}
