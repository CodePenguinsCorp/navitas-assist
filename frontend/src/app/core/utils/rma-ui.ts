import {
  RMA_PRIORITY_LABELS,
  RMA_STATUS_LABELS,
  WARRANTY_STATUS_LABELS
} from '../mock-data';
import {
  RmaBoardCardResponse,
  RmaItemResponse,
  RmaItemSummaryResponse,
  RmaPriority,
  RmaResponse,
  RmaStatus,
  WarrantyStatus
} from '../models';
import { formatDateOnly } from './date';

export { formatBusinessDateTime as formatDateTime } from './date';

export function statusLabel(status: RmaStatus): string {
  return RMA_STATUS_LABELS[status];
}

export function priorityLabel(priority: RmaPriority): string {
  return RMA_PRIORITY_LABELS[priority];
}

export function priorityChipClass(priority: RmaPriority): string {
  switch (priority) {
    case 'HIGH':
      return 'priority-high';
    case 'MEDIUM':
      return 'priority-medium';
    default:
      return 'priority-low';
  }
}

export function warrantyClass(warrantyStatus: WarrantyStatus): string {
  switch (warrantyStatus) {
    case WarrantyStatus.IN_WARRANTY:
      return 'warranty-ok';
    case WarrantyStatus.OUT_OF_WARRANTY:
      return 'warranty-off';
    default:
      return 'warranty-alert';
  }
}

export function warrantyLabel(warrantyStatus: WarrantyStatus): string {
  return WARRANTY_STATUS_LABELS[warrantyStatus];
}

export function formatDate(value: string | null): string {
  return formatDateOnly(value);
}

export function trackableLabel(rma: { items: ReadonlyArray<Pick<RmaItemSummaryResponse, 'serialNumber' | 'batchNumber'>> }): string {
  const firstItem = rma.items[0];
  const label = firstItem ? rmaItemTrackableLabel(firstItem) : 'Item sem identificação';
  const additionalItems = rma.items.length - 1;
  return additionalItems > 0 ? `${label} + ${additionalItems} item(ns)` : label;
}

export function rmaItemTrackableLabel(item: Pick<RmaItemResponse, 'serialNumber' | 'batchNumber'>): string {
  if (item.serialNumber && item.batchNumber) {
    return `Série ${item.serialNumber}, Lote ${item.batchNumber}`;
  }

  if (item.serialNumber) {
    return `Série ${item.serialNumber}`;
  }

  if (item.batchNumber) {
    return `Lote ${item.batchNumber}`;
  }

  return 'Item sem identifica\u00e7\u00e3o';
}

export function productSummary(rma: { items: ReadonlyArray<Pick<RmaItemSummaryResponse, 'productName'>> }): string {
  const firstProductName = rma.items[0]?.productName ?? '';
  const additionalItems = rma.items.length - 1;
  return additionalItems > 0 ? `${firstProductName} + ${additionalItems} item(ns)` : firstProductName;
}

export function itemCountLabel(count: number): string {
  return count === 1 ? '1 item' : `${count} itens`;
}

export function ownerLabel(
  rma: Pick<RmaResponse, 'assigneeName'>
): string {
  return rma.assigneeName?.trim() || 'Sem responsável';
}

export function initialsOf(name: string | null): string {
  const parts = (name ?? '').replace(/\[[^\]]*\]/g, '').trim().split(/\s+/).filter(Boolean);
  return parts.length === 0 ? '?' : ((parts[0][0] ?? '') + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase();
}

/** Projeção explícita do detalhe devolvido por uma escrita no item resumido das coleções. */
export function toItemSummary(item: RmaItemResponse): RmaItemSummaryResponse {
  return {
    id: item.id, productName: item.productName, productSku: item.productSku,
    batchNumber: item.batchNumber, serialNumber: item.serialNumber, warrantyStatus: item.warrantyStatus
  };
}

/** "Produto A" ou "Produto A + 2 item(ns)" a partir do resumo do card, sem a lista de itens. */
export function boardProductSummary(card: Pick<RmaBoardCardResponse, 'productName' | 'additionalItems'>): string {
  const additionalItems = card.additionalItems ?? 0;
  return additionalItems > 0 ? `${card.productName} + ${additionalItems} item(ns)` : card.productName;
}

const WARRANTY_CODES: Record<WarrantyStatus, string> = {
  [WarrantyStatus.PENDING]: 'P',
  [WarrantyStatus.IN_WARRANTY]: 'I',
  [WarrantyStatus.OUT_OF_WARRANTY]: 'O'
};

/** Letra de garantia do card do Kanban (`warranty`), a mesma do servidor. */
export function warrantyCode(status: WarrantyStatus): string {
  return WARRANTY_CODES[status];
}

/** Texto de compatibilidade do cartão do Kanban: SKU, lote e série de todos os itens e o nome dos itens além do primeiro (como no servidor). */
function boardSearchText(items: ReadonlyArray<RmaItemSummaryResponse>): string {
  return items
    .flatMap((item, index) => (index === 0 ? [] : [item.productName]).concat(item.productSku, item.batchNumber ?? '', item.serialNumber ?? ''))
    .filter((value) => value.trim() !== '')
    .join(' ');
}

/** Card do Kanban a partir do detalhe, com os mesmos campos de `GET /api/rmas/board`. */
export function toBoardCard(rma: RmaResponse): RmaBoardCardResponse {
  const items = rma.items.map(toItemSummary);
  const periods = rma.stagePeriods;
  const card: RmaBoardCardResponse = {
    id: rma.id, code: rma.code, clientName: rma.clientName,
    productName: items[0]?.productName ?? '', searchText: boardSearchText(items),
    warranty: [...new Set(items.map((item) => warrantyCode(item.warrantyStatus)))].join(''),
    status: rma.status, priority: rma.priority, entryDate: rma.entryDate, dueDate: rma.dueDate,
    dueSoonFrom: rma.deadline.dueSoonFrom, updatedAt: rma.updatedAt, assigneeId: rma.assigneeId, assigneeName: rma.assigneeName,
    currentStageEnteredAt: periods[periods.length - 1]?.enteredAt ?? rma.updatedAt
  };
  if (items.length > 1) card.additionalItems = items.length - 1;
  if (rma.currentBlock) card.blockedAt = rma.currentBlock.blockedAt;
  return card;
}

export function normalizeText(value: string): string | null {
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}
