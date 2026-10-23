package br.com.navitasassist.rma;

import java.time.LocalDate;
import java.util.List;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

public record CreateRmaRequest(
    @NotNull Long clientId,
    @NotEmpty List<@NotNull @Valid RmaItemRequest> items,
    LocalDate purchaseDate,
    boolean purchaseDateUnknown,
    @NotNull LocalDate entryDate,
    @Size(max = 80) String invoiceNumber,
    @NotBlank @Size(max = 1000) String reportedFailure,
    @Size(max = 500) String receivedAccessories,
    @Size(max = 500) String physicalCondition,
    RmaPriority priority,
    @Size(max = 600) String repairSummary,
    @Size(max = 600) String replacedPartsSummary,
    @Size(max = 800) String testSummary
) {
}
