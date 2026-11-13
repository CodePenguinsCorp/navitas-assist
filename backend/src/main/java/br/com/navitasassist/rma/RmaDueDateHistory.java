package br.com.navitasassist.rma;

import java.time.Instant;
import java.time.LocalDate;

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

/** One change of the RMA due date: set (previous null), changed, or removed (new null). */
@Getter
@Setter
@NoArgsConstructor
@Entity
@Table(name = "rma_due_date_history")
public class RmaDueDateHistory {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "rma_id", nullable = false)
    private RmaRecord rma;

    @Column(name = "previous_due_date")
    private LocalDate previousDueDate;

    @Column(name = "new_due_date")
    private LocalDate newDueDate;

    @Column(nullable = false, length = 120)
    private String changedBy;

    @Column(nullable = false)
    private Instant changedAt;
}
