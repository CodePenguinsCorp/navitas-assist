package br.com.navitasassist.rma;

import java.util.List;
import java.util.Map;

/**
 * Indicadores do dashboard calculados no servidor ({@code GET /api/rmas/dashboard}): contagens por status, fila inicial
 * com prioridade alta, prazos das OS abertas, garantia de todos os itens e as listas curtas exibidas, sem históricos.
 */
public record RmaDashboardResponse(
    Map<RmaStatus, Long> statusCounts,
    long initialQueueHighPriority,
    long overdue,
    long dueSoon,
    long items,
    long itemsInWarranty,
    long itemsPendingWarranty,
    List<RmaDashboardQueueItem> queue,
    List<RmaDashboardRecentItem> recent,
    List<RmaDashboardStatusEvent> statusEvents
) {}
