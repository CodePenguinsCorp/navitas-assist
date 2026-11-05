package br.com.navitasassist.part;

import java.math.BigDecimal;
import java.util.List;

public record RmaPartsResponse(
    Long rmaId,
    String rmaCode,
    List<PartReservationResponse> reservations,
    List<PartMovementResponse> movements,
    BigDecimal reservedCost,
    BigDecimal consumedCost,
    long pendingCount
) {
}
