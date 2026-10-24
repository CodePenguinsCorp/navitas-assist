package br.com.navitasassist.rma;

import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Positive;

public record RmaPositionUpdateRequest(@NotNull RmaStatus expectedStatus, @NotNull @Positive Long anchorId, @NotNull Boolean after) {
}
