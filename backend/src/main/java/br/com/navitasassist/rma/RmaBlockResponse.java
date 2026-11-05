package br.com.navitasassist.rma;

import java.time.Instant;

public record RmaBlockResponse(Long id, String reason, String category, String blockedBy, Instant blockedAt, String resolvedBy, Instant resolvedAt, String resolutionNote) {
    public static RmaBlockResponse from(RmaBlock block) {
        return new RmaBlockResponse(block.getId(), block.getReason(), block.getCategory(), block.getBlockedBy(), block.getBlockedAt(), block.getResolvedBy(), block.getResolvedAt(), block.getResolutionNote());
    }
}
