package br.com.navitasassist.rma;

import java.time.LocalDate;

import jakarta.validation.constraints.Size;

public record UpdateRmaRequest(
    Long clientId,
    Long productId,
    @Size(max = 60) String batchNumber,
    @Size(max = 60) String serialNumber,
    LocalDate manufacturedAt,
    LocalDate purchaseDate,
    Boolean purchaseDateUnknown,
    LocalDate entryDate,
    @Size(max = 80) String invoiceNumber,
    @Size(max = 180) String invoiceFileName,
    @Size(max = 120) String receivedBy,
    @Size(max = 2000) String reportedFailure,
    @Size(max = 1000) String receivedAccessories,
    @Size(max = 1000) String physicalCondition,
    RmaPriority priority,
    WarrantyStatus warrantyStatusOverride,
    @Size(max = 255) String warrantyJustification,
    @Size(max = 2000) String repairSummary,
    @Size(max = 2000) String replacedPartsSummary,
    @Size(max = 2000) String testSummary,
    LocalDate shippedAt,
    @Size(max = 120) String carrier,
    @Size(max = 120) String trackingCode
) {
}
