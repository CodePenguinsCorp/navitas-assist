package br.com.navitasassist.rma;

import java.time.LocalDate;

import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

public record RmaItemRequest(
    @NotNull Long productId,
    @Size(max = 60) String batchNumber,
    @Size(max = 60) String serialNumber,
    LocalDate manufacturedAt
) {
}
