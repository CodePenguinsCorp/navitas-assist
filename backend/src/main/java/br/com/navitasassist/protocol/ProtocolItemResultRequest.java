package br.com.navitasassist.protocol;

import java.math.BigDecimal;
import java.time.Instant;

import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

public record ProtocolItemResultRequest(
    @NotNull ProtocolItemOutcome outcome,
    BigDecimal measuredValue,
    @Size(max = 1000) String textValue,
    @Size(max = 500) String evidence,
    @Size(max = 500) String justification,
    Instant startedAt
) {
}
