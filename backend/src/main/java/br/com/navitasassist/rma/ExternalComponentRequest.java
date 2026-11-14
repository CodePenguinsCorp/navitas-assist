package br.com.navitasassist.rma;

import java.math.BigDecimal;
import jakarta.validation.constraints.*;

public record ExternalComponentRequest(
    @Size(max = 60) String code,
    @NotBlank @Size(max = 120) String description,
    @NotNull @DecimalMin(value = "0", inclusive = false) @Digits(integer = 9, fraction = 3) BigDecimal quantity,
    @Size(max = 20) String unit,
    @Size(max = 120) String componentBatch,
    @NotBlank @Size(max = 1000) String replacementReason
) {}
