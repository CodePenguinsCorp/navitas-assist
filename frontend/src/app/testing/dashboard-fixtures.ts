import { CLOSED_RMA_STATUSES } from '../core/mock-data';
import { RmaDashboardResponse, RmaResponse, RmaStatus, WarrantyStatus } from '../core/models';
import { businessToday, deadlineStatus } from '../core/utils/rma-deadline';

/** Status do registro anterior da mesma OS (nulo no primeiro), como o servidor calcula nos eventos do dashboard. */
function previousStatusOf(history: RmaResponse['statusHistory'], event: RmaResponse['statusHistory'][number]): RmaStatus | null {
  const ordered = [...history].sort((left, right) => Date.parse(left.changedAt) - Date.parse(right.changedAt) || (left.id ?? 0) - (right.id ?? 0));
  const index = ordered.indexOf(event);
  return index > 0 ? ordered[index - 1].status : null;
}

/** Ordem da fila do servidor: prioridade (alta primeiro) e, em empate, a entrada mais antiga. */
const PRIORITY_WEIGHT: Record<RmaResponse['priority'], number> = { HIGH: 3, MEDIUM: 2, LOW: 1 };
function compareForQueue(left: RmaResponse, right: RmaResponse): number {
  return PRIORITY_WEIGHT[right.priority] - PRIORITY_WEIGHT[left.priority] || left.entryDate.localeCompare(right.entryDate);
}

/**
 * Monta a resposta de `GET /api/rmas/dashboard` a partir de OS completas, com os mesmos universos do servidor
 * (garantia em todos os itens, prazos e fila só nas abertas), para os specs descreverem cenários por OS.
 */
export function dashboardFromBoard(board: readonly RmaResponse[], today = businessToday(Date.now())): RmaDashboardResponse {
  const statusCounts: Partial<Record<RmaStatus, number>> = {};
  for (const rma of board) statusCounts[rma.status] = (statusCounts[rma.status] ?? 0) + 1;
  const open = board.filter((rma) => !CLOSED_RMA_STATUSES.includes(rma.status));
  const items = board.flatMap((rma) => rma.items);
  const deadlines = open.map((rma) => deadlineStatus(rma, today));
  const time = (value: string) => new Date(value).getTime();
  return {
    statusCounts,
    initialQueueHighPriority: board.filter((rma) => (rma.status === 'RECEIVED' || rma.status === 'TRIAGE') && rma.priority === 'HIGH').length,
    overdue: deadlines.filter((status) => status === 'OVERDUE').length,
    dueSoon: deadlines.filter((status) => status === 'DUE_SOON').length,
    items: items.length,
    itemsInWarranty: items.filter((item) => item.warrantyStatus === WarrantyStatus.IN_WARRANTY).length,
    itemsPendingWarranty: items.filter((item) => item.warrantyStatus === WarrantyStatus.PENDING).length,
    queue: [...open].sort(compareForQueue).slice(0, 5).map((rma) => ({
      id: rma.id, code: rma.code, clientName: rma.clientName, entryDate: rma.entryDate, status: rma.status, priority: rma.priority
    })),
    recent: [...board].sort((left, right) => time(right.updatedAt) - time(left.updatedAt)).slice(0, 4).map((rma) => ({
      id: rma.id, code: rma.code, clientName: rma.clientName, assigneeName: rma.assigneeName, updatedAt: rma.updatedAt
    })),
    statusEvents: board.flatMap((rma) => rma.statusHistory.map((event) => ({ rma, event })))
      .sort((left, right) => time(right.event.changedAt) - time(left.event.changedAt))
      .slice(0, 4)
      .map(({ rma, event }) => ({
        rmaId: rma.id, code: rma.code, status: event.status, previousStatus: previousStatusOf(rma.statusHistory, event), changedBy: event.changedBy, note: event.note, changedAt: event.changedAt
      }))
  };
}
