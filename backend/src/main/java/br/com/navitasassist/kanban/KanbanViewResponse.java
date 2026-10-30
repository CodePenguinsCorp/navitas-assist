package br.com.navitasassist.kanban;

import java.time.Instant;

public record KanbanViewResponse(
    Long id,
    String name,
    boolean defaultView,
    KanbanViewFilters filters,
    Instant createdAt,
    Instant updatedAt
) {
    public static KanbanViewResponse from(KanbanView view) {
        return new KanbanViewResponse(
            view.getId(),
            view.getName(),
            view.isDefaultView(),
            KanbanViewFilters.from(view),
            view.getCreatedAt(),
            view.getUpdatedAt()
        );
    }
}
