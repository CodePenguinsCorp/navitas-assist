package br.com.navitasassist.rma;

import java.math.BigDecimal;
import java.time.LocalDate;

public record InterventionResponse(Long id, InterventionType type, String description, LocalDate performedOn, BigDecimal hours, String technicianName) {
    public static InterventionResponse from(RmaIntervention intervention) {
        return new InterventionResponse(intervention.getId(), intervention.getType(), intervention.getDescription(), intervention.getPerformedOn(), intervention.getHours(), intervention.getTechnicianName());
    }
}
