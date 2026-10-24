package br.com.navitasassist.scan;

import br.com.navitasassist.rma.RmaStatus;
import jakarta.validation.constraints.AssertTrue;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

/**
 * Quick status change started from a scan. {@code expectedStatus} is the status the user saw and {@code confirmed} the
 * explicit confirmation; both are checked on the server.
 */
public record ScanStatusChangeRequest(
    @NotNull RmaStatus expectedStatus,
    @NotNull RmaStatus status,
    @Size(max = 255) String note,
    @NotNull ScanSource source,
    @NotNull @AssertTrue Boolean confirmed
) {
}
