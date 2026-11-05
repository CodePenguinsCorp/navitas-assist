package br.com.navitasassist.part;

import java.math.BigDecimal;

public record PartReplenishmentResponse(
    Long partId,
    String code,
    String name,
    String unit,
    String location,
    BigDecimal minimumStock,
    BigDecimal onHand,
    BigDecimal reserved,
    BigDecimal available,
    BigDecimal pendingQuantity,
    BigDecimal suggestedQuantity,
    boolean belowMinimum
) {
}
