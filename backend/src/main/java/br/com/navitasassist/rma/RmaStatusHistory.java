package br.com.navitasassist.rma;

import java.time.Instant;

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

@Getter
@Setter
@NoArgsConstructor
@Entity
@Table(name = "rma_status_history")
public class RmaStatusHistory {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "rma_id", nullable = false)
    private RmaRecord rma;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 30)
    private RmaStatus status;

    @Column(nullable = false, length = 120)
    private String changedBy;

    @Column(nullable = false)
    private Instant changedAt;

    @Column(length = 255)
    private String note;
}
