package br.com.navitasassist.rma;

import java.math.BigDecimal;
import java.time.Instant;

public record ExternalComponentResponse(Long id, String code, String description, BigDecimal quantity, String unit,
    String componentBatch, String replacementReason, Instant appliedAt, String appliedBy) {
    public static ExternalComponentResponse from(RmaExternalComponent component) {
        return new ExternalComponentResponse(component.getId(), component.getCode(), component.getDescription(), component.getQuantity(),
            component.getUnit(), component.getComponentBatch(), component.getReplacementReason(), component.getAppliedAt(), component.getAppliedBy());
    }
}
