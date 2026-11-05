package br.com.navitasassist.shipment;

import java.time.Instant;

public record ShipmentEventResponse(
    Long id,
    ShipmentEventSource source,
    String externalEventId,
    ShipmentStatus status,
    String description,
    String proofReference,
    String justification,
    Instant occurredAt,
    String recordedBy,
    Instant recordedAt
) {
    public static ShipmentEventResponse from(RmaShipmentEvent event) {
        return new ShipmentEventResponse(
            event.getId(),
            event.getSource(),
            event.getExternalEventId(),
            event.getStatus(),
            event.getDescription(),
            event.getProofReference(),
            event.getJustification(),
            event.getOccurredAt(),
            event.getRecordedBy(),
            event.getRecordedAt()
        );
    }
}
