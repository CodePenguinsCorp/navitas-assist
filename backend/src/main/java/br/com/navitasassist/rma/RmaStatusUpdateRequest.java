package br.com.navitasassist.rma;

import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

public record RmaStatusUpdateRequest(
    @NotNull RmaStatus status,
    @Size(max = 255) String note
) {
}
