package br.com.navitasassist.shipment;

public record CarrierEventIngestResponse(
    Long shipmentId,
    ShipmentStatus status,
    boolean duplicate
) {
}
