package br.com.navitasassist.shipment;

import java.util.List;

public record ShipmentDetailResponse(
    ShipmentResponse shipment,
    List<ShipmentEventResponse> events
) {
}
