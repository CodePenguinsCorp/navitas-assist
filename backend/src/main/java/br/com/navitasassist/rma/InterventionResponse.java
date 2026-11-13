package br.com.navitasassist.rma;

import java.math.BigDecimal;
import java.time.LocalDate;

public record InterventionResponse(Long id, InterventionType type, String description, LocalDate performedOn, BigDecimal hours, String technicianName, String editedBy, java.time.Instant editedAt, String voidedBy, java.time.Instant voidedAt, String voidReason) {
    public static InterventionResponse from(RmaIntervention intervention) {
        return new InterventionResponse(intervention.getId(), intervention.getType(), intervention.getDescription(), intervention.getPerformedOn(), intervention.getHours(), intervention.getTechnicianName(), intervention.getEditedBy(), intervention.getEditedAt(), intervention.getVoidedBy(), intervention.getVoidedAt(), intervention.getVoidReason());
    }
}
