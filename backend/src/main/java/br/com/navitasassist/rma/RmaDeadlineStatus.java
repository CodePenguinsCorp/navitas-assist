package br.com.navitasassist.rma;

/** Situation of the RMA due date. {@code CLOSED} is never stored as a saved Kanban filter. */
public enum RmaDeadlineStatus {
    OVERDUE, DUE_SOON, ON_TRACK, NO_DUE_DATE, CLOSED
}
