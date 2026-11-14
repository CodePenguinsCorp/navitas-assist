package br.com.navitasassist.rma;

import java.time.Instant;

/** Impedimento ativo no card do Kanban: o motivo aparece no título do aviso e o início conta a duração. */
public record RmaBlockSummaryResponse(String reason, Instant blockedAt) {
    public static RmaBlockSummaryResponse from(RmaBlock block) {
        return block == null ? null : new RmaBlockSummaryResponse(block.getReason(), block.getBlockedAt());
    }
}
