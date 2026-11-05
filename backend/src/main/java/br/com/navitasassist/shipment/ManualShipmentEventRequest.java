package br.com.navitasassist.shipment;

import java.time.Instant;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

public record ManualShipmentEventRequest(
    @NotNull ShipmentStatus status,
    @Size(max = 500) String description,
    @Size(max = 255) String proofReference,
    Instant occurredAt,
    @NotBlank @Size(max = 500) String justification
) {
}
