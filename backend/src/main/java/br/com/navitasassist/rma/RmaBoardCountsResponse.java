package br.com.navitasassist.rma;

import java.util.Map;

public record RmaBoardCountsResponse(Map<RmaStatus, Long> statusCounts, long total, long highPriority,
    long active, long closed, long waitingPart) {}
