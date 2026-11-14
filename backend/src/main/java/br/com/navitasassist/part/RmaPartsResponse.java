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
    List<PartReservationResponse> replacedComponents,
    long pendingCount
) {
    /** Sem `pecas.ver`: as reservas continuam visíveis, mas sem custo unitário, total, reservado ou aplicado. */
    public RmaPartsResponse withoutCosts() {
        return new RmaPartsResponse(rmaId, rmaCode, reservations.stream().map(PartReservationResponse::withoutCosts).toList(), movements,
            null, null, replacedComponents == null ? null : replacedComponents.stream().map(PartReservationResponse::withoutCosts).toList(), pendingCount);
    }
}
