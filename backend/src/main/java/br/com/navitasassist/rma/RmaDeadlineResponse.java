package br.com.navitasassist.rma;

import java.time.LocalDate;

/**
 * {@code dueSoonFrom} lets the client recompute the situation when the day turns; {@code daysUntilDue} is negative when
 * overdue and null without a due date or for closed RMAs.
 */
public record RmaDeadlineResponse(RmaDeadlineStatus status, LocalDate dueSoonFrom, Long daysUntilDue) {}
