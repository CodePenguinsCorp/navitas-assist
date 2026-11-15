package br.com.navitasassist.rma;

import java.time.Instant;

/** Início do impedimento aberto de uma OS. */
public record RmaBlockPoint(Long rmaId, Instant blockedAt) {}
