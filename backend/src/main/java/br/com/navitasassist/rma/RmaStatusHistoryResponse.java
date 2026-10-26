package br.com.navitasassist.rma;

import java.time.Instant;

public record RmaStatusHistoryResponse(
    String status,
    String changedBy,
    Instant changedAt,
    String note,
    String statusLabel,
    String workflowName,
    Long workflowVersion
) {
    public static RmaStatusHistoryResponse from(RmaStatusHistory history) {
        return new RmaStatusHistoryResponse(
            history.getStatus(),
            history.getChangedBy(),
            history.getChangedAt(),
            history.getNote(),
            history.getStatusLabel(),
            history.getWorkflowName(),
            history.getWorkflowVersion()
        );
    }
}
