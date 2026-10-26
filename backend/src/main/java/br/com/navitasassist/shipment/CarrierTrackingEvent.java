package br.com.navitasassist.shipment;

import java.time.Instant;

public record CarrierTrackingEvent(
    String externalEventId,
    ShipmentStatus status,
    String description,
    String proofReference,
    Instant occurredAt
) {
}
