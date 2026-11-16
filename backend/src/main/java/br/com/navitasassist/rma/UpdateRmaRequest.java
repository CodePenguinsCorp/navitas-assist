package br.com.navitasassist.rma;

import java.time.LocalDate;
import java.util.List;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

public record UpdateRmaRequest(
    Long clientId,
    @Size(min = 1, max = 20, message = "A OS deve ter de 1 a 20 itens.") List<@NotNull @Valid RmaItemRequest> items,
    LocalDate purchaseDate,
    Boolean purchaseDateUnknown,
    LocalDate entryDate,
    @Size(max = 80) String invoiceNumber,
    @Size(max = 1000) String reportedFailure,
    @Size(max = 500) String receivedAccessories,
    @Size(max = 500) String physicalCondition,
    RmaPriority priority,
    LocalDate dueDate,
    Boolean clearDueDate
) {
}
