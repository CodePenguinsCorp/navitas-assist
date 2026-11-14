package br.com.navitasassist.report;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;
import br.com.navitasassist.rma.InterventionResponse;
import br.com.navitasassist.rma.RmaDetailResponse;

/** Structured repair data of the final technical report, without inventory costs. */
public record RmaTechnicalReport(RmaDetailResponse rma, List<ReplacedComponent> replacedComponents,
    List<InterventionResponse> interventions, BigDecimal totalServiceHours, Instant generatedAt) {
    public record ReplacedComponent(String code, String description, BigDecimal quantity, String unit,
        String componentBatch, String replacementReason, Instant appliedAt, String appliedBy, String source) {}
}
