package br.com.navitasassist.protocol;

import java.time.Instant;

public record ProtocolItemResultResponse(
    Long id,
    int attempt,
    ProtocolItemOutcome outcome,
    String measuredValue,
    String unit,
    String textValue,
    String evidence,
    String justification,
    String executedBy,
    Instant startedAt,
    Instant completedAt
) {
    public static ProtocolItemResultResponse from(RmaProtocolItemResult result) {
        return new ProtocolItemResultResponse(
            result.getId(),
            result.getAttempt(),
            result.getOutcome(),
            ProtocolNumbers.plain(result.getMeasuredValue(), result.getItem().getDecimalPlaces()),
            result.getUnit(),
            result.getTextValue(),
            result.getEvidence(),
            result.getJustification(),
            result.getExecutedBy(),
            result.getStartedAt(),
            result.getCompletedAt()
        );
    }
}
