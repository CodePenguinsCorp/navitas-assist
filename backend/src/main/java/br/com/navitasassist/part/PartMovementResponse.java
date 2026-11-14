package br.com.navitasassist.part;

import java.math.BigDecimal;
import java.time.Instant;

/** Movimento de estoque sem custos: o código e o nome da peça aparecem na OS e na mensagem de sucesso da tela Peças. */
public record PartMovementResponse(
    Long id,
    Long partId,
    String partCode,
    String partName,
    PartMovementType type,
    BigDecimal quantity,
    BigDecimal onHandChange,
    BigDecimal reservedChange,
    BigDecimal onHandAfter,
    BigDecimal reservedAfter,
    String rmaCode,
    Long reversedMovementId,
    boolean reversed,
    String reason,
    String createdBy,
    Instant createdAt
) {
    public static PartMovementResponse from(PartMovement movement, boolean reversed) {
        return new PartMovementResponse(
            movement.getId(),
            movement.getPart().getId(),
            movement.getPart().getCode(),
            movement.getPart().getName(),
            movement.getType(),
            movement.getQuantity(),
            movement.getOnHandChange(),
            movement.getReservedChange(),
            movement.getOnHandAfter(),
            movement.getReservedAfter(),
            movement.getRma() == null ? null : movement.getRma().getCode(),
            movement.getReversedMovement() == null ? null : movement.getReversedMovement().getId(),
            reversed,
            movement.getReason(),
            movement.getCreatedBy(),
            movement.getCreatedAt()
        );
    }
}
