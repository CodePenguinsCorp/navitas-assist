package br.com.navitasassist.rma;

import java.time.LocalDate;

/** Linha da fila prioritária do dashboard. */
public record RmaDashboardQueueItem(Long id, String code, String clientName, LocalDate entryDate, RmaStatus status, RmaPriority priority) {}
