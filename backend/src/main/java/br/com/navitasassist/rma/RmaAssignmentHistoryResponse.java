package br.com.navitasassist.rma;

import java.time.Instant;

public record RmaAssignmentHistoryResponse(
    Long previousAssigneeId,
    String previousAssigneeName,
    Long newAssigneeId,
    String newAssigneeName,
    String changedBy,
    Instant changedAt
) {
    public static RmaAssignmentHistoryResponse from(RmaAssignmentHistory history) {
        return new RmaAssignmentHistoryResponse(
            history.getPreviousAssigneeId(),
            history.getPreviousAssigneeName(),
            history.getNewAssigneeId(),
            history.getNewAssigneeName(),
            history.getChangedBy(),
            history.getChangedAt()
        );
    }
}
