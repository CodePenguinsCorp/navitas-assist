import {
  FAILURE_CAUSE_LABELS,
  FAILURE_TYPE_LABELS,
  RMA_PRIORITY_LABELS,
  RMA_STATUS_LABELS,
  WARRANTY_STATUS_LABELS
} from '../mock-data';
import {
  FailureCause,
  FailureType,
  RmaBoardCardResponse,
  RmaItemResponse,
  RmaItemSummaryResponse,
  RmaListItemResponse,
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

export function failureTypeLabel(value: FailureType | null): string {
  return value ? FAILURE_TYPE_LABELS[value] : 'N\u00e3o classificado';
}

export function failureCauseLabel(value: FailureCause | null): string {
  return value ? FAILURE_CAUSE_LABELS[value] : 'N\u00e3o classificada';
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
    return `Série ${item.serialNumber} · Lote ${item.batchNumber}`;
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

export function compareRmasForBoard(left: Pick<RmaResponse, 'priority' | 'updatedAt'>, right: Pick<RmaResponse, 'priority' | 'updatedAt'>): number {
  const priorityDiff = priorityWeight(right.priority) - priorityWeight(left.priority);
  if (priorityDiff !== 0) {
    return priorityDiff;
  }

  return compareDateStrings(right.updatedAt, left.updatedAt);
}

export function compareRmasForQueue(left: Pick<RmaResponse, 'priority' | 'entryDate'>, right: Pick<RmaResponse, 'priority' | 'entryDate'>): number {
  const priorityDiff = priorityWeight(right.priority) - priorityWeight(left.priority);
  if (priorityDiff !== 0) {
    return priorityDiff;
  }

  return compareDateStrings(left.entryDate, right.entryDate);
}

/** Projeção explícita do detalhe devolvido por uma escrita no item resumido das coleções. */
export function toItemSummary(item: RmaItemResponse): RmaItemSummaryResponse {
  return {
    id: item.id, productName: item.productName, productSku: item.productSku,
    batchNumber: item.batchNumber, serialNumber: item.serialNumber, warrantyStatus: item.warrantyStatus
  };
}

/** Linha da lista a partir do detalhe, com os mesmos campos de `GET /api/rmas`. */
export function toListItem(rma: RmaResponse): RmaListItemResponse {
  return {
    id: rma.id, code: rma.code, clientName: rma.clientName, items: rma.items.map(toItemSummary),
    status: rma.status, priority: rma.priority, entryDate: rma.entryDate
  };
}

/** Card do Kanban a partir do detalhe, com os mesmos campos de `GET /api/rmas/board`. */
export function toBoardCard(rma: RmaResponse): RmaBoardCardResponse {
  return {
    id: rma.id, code: rma.code, clientName: rma.clientName, items: rma.items.map(toItemSummary),
    status: rma.status, priority: rma.priority, entryDate: rma.entryDate, dueDate: rma.dueDate,
    deadline: rma.deadline, updatedAt: rma.updatedAt, assigneeId: rma.assigneeId, assigneeName: rma.assigneeName,
    currentBlock: rma.currentBlock ? { reason: rma.currentBlock.reason, blockedAt: rma.currentBlock.blockedAt } : null,
    stagePeriods: rma.stagePeriods
  };
}

export function normalizeText(value: string): string | null {
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function priorityWeight(priority: RmaPriority): number {
  switch (priority) {
    case 'HIGH':
      return 3;
    case 'MEDIUM':
      return 2;
    default:
      return 1;
  }
}

function compareDateStrings(left: string | null, right: string | null): number {
  return parseDateValue(left) - parseDateValue(right);
}

function parseDateValue(value: string | null): number {
  if (!value) {
    return 0;
  }

  return new Date(value).getTime();
}
