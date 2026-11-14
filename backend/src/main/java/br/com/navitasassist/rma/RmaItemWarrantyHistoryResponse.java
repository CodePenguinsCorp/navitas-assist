package br.com.navitasassist.rma;

import java.time.Instant;

public record RmaItemWarrantyHistoryResponse(Long itemId, WarrantyStatus previousOverride, WarrantyStatus newOverride,
    String reason, String changedBy, Instant changedAt) {
    public static RmaItemWarrantyHistoryResponse from(RmaItemWarrantyHistory history) {
        return new RmaItemWarrantyHistoryResponse(history.getItem().getId(), history.getPreviousOverride(), history.getNewOverride(),
            history.getReason(), history.getChangedBy(), history.getChangedAt());
    }
}
