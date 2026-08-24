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
    WarrantyStatus warrantyStatus,
    boolean warrantyOverridden,
    String warrantyJustification,
    String warrantyUpdatedBy,
    Instant warrantyUpdatedAt,
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
        return new RmaResponse(
            rma.getId(),
            rma.getCode(),
            rma.getClient().getId(),
            rma.getClient().getLegalName(),
            rma.getProduct().getId(),
            rma.getProduct().getName(),
            rma.getProduct().getSku(),
            rma.getItemIdentification().getBatchNumber(),
            rma.getItemIdentification().getSerialNumber(),
            rma.getItemIdentification().getManufacturedAt(),
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
            rma.getWarrantyStatus(),
            rma.isWarrantyOverridden(),
            rma.getWarrantyJustification(),
            rma.getWarrantyUpdatedBy(),
            rma.getWarrantyUpdatedAt(),
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
