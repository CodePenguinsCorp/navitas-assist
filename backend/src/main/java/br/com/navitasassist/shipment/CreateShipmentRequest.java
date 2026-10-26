package br.com.navitasassist.shipment;

import java.math.BigDecimal;

import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.Digits;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

public record CreateShipmentRequest(
    @NotNull Long rmaId,
    @NotNull ShipmentType type,
    @NotBlank @Size(max = 120) String originName,
    @Size(max = 500) String originAddress,
    @NotBlank @Size(max = 120) String destinationName,
    @Size(max = 500) String destinationAddress,
    @NotNull @Min(1) @Max(999) Integer volumes,
    @NotBlank @Size(max = 120) String carrier,
    @Size(max = 120) String serviceName,
    @Size(max = 120) String trackingCode,
    @Size(max = 255) String labelReference,
    @DecimalMin("0.00") @Digits(integer = 10, fraction = 2) BigDecimal cost
) {
}
