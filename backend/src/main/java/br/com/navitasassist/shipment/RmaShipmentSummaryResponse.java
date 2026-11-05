package br.com.navitasassist.shipment;

import java.math.BigDecimal;

public record RmaShipmentSummaryResponse(
    Long rmaId,
    int shipmentCount,
    int openExceptions,
    BigDecimal totalCost
) {
}
