package br.com.navitasassist.part;

import java.math.BigDecimal;
import jakarta.validation.constraints.*;

public record PartUsageRequest(
    @NotNull(message = "Informe a peça.") Long partId,
    @NotNull(message = "Informe a quantidade.") @DecimalMin(value = "0", inclusive = false, message = "A quantidade deve ser maior que zero.") @Digits(integer = 9, fraction = 3, message = "Quantidade inválida.") BigDecimal quantity,
    @NotBlank(message = "Informe o motivo da troca.") @Size(max = 1000, message = "O motivo deve ter no máximo 1000 caracteres.") String replacementReason,
    @Size(max = 120, message = "O lote deve ter no máximo 120 caracteres.") String componentBatch,
    @Size(max = 255, message = "A observação deve ter no máximo 255 caracteres.") String notes
) {}
