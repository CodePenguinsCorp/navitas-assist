package br.com.navitasassist.custody;

import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

public record CustodyMovementRequest(
    @NotNull CustodyMovementType type,
    Long toLocationId,
    Long custodianId,
    @Size(max = 255) String reason
) {
}
