package br.com.navitasassist.rma;

import java.time.LocalDate;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

public record CreateRmaRequest(
    @NotNull Long clientId,
    @NotNull Long productId,
    @Size(max = 60) String batchNumber,
    @Size(max = 60) String serialNumber,
    LocalDate manufacturedAt,
    LocalDate purchaseDate,
    boolean purchaseDateUnknown,
    @NotNull LocalDate entryDate,
    @Size(max = 80) String invoiceNumber,
    @Size(max = 180) String invoiceFileName,
    @NotBlank @Size(max = 120) String receivedBy,
    @NotBlank @Size(max = 2000) String reportedFailure,
    @Size(max = 1000) String receivedAccessories,
    @Size(max = 1000) String physicalCondition,
    RmaPriority priority,
    WarrantyStatus warrantyStatusOverride,
    @Size(max = 255) String warrantyJustification,
    @Size(max = 2000) String repairSummary,
    @Size(max = 2000) String replacedPartsSummary,
    @Size(max = 2000) String testSummary
) {
}
