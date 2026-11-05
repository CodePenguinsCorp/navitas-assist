package br.com.navitasassist.shipment;

public enum ShipmentStatus {
    CREATED,
    LABEL_ISSUED,
    IN_TRANSIT,
    DELIVERY_ATTEMPT,
    EXCEPTION,
    DELIVERED,
    CANCELLED;

    public boolean isClosed() {
        return this == DELIVERED || this == CANCELLED;
    }
}
