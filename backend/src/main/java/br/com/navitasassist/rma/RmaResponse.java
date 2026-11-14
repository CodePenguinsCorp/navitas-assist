package br.com.navitasassist.rma;

import java.time.Instant;
import java.time.LocalDate;
import java.util.List;

import br.com.navitasassist.diagnosis.DiagnosisResponse;

public record RmaResponse(
    Long id,
    String code,
    String clientName,
    List<RmaItemResponse> items,
    LocalDate purchaseDate,
    boolean purchaseDateUnknown,
    LocalDate entryDate,
    LocalDate dueDate,
    String invoiceNumber,
    String receivedBy,
    String reportedFailure,
    String receivedAccessories,
    String physicalCondition,
    RmaPriority priority,
    RmaStatus status,
    RmaDeadlineResponse deadline,
    Long assigneeId,
    String assigneeName,
    String repairSummary,
    String replacedPartsSummary,
    String testSummary,
    String carrier,
    String trackingCode,
    DiagnosisResponse diagnosis,
    List<RmaRepairHistoryResponse> repairHistory,
    List<RmaStatusHistoryResponse> statusHistory,
    List<RmaStagePeriodResponse> stagePeriods,
    List<RmaAssignmentHistoryResponse> assignmentHistory,
    List<RmaDueDateHistoryResponse> dueDateHistory,
    List<RmaItemWarrantyHistoryResponse> warrantyHistory,
    RmaBlockResponse currentBlock,
    List<RmaBlockResponse> blockHistory,
    Instant createdAt,
    Instant updatedAt
) {
    public static RmaResponse from(RmaRecord rma, List<RmaStagePeriodResponse> stagePeriods, RmaDeadlineResponse deadline) {
        List<RmaItemResponse> items = rma.getItems().isEmpty()
            ? List.of(RmaItemResponse.fromLegacy(rma))
            : rma.getItems().stream().map(RmaItemResponse::from).toList();

        return new RmaResponse(
            rma.getId(),
            rma.getCode(),
            rma.getClient().getLegalName(),
            items,
            rma.getPurchaseDate(),
            rma.isPurchaseDateUnknown(),
            rma.getEntryDate(),
            rma.getDueDate(),
            rma.getInvoiceNumber(),
            rma.getReceivedBy(),
            rma.getReportedFailure(),
            rma.getReceivedAccessories(),
            rma.getPhysicalCondition(),
            rma.getPriority(),
            rma.getStatus(),
            deadline,
            rma.getAssignee() == null ? null : rma.getAssignee().getId(),
            rma.getAssignee() == null ? null : rma.getAssignee().getFullName(),
            rma.getRepairSummary(),
            rma.getReplacedPartsSummary(),
            rma.getTestSummary(),
            rma.getCarrier(),
            rma.getTrackingCode(),
            DiagnosisResponse.from(rma.getDiagnosis()),
            rma.getRepairHistory().stream().map(RmaRepairHistoryResponse::from).toList(),
            rma.getStatusHistory().stream().map(RmaStatusHistoryResponse::from).toList(),
            stagePeriods,
            rma.getAssignmentHistory().stream().map(RmaAssignmentHistoryResponse::from).toList(),
            rma.getDueDateHistory().stream().map(RmaDueDateHistoryResponse::from).toList(),
            rma.getItems().stream().flatMap(item -> item.getWarrantyHistory().stream())
                .sorted(java.util.Comparator.comparing(RmaItemWarrantyHistory::getChangedAt).thenComparing(RmaItemWarrantyHistory::getId,
                    java.util.Comparator.nullsFirst(java.util.Comparator.naturalOrder())).reversed())
                .map(RmaItemWarrantyHistoryResponse::from).toList(),
            rma.getBlockHistory().stream().filter(block -> block.getResolvedAt() == null).findFirst().map(RmaBlockResponse::from).orElse(null),
            rma.getBlockHistory().stream().map(RmaBlockResponse::from).toList(),
            rma.getCreatedAt(),
            rma.getUpdatedAt()
        );
    }
}
