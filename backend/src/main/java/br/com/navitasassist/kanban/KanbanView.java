package br.com.navitasassist.kanban;

import java.time.LocalDate;

import br.com.navitasassist.config.AuditableEntity;
import br.com.navitasassist.rma.RmaPriority;
import br.com.navitasassist.rma.RmaStatus;
import br.com.navitasassist.rma.WarrantyStatus;
import br.com.navitasassist.user.UserAccount;
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
@Table(name = "kanban_views")
public class KanbanView extends AuditableEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "owner_id", nullable = false)
    private UserAccount owner;

    @Column(nullable = false, length = 80)
    private String name;

    @Column(name = "is_default", nullable = false)
    private boolean defaultView;

    @Column(name = "search_query", length = 200)
    private String query;

    @Enumerated(EnumType.STRING)
    @Column(length = 20)
    private RmaPriority priority;

    @Enumerated(EnumType.STRING)
    @Column(length = 30)
    private RmaStatus status;

    @Enumerated(EnumType.STRING)
    @Column(name = "warranty_status", length = 30)
    private WarrantyStatus warranty;

    private Long assigneeId;

    @Column(nullable = false)
    private boolean unassignedOnly;

    private LocalDate entryFrom;

    private LocalDate entryTo;

    private LocalDate updatedFrom;

    private LocalDate updatedTo;

    private Boolean blocked;
}
