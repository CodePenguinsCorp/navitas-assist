package br.com.navitasassist.shipment;

import java.math.BigDecimal;
import java.time.Instant;

public record ShipmentResponse(
    Long id,
    Long rmaId,
    String rmaCode,
    ShipmentType type,
    ShipmentStatus status,
    String originName,
    String originAddress,
    String destinationName,
    String destinationAddress,
    boolean addressRestricted,
    boolean addressesPurged,
    int volumes,
    String carrier,
    String serviceName,
    String trackingCode,
    String labelReference,
    BigDecimal cost,
    long deliveryAttempts,
    Instant closedAt,
    String createdBy,
    Instant createdAt,
    Instant updatedAt
) {
    public static ShipmentResponse from(RmaShipment shipment, boolean canViewAddresses) {
        long deliveryAttempts = shipment.getEvents().stream().filter(event -> event.getStatus() == ShipmentStatus.DELIVERY_ATTEMPT).count();
        return new ShipmentResponse(
            shipment.getId(),
            shipment.getRma().getId(),
            shipment.getRma().getCode(),
            shipment.getType(),
            shipment.getStatus(),
            shipment.getOriginName(),
            canViewAddresses ? shipment.getOriginAddress() : null,
            shipment.getDestinationName(),
            canViewAddresses ? shipment.getDestinationAddress() : null,
            !canViewAddresses,
            shipment.getAddressesPurgedAt() != null,
            shipment.getVolumes(),
            shipment.getCarrier(),
            shipment.getServiceName(),
            shipment.getTrackingCode(),
            shipment.getLabelReference(),
            shipment.getCost(),
            deliveryAttempts,
            shipment.getClosedAt(),
            shipment.getCreatedBy(),
            shipment.getCreatedAt(),
            shipment.getUpdatedAt()
        );
    }
}
