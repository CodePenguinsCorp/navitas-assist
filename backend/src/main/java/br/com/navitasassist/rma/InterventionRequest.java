package br.com.navitasassist.rma;

import java.math.BigDecimal;
import java.time.LocalDate;
import jakarta.validation.constraints.*;

public record InterventionRequest(
    @NotNull InterventionType type,
    @NotBlank @Size(max = 1000) String description,
    @NotNull @PastOrPresent LocalDate performedOn,
    @NotNull @DecimalMin(value = "0", inclusive = false) @Digits(integer = 6, fraction = 3) BigDecimal hours
) {}
