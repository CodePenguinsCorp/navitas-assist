package br.com.navitasassist.protocol;

import java.math.BigDecimal;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

public record ProtocolTemplateItemRequest(
    @NotBlank @Size(max = 120) String stepName,
    @NotBlank @Size(max = 200) String title,
    @Size(max = 1000) String instructions,
    @NotNull ProtocolItemType type,
    boolean required,
    @Size(max = 20) String unit,
    @Min(0) @Max(6) Integer decimalPlaces,
    BigDecimal minValue,
    BigDecimal maxValue,
    @Size(max = 500) String expectedResult,
    boolean evidenceRequired
) {
}
