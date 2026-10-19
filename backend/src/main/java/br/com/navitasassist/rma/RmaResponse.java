package br.com.navitasassist.rma;

import java.time.Instant;
import java.time.LocalDate;
import java.util.List;

import br.com.navitasassist.diagnosis.DiagnosisResponse;

public record RmaResponse(
    Long id,
    String code,
    Long clientId,
    String clientName,
    List<RmaItemResponse> items,
    Long productId,
    String productName,
    String productSku,
    String batchNumber,
    String serialNumber,
    LocalDate manufacturedAt,
    LocalDate purchaseDate,
    boolean purchaseDateUnknown,
    LocalDate entryDate,
    String invoiceNumber,
    String invoiceFileName,
    String receivedBy,
    String reportedFailure,
    String receivedAccessories,
    String physicalCondition,
    RmaPriority priority,
    RmaStatus status,
    String repairSummary,
    String replacedPartsSummary,
    String testSummary,
    LocalDate shippedAt,
    String carrier,
    String trackingCode,
    DiagnosisResponse diagnosis,
    List<RmaStatusHistoryResponse> statusHistory,
    Instant createdAt,
    Instant updatedAt
) {
    public static RmaResponse from(RmaRecord rma) {
        List<RmaItemResponse> items = rma.getItems().isEmpty()
            ? List.of(RmaItemResponse.fromLegacy(rma))
            : rma.getItems().stream().map(RmaItemResponse::from).toList();
        RmaItemResponse primaryItem = items.get(0);

        return new RmaResponse(
            rma.getId(),
            rma.getCode(),
            rma.getClient().getId(),
            rma.getClient().getLegalName(),
            items,
            primaryItem.productId(),
            primaryItem.productName(),
            primaryItem.productSku(),
            primaryItem.batchNumber(),
            primaryItem.serialNumber(),
            primaryItem.manufacturedAt(),
            rma.getPurchaseDate(),
            rma.isPurchaseDateUnknown(),
            rma.getEntryDate(),
            rma.getInvoiceNumber(),
            rma.getInvoiceFileName(),
            rma.getReceivedBy(),
            rma.getReportedFailure(),
            rma.getReceivedAccessories(),
            rma.getPhysicalCondition(),
            rma.getPriority(),
            rma.getStatus(),
            rma.getRepairSummary(),
            rma.getReplacedPartsSummary(),
            rma.getTestSummary(),
            rma.getShippedAt(),
            rma.getCarrier(),
            rma.getTrackingCode(),
            DiagnosisResponse.from(rma.getDiagnosis()),
            rma.getStatusHistory().stream().map(RmaStatusHistoryResponse::from).toList(),
            rma.getCreatedAt(),
            rma.getUpdatedAt()
        );
    }
}
