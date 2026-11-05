package br.com.navitasassist.part;

import java.math.BigDecimal;

import jakarta.validation.constraints.Digits;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

/**
 * Manual stock movement. ENTRY and EXIT take a positive quantity; ADJUSTMENT takes a signed, non-zero quantity.
 */
public record PartMovementRequest(
    @NotNull PartMovementType type,
    @NotNull @Digits(integer = 9, fraction = 3) BigDecimal quantity,
    @Size(max = 255) String reason
) {
}
