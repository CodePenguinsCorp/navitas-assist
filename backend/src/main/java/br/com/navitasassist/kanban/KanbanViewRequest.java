package br.com.navitasassist.kanban;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

public record KanbanViewRequest(
    @NotBlank @Size(max = 80) String name,
    boolean defaultView,
    @Valid @NotNull KanbanViewFilters filters
) {
}
