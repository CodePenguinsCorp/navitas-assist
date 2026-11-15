package br.com.navitasassist.part;

import java.math.BigDecimal;
import java.time.Instant;

public record PartUsageResponse(
    Long id,
    Long rmaId,
    String rmaCode,
    Long partId,
    String partCode,
    String partName,
    String unit,
    String location,
    BigDecimal quantity,
    PartUsageStatus status,
    BigDecimal partOnHand,
    BigDecimal unitCost,
    BigDecimal totalCost,
    String notes,
    String createdBy,
    Instant createdAt,
    Instant updatedAt,
    String replacementReason,
    String componentBatch,
    Instant appliedAt,
    String appliedBy
) {
    /** Mesmo uso sem custos, para quem não tem `pecas.ver`. */
    public PartUsageResponse withoutCosts() {
        return new PartUsageResponse(id, rmaId, rmaCode, partId, partCode, partName, unit, location, quantity, status, partOnHand,
            null, null, notes, createdBy, createdAt, updatedAt, replacementReason, componentBatch, appliedAt, appliedBy);
    }

    public static PartUsageResponse from(PartUsage usage, BigDecimal unitCost, BigDecimal totalCost) {
        Part part = usage.getPart();
        return new PartUsageResponse(
            usage.getId(),
            usage.getRma().getId(),
            usage.getRma().getCode(),
            part.getId(),
            part.getCode(),
            part.getName(),
            part.getUnit(),
            part.getLocation(),
            usage.getQuantity(),
            usage.getStatus(),
            part.getOnHand(),
            unitCost,
            totalCost,
            usage.getNote(),
            usage.getCreatedBy(),
            usage.getCreatedAt(),
            usage.getUpdatedAt(),
            usage.getReplacementReason(),
            usage.getComponentBatch(),
            usage.getAppliedAt(),
            usage.getAppliedBy()
        );
    }
}
