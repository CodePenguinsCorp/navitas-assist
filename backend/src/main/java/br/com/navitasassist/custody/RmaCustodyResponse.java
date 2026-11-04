package br.com.navitasassist.custody;

import java.time.Instant;

import br.com.navitasassist.client.Client;
import br.com.navitasassist.rma.RmaRecord;
import br.com.navitasassist.rma.RmaStatus;

public record RmaCustodyResponse(
    Long rmaId,
    String rmaCode,
    RmaStatus rmaStatus,
    String clientName,
    String productName,
    Long locationId,
    String locationCode,
    String locationName,
    StorageLocationType locationType,
    Long custodianId,
    String custodianName,
    Instant since,
    CustodyFlag flag
) {
    public static RmaCustodyResponse from(RmaCustodyRow row, CustodyFlag flag) {
        boolean located = row.locationId() != null;
        return new RmaCustodyResponse(
            row.rmaId(),
            row.rmaCode(),
            row.rmaStatus(),
            row.clientTradeName() == null ? row.clientLegalName() : row.clientTradeName(),
            row.productName(),
            row.locationId(),
            row.locationCode(),
            row.locationName(),
            row.locationType(),
            located ? row.custodianId() : null,
            located ? row.custodianName() : null,
            row.since(),
            flag
        );
    }

    public static RmaCustodyResponse from(RmaRecord rma, RmaCustodyMovement latest, CustodyFlag flag) {
        StorageLocation location = latest == null ? null : latest.getToLocation();
        boolean located = location != null;
        Client client = rma.getClient();
        return new RmaCustodyResponse(
            rma.getId(),
            rma.getCode(),
            rma.getStatus(),
            client.getTradeName() == null ? client.getLegalName() : client.getTradeName(),
            rma.getProduct().getName(),
            located ? location.getId() : null,
            located ? location.getCode() : null,
            located ? location.getName() : null,
            located ? location.getType() : null,
            located ? latest.getCustodianId() : null,
            located ? latest.getCustodianName() : null,
            latest == null ? null : latest.getPerformedAt(),
            flag
        );
    }
}
