import { CLOSED_RMA_STATUSES, RMA_PRIORITY_LABELS } from '../mock-data';
import { KanbanGroupBy, RmaResponse } from '../models';

export interface KanbanLane {
  key: string;
  label: string;
  empty: boolean;
  items: RmaResponse[];
  activeCount: number;
  highPriorityCount: number;
}

export function groupKanbanLanes(rmas: readonly RmaResponse[], groupBy: KanbanGroupBy, descending: boolean, emptyFirst: boolean): KanbanLane[] {
  const lanes = new Map<string, KanbanLane>();
  if (groupBy === 'NONE') return [makeLane('all', 'Todos os RMAs', false, [...rmas])];
  for (const rma of rmas) {
    const group = laneIdentity(rma, groupBy);
    let lane = lanes.get(group.key);
    if (!lane) {
      lane = makeLane(group.key, group.label, group.empty, []);
      lanes.set(group.key, lane);
    }
    lane.items.push(rma);
    if (!CLOSED_RMA_STATUSES.includes(rma.status)) lane.activeCount++;
    if (rma.priority === 'HIGH') lane.highPriorityCount++;
  }
  const priorityKeys = ['priority:HIGH', 'priority:MEDIUM', 'priority:LOW'];
  return [...lanes.values()].sort((left, right) => {
    if (left.empty !== right.empty) return left.empty === emptyFirst ? -1 : 1;
    const order = groupBy === 'PRIORITY'
      ? priorityKeys.indexOf(left.key) - priorityKeys.indexOf(right.key)
      : left.label.localeCompare(right.label, 'pt-BR', { sensitivity: 'base', numeric: true }) || left.key.localeCompare(right.key, 'pt-BR', { numeric: true });
    return descending ? -order : order;
  });
}

function makeLane(key: string, label: string, empty: boolean, items: RmaResponse[]): KanbanLane {
  return { key, label, empty, items, activeCount: items.filter(rma => !CLOSED_RMA_STATUSES.includes(rma.status)).length,
    highPriorityCount: items.filter(rma => rma.priority === 'HIGH').length };
}

function laneIdentity(rma: RmaResponse, groupBy: KanbanGroupBy): Pick<KanbanLane, 'key' | 'label' | 'empty'> {
  switch (groupBy) {
    case 'ASSIGNEE':
      return { key: rma.assigneeId == null ? 'assignee:empty' : 'assignee:' + rma.assigneeId,
        label: rma.assigneeId == null ? 'Sem responsável' : rma.assigneeName || 'Técnico #' + rma.assigneeId, empty: rma.assigneeId == null };
    case 'PRIORITY':
      return { key: 'priority:' + rma.priority, label: RMA_PRIORITY_LABELS[rma.priority], empty: false };
    case 'CLIENT':
      return { key: rma.clientId == null ? 'client:empty' : 'client:' + rma.clientId,
        label: rma.clientName || 'Sem cliente', empty: rma.clientId == null };
    case 'PRODUCT': {
      const products = [...new Map(rma.items.map(item => [item.productId, item.productName])).entries()].sort((a, b) => a[0] - b[0]);
      return { key: products.length ? 'products:' + products.map(([id]) => id).join(',') : 'products:empty',
        label: products.length ? products.map(([, name]) => name).join(' + ') : 'Sem produto', empty: products.length === 0 };
    }
    default: throw new Error('Agrupamento do Kanban inválido.');
  }
}
