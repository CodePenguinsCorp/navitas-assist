package br.com.navitasassist.report;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;

import br.com.navitasassist.rma.RmaResponse;

/**
 * Data of the final technical report of one RMA. Structured replaced components and interventions (future work) are
 * meant to enter as new fields here, next to the free-text summaries and the consumed part reservations.
 */
public record RmaTechnicalReport(RmaResponse rma, List<ConsumedPart> consumedParts, Instant generatedAt) {

    /** A part reservation already consumed by the RMA; costs are intentionally left out of the report. */
    public record ConsumedPart(String code, String name, BigDecimal quantity, String unit) {}
}
