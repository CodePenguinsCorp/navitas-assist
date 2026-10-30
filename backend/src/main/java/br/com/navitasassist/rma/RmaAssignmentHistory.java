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
@Table(name = "rma_assignment_history")
public class RmaAssignmentHistory {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "rma_id", nullable = false)
    private RmaRecord rma;

    @Column
    private Long previousAssigneeId;

    @Column(length = 120)
    private String previousAssigneeName;

    @Column
    private Long newAssigneeId;

    @Column(length = 120)
    private String newAssigneeName;

    @Column(nullable = false, length = 120)
    private String changedBy;

    @Column(nullable = false)
    private Instant changedAt;
}
