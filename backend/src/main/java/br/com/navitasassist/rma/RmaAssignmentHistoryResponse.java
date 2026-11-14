package br.com.navitasassist.rma;

import java.time.Instant;

public record RmaAssignmentHistoryResponse(
    String previousAssigneeName,
    String newAssigneeName,
    String changedBy,
    Instant changedAt
) {
    public static RmaAssignmentHistoryResponse from(RmaAssignmentHistory history) {
        return new RmaAssignmentHistoryResponse(
            history.getPreviousAssigneeName(),
            history.getNewAssigneeName(),
            history.getChangedBy(),
            history.getChangedAt()
        );
    }
}
