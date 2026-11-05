package br.com.navitasassist.protocol;

import java.time.Instant;
import java.util.List;
import java.util.Set;

import br.com.navitasassist.rma.RmaStatus;

public record ProtocolExecutionResponse(
    Long id,
    Long rmaId,
    String rmaCode,
    Long templateId,
    String templateName,
    int versionNumber,
    ProtocolExecutionStatus status,
    Set<RmaStatus> blockedStatuses,
    String startedBy,
    Instant startedAt,
    String completedBy,
    Instant completedAt,
    int totalItems,
    int completedItems,
    int requiredItems,
    int pendingRequiredItems,
    int failedItems,
    List<ProtocolExecutionItemResponse> items
) {
}
