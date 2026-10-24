package br.com.navitasassist.protocol;

import java.time.Instant;
import java.util.ArrayList;
import java.util.List;

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
import jakarta.persistence.OneToMany;
import jakarta.persistence.Table;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

@Getter
@Setter
@NoArgsConstructor
@Entity
@Table(name = "rma_protocol_executions")
public class RmaProtocolExecution {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "rma_id", nullable = false)
    private RmaRecord rma;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "template_version_id", nullable = false)
    private ProtocolTemplateVersion templateVersion;

    @Column(nullable = false, length = 120)
    private String templateName;

    @Column(nullable = false)
    private int versionNumber;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private ProtocolExecutionStatus status = ProtocolExecutionStatus.IN_PROGRESS;

    @Column(nullable = false, length = 120)
    private String startedBy;

    @Column(nullable = false)
    private Instant startedAt;

    @Column(length = 120)
    private String completedBy;

    @Column
    private Instant completedAt;

    @OneToMany(mappedBy = "execution")
    private List<RmaProtocolItemResult> results = new ArrayList<>();
}
