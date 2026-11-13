package br.com.navitasassist.rma;

import java.time.Instant;

public record WarrantyOverrideResponse(WarrantyStatus status, String reason, String changedBy, Instant changedAt) {
    public static WarrantyOverrideResponse from(RmaItem item) {
        return item.getWarrantyOverride() == null ? null : new WarrantyOverrideResponse(item.getWarrantyOverride(),
            item.getWarrantyOverrideReason(), item.getWarrantyOverrideBy(), item.getWarrantyOverrideAt());
    }
}
