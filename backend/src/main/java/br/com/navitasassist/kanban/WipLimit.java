package br.com.navitasassist.kanban;

import br.com.navitasassist.config.AuditableEntity;
import br.com.navitasassist.rma.RmaStatus;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

@Getter
@Setter
@NoArgsConstructor
@Entity
@Table(name = "kanban_wip_limits")
public class WipLimit extends AuditableEntity {
    @Id
    @Enumerated(EnumType.STRING)
    @Column(length = 30)
    private RmaStatus status;
    private Integer maxItems;
    @Column(nullable = false)
    private boolean blocking;
}
