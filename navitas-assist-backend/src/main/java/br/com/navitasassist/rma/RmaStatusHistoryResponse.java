package br.com.navitasassist.rma;

import java.time.Instant;

public record RmaStatusHistoryResponse(
    RmaStatus status,
    String changedBy,
    Instant changedAt,
    String note
) {
    public static RmaStatusHistoryResponse from(RmaStatusHistory history) {
        return new RmaStatusHistoryResponse(
            history.getStatus(),
            history.getChangedBy(),
            history.getChangedAt(),
            history.getNote()
        );
    }
}
