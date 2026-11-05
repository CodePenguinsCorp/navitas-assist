package br.com.navitasassist.custody;

import java.time.Instant;

public record CustodyMovementResponse(
    Long id,
    CustodyMovementType type,
    Long fromLocationId,
    String fromLocationName,
    Long toLocationId,
    String toLocationName,
    Long custodianId,
    String custodianName,
    String reason,
    String performedBy,
    Instant performedAt
) {
    public static CustodyMovementResponse from(RmaCustodyMovement movement) {
        StorageLocation from = movement.getFromLocation();
        StorageLocation to = movement.getToLocation();
        return new CustodyMovementResponse(
            movement.getId(),
            movement.getType(),
            from == null ? null : from.getId(),
            from == null ? null : from.getName(),
            to == null ? null : to.getId(),
            to == null ? null : to.getName(),
            movement.getCustodianId(),
            movement.getCustodianName(),
            movement.getReason(),
            movement.getPerformedBy(),
            movement.getPerformedAt()
        );
    }
}
