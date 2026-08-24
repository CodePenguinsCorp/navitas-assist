package br.com.navitasassist.product;

import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

public record ProductRequest(
    @NotBlank @Size(max = 60) String sku,
    @NotBlank @Size(max = 120) String name,
    @Size(max = 80) String category,
    @Size(max = 40) String hardwareVersion,
    @Size(max = 40) String firmwareVersion,
    @NotNull @Min(1) Integer defaultWarrantyMonths,
    @Size(max = 1000) String technicalNotes
) {
}
