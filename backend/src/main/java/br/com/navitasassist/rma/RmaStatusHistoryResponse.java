package br.com.navitasassist.rma;

import java.time.Instant;

public record RmaStatusHistoryResponse(
    Long id,
    RmaStatus status,
    String changedBy,
    Instant changedAt,
    String note,
    String noteEditedBy,
    Instant noteEditedAt
) {
    public static RmaStatusHistoryResponse from(RmaStatusHistory history) {
        return new RmaStatusHistoryResponse(
            history.getId(),
            history.getStatus(),
            history.getChangedBy(),
            history.getChangedAt(),
            history.getNote(),
            history.getNoteEditedBy(),
            history.getNoteEditedAt()
        );
    }
}
