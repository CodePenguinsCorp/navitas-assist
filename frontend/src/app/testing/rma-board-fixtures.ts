import { of } from 'rxjs';
import { CLOSED_RMA_STATUSES, RMA_STATUS_FLOW } from '../core/mock-data';
import { RmaBoardFilters, RmaBoardCountsResponse, RmaResponse } from '../core/models';
import { toBoardCard } from '../core/utils/rma-ui';

/** Respostas de transporte para specs de modais, permissões e visualizações, sem predicados locais. */
export function boardTestApi(records: () => RmaResponse[]) {
  const updates = new Map<number, RmaResponse>();
  const rows = () => records().map(row => updates.get(row.id) ?? row);
  return {
    remember(row: RmaResponse) { updates.set(row.id, row); return row; },
    updateBoardPosition(id: number, payload: { status: RmaResponse['status'] }) {
      const row = { ...rows().find(item => item.id === id)!, status: payload.status };
      updates.set(id, row);
      return of(toBoardCard(row));
    },
    listBoardColumn(filters: RmaBoardFilters, page = 0) {
      const cards = rows().filter(row => row.status === filters.status).map(toBoardCard);
      return of({ cards: cards.slice(page * 20, (page + 1) * 20), total: cards.length, hasMore: cards.length > (page + 1) * 20, page, size: 20 });
    },
    getBoardCounts() {
      const all = rows();
      const closed = all.filter(row => CLOSED_RMA_STATUSES.includes(row.status)).length;
      return of({ statusCounts: Object.fromEntries(RMA_STATUS_FLOW.map(status => [status, all.filter(row => row.status === status).length])),
        total: all.length, highPriority: all.filter(row => row.priority === 'HIGH').length, active: all.length - closed,
        closed, waitingPart: all.filter(row => row.status === 'WAITING_PART').length } as RmaBoardCountsResponse);
    },
  };
}
