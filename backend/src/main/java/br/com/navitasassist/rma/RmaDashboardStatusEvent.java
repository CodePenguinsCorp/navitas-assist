package br.com.navitasassist.rma;

import java.time.Instant;

/** Evento de status recente exibido no bloco de auditoria do dashboard; previousStatus é nulo no primeiro registro da OS. */
public record RmaDashboardStatusEvent(Long rmaId, String code, RmaStatus status, RmaStatus previousStatus, String changedBy, String note, Instant changedAt) {}
