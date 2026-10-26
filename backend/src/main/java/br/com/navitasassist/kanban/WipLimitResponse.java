package br.com.navitasassist.kanban;

import br.com.navitasassist.rma.RmaStatus;

public record WipLimitResponse(RmaStatus status, Integer maxItems, boolean blocking, long currentCount) {}
