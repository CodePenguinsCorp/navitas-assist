package br.com.navitasassist.part;

import java.math.BigDecimal;
import java.time.Instant;

public record PartReservationResponse(
    Long id,
    Long rmaId,
    String rmaCode,
    Long partId,
    String partCode,
    String partName,
    String unit,
    String location,
    BigDecimal quantity,
    PartReservationStatus status,
    BigDecimal partAvailable,
    BigDecimal unitCost,
    BigDecimal totalCost,
    String note,
    String createdBy,
    Instant createdAt,
    Instant updatedAt
) {
    public static PartReservationResponse from(PartReservation reservation, BigDecimal unitCost, BigDecimal totalCost) {
        Part part = reservation.getPart();
        return new PartReservationResponse(
            reservation.getId(),
            reservation.getRma().getId(),
            reservation.getRma().getCode(),
            part.getId(),
            part.getCode(),
            part.getName(),
            part.getUnit(),
            part.getLocation(),
            reservation.getQuantity(),
            reservation.getStatus(),
            part.getAvailable(),
            unitCost,
            totalCost,
            reservation.getNote(),
            reservation.getCreatedBy(),
            reservation.getCreatedAt(),
            reservation.getUpdatedAt()
        );
    }
}
