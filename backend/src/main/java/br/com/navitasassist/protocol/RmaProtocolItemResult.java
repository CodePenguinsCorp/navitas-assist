package br.com.navitasassist.protocol;

import java.math.BigDecimal;
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
import org.hibernate.annotations.Immutable;

/**
 * One attempt for an item. Repetitions create a new attempt, so previous results stay in the history.
 */
@Getter
@Setter
@NoArgsConstructor
@Entity
@Immutable
@Table(name = "rma_protocol_item_results")
public class RmaProtocolItemResult {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "execution_id", nullable = false)
    private RmaProtocolExecution execution;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "template_item_id", nullable = false)
    private ProtocolTemplateItem item;

    @Column(nullable = false)
    private int attempt;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private ProtocolItemOutcome outcome;

    @Column(precision = 19, scale = 6)
    private BigDecimal measuredValue;

    @Column(length = 20)
    private String unit;

    @Column(length = 1000)
    private String textValue;

    @Column(length = 500)
    private String evidence;

    @Column(length = 500)
    private String justification;

    @Column(nullable = false, length = 120)
    private String executedBy;

    @Column(nullable = false)
    private Instant startedAt;

    @Column(nullable = false)
    private Instant completedAt;
}
