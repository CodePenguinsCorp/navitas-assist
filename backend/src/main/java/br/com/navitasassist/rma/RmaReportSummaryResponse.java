package br.com.navitasassist.rma;

import java.time.Instant;
import java.time.LocalDate;
import java.util.List;

/** Aggregated report for the period: every ranking holds at most {@code RmaReportService.TOP_LIMIT} rows. */
public record RmaReportSummaryResponse(
    Instant generatedAt,
    LocalDate entryFrom,
    LocalDate entryTo,
    long totalRmas,
    long totalItems,
    List<CountRow> byStatus,
    List<CountRow> byWarranty,
    List<CountRow> byMonth,
    List<CountRow> topProducts,
    List<CountRow> topBatches,
    List<CountRow> topClients,
    List<CountRow> topFailureTypes,
    Recurrence recurrence,
    List<StageRow> stages
) {
    public record CountRow(String key, String label, long count) {}

    /** An item returned when its product and serial number have two or more RMAs entered up to the end of the period. */
    public record Recurrence(long itemsWithSerial, long returnedItems, List<RateRow> byProduct, List<RateRow> byBatch, List<SerialRow> serials) {}

    public record RateRow(String key, String label, long items, long returnedItems) {}

    public record SerialRow(String serialNumber, String productName, String productSku, long rmaCount) {}

    /** Current stage of the RMAs still open, measured at {@code generatedAt}. */
    public record StageRow(RmaStatus status, String label, long count, long averageSeconds, long maximumSeconds) {}
}
