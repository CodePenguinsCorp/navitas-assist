package br.com.navitasassist.kanban;

public record KanbanViewResponse(
    Long id,
    String name,
    boolean defaultView,
    KanbanViewFilters filters
) {
    public static KanbanViewResponse from(KanbanView view) {
        return new KanbanViewResponse(
            view.getId(),
            view.getName(),
            view.isDefaultView(),
            KanbanViewFilters.from(view)
        );
    }
}
