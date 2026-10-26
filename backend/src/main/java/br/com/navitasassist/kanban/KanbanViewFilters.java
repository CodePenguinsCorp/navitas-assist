package br.com.navitasassist.kanban;

import java.time.LocalDate;

import br.com.navitasassist.rma.RmaPriority;
import br.com.navitasassist.rma.RmaStatus;
import br.com.navitasassist.rma.WarrantyStatus;
import jakarta.validation.constraints.Positive;
import jakarta.validation.constraints.Size;

public record KanbanViewFilters(
    @Size(max = 200) String query,
    RmaPriority priority,
    String status,
    WarrantyStatus warranty,
    @Positive Long assigneeId,
    boolean unassignedOnly,
    LocalDate entryFrom,
    LocalDate entryTo,
    LocalDate updatedFrom,
    LocalDate updatedTo
) {
    public static KanbanViewFilters from(KanbanView view) {
        return new KanbanViewFilters(
            view.getQuery(),
            view.getPriority(),
            view.getStatus(),
            view.getWarranty(),
            view.getAssigneeId(),
            view.isUnassignedOnly(),
            view.getEntryFrom(),
            view.getEntryTo(),
            view.getUpdatedFrom(),
            view.getUpdatedTo()
        );
    }
}
