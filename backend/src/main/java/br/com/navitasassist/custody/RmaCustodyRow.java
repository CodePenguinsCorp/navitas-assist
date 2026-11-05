package br.com.navitasassist.custody;

import java.time.Instant;

import br.com.navitasassist.rma.RmaStatus;

/**
 * Projection of an RMA with its latest custody movement, loaded in a single query.
 */
public record RmaCustodyRow(
    Long rmaId,
    String rmaCode,
    RmaStatus rmaStatus,
    String clientLegalName,
    String clientTradeName,
    String productName,
    Long locationId,
    String locationCode,
    String locationName,
    StorageLocationType locationType,
    Long custodianId,
    String custodianName,
    Instant since
) {
}
