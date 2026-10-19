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
  RmaPriority,
  RmaItemResponse,
  RmaResponse,
  RmaStatus,
  RmaStatusHistoryResponse,
  WarrantyStatus
} from '../models';
import { formatDateOnly } from './date';

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

export function formatDateTime(value: string | null): string {
  if (!value) {
    return 'N\u00e3o informado';
  }

  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short'
  }).format(new Date(value));
}

export function trackableLabel(rma: Pick<RmaResponse, 'items' | 'serialNumber' | 'batchNumber'>): string {
  const firstItem = rma.items[0] ?? rma;
  const label = rmaItemTrackableLabel(firstItem);
  const additionalItems = rma.items.length - 1;
  return additionalItems > 0 ? `${label} + ${additionalItems} item(ns)` : label;
}

export function rmaItemTrackableLabel(item: Pick<RmaItemResponse, 'serialNumber' | 'batchNumber'>): string {
  if (item.serialNumber && item.batchNumber) {
    return `Serial ${item.serialNumber} | Lote ${item.batchNumber}`;
  }

  if (item.serialNumber) {
    return `Serial ${item.serialNumber}`;
  }

  if (item.batchNumber) {
    return `Lote ${item.batchNumber}`;
  }

  return 'Item sem identifica\u00e7\u00e3o';
}

export function productSummary(rma: Pick<RmaResponse, 'items' | 'productName'>): string {
  const firstProductName = rma.items[0]?.productName ?? rma.productName;
  const additionalItems = rma.items.length - 1;
  return additionalItems > 0 ? `${firstProductName} + ${additionalItems} item(ns)` : firstProductName;
}

export function ownerLabel(
  rma: Pick<RmaResponse, 'diagnosis' | 'statusHistory' | 'receivedBy'>
): string {
  if (rma.diagnosis?.technicianName?.trim()) {
    return rma.diagnosis.technicianName.trim();
  }

  const latestHistory = latestStatusUpdate(rma.statusHistory);
  if (latestHistory?.changedBy?.trim()) {
    return latestHistory.changedBy.trim();
  }

  return rma.receivedBy;
}

export function latestStatusUpdate(
  history: RmaStatusHistoryResponse[]
): RmaStatusHistoryResponse | null {
  if (history.length === 0) {
    return null;
  }

  return [...history].sort((left, right) => compareDateStrings(right.changedAt, left.changedAt))[0] ?? null;
}

export function compareRmasForBoard(left: RmaResponse, right: RmaResponse): number {
  const priorityDiff = priorityWeight(right.priority) - priorityWeight(left.priority);
  if (priorityDiff !== 0) {
    return priorityDiff;
  }

  return compareDateStrings(right.updatedAt, left.updatedAt);
}

export function compareRmasForQueue(left: RmaResponse, right: RmaResponse): number {
  const priorityDiff = priorityWeight(right.priority) - priorityWeight(left.priority);
  if (priorityDiff !== 0) {
    return priorityDiff;
  }

  return compareDateStrings(left.entryDate, right.entryDate);
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
