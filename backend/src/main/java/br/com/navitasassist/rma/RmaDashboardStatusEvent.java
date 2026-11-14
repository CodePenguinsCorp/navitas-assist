package br.com.navitasassist.rma;

import java.time.Instant;

/** Evento de status recente exibido no bloco de auditoria do dashboard. */
public record RmaDashboardStatusEvent(Long rmaId, String code, RmaStatus status, String changedBy, String note, Instant changedAt) {}
