package br.com.navitasassist.rma;

import java.time.LocalDate;

/** {@code dueSoonFrom} lets the client recompute the situation when the day turns. */
public record RmaDeadlineResponse(RmaDeadlineStatus status, LocalDate dueSoonFrom) {}
