package br.com.navitasassist.rma;

import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

public record RmaBulkStatusUpdateRequest(
    @NotNull RmaStatus status,
    @NotNull RmaStatus expectedStatus,
    @Size(max = 255) String note
) {
}
