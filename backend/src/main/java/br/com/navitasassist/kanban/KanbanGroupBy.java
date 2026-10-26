package br.com.navitasassist.kanban;

import com.fasterxml.jackson.annotation.JsonCreator;

public enum KanbanGroupBy {
    NONE, ASSIGNEE, PRIORITY, CLIENT, PRODUCT;

    @JsonCreator
    public static KanbanGroupBy from(String value) {
        return valueOf(value);
    }
}
