package br.com.navitasassist.rma;

import java.time.Instant;

/** One continuous stay of an RMA in a stage. {@code leftAt} is null for the current stage. */
public record RmaStagePeriodResponse(RmaStatus status, Instant enteredAt, Instant leftAt, long durationSeconds) {}
