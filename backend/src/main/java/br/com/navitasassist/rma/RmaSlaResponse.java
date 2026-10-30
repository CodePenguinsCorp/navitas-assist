package br.com.navitasassist.rma;

import java.time.Instant;

public record RmaSlaResponse(RmaSlaStatus status, Instant startedAt, Instant warningAt, Instant dueAt, long elapsedSeconds, Long limitSeconds) {}
