package br.com.navitasassist.diagnosis;

import java.time.LocalDate;

import br.com.navitasassist.config.AuditableEntity;
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
import jakarta.persistence.OneToOne;
import jakarta.persistence.Table;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

@Getter
@Setter
@NoArgsConstructor
@Entity
@Table(name = "diagnoses")
public class Diagnosis extends AuditableEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @OneToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "rma_id", nullable = false, unique = true)
    private RmaRecord rma;

    @Column(nullable = false, length = 2000)
    private String foundFailure;

    @Enumerated(EnumType.STRING)
    @Column(length = 30)
    private FailureType failureType;

    @Enumerated(EnumType.STRING)
    @Column(length = 30)
    private FailureCause probableCause;

    @Column(length = 2000)
    private String notes;

    @Column(nullable = false)
    private LocalDate diagnosedAt;

    @Column(nullable = false, length = 120)
    private String technicianName;
}
