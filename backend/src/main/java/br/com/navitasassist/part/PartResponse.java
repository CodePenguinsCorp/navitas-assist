package br.com.navitasassist.part;

import java.math.BigDecimal;
import java.time.Instant;

public record PartResponse(
    Long id,
    String code,
    String name,
    String unit,
    String location,
    BigDecimal minimumStock,
    BigDecimal unitCost,
    BigDecimal onHand,
    BigDecimal reserved,
    BigDecimal available,
    boolean belowMinimum,
    boolean active,
    Instant createdAt,
    Instant updatedAt
) {
    public static PartResponse from(Part part) {
        return new PartResponse(
            part.getId(),
            part.getCode(),
            part.getName(),
            part.getUnit(),
            part.getLocation(),
            part.getMinimumStock(),
            part.getUnitCost(),
            part.getOnHand(),
            part.getReserved(),
            part.getAvailable(),
            part.isBelowMinimum(),
            part.isActive(),
            part.getCreatedAt(),
            part.getUpdatedAt()
        );
    }
}
