package br.com.navitasassist.rma;

import java.time.Instant;

/** Mudança de status sem notas nem autor: o bastante para saber quando a etapa atual começou. */
public record RmaStatusPoint(Long rmaId, RmaStatus status, Instant changedAt, Long id) {}
