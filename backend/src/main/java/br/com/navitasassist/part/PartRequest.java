package br.com.navitasassist.part;

import java.math.BigDecimal;

import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.Digits;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

public record PartRequest(
    @NotBlank @Size(max = 60) String code,
    @NotBlank @Size(max = 120) String name,
    @NotBlank @Size(max = 20) String unit,
    @Size(max = 120) String location,
    @NotNull @DecimalMin("0") @Digits(integer = 9, fraction = 3) BigDecimal minimumStock,
    @NotNull @DecimalMin("0") @Digits(integer = 10, fraction = 2) BigDecimal unitCost,
    Boolean active
) {
}
