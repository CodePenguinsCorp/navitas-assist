package br.com.navitasassist.rma;

import java.time.Instant;

/** Linha das últimas OS atualizadas no dashboard. */
public record RmaDashboardRecentItem(Long id, String code, String clientName, String assigneeName, Instant updatedAt) {}
