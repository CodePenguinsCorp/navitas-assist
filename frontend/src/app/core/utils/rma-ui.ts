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
  RmaResponse,
  RmaStatus,
  RmaStatusHistoryResponse,
  WarrantyStatus
} from '../models';

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

export function warrantyClass(warrantyStatus: WarrantyStatus, warrantyOverridden = false): string {
  if (warrantyOverridden) {
    return 'warranty-alert';
  }

  switch (warrantyStatus) {
    case 'IN_WARRANTY':
      return 'warranty-ok';
    case 'OUT_OF_WARRANTY':
      return 'warranty-off';
    default:
      return 'warranty-alert';
  }
}

export function warrantyTextClass(label: string): string {
  switch (label) {
    case 'Em garantia':
      return 'warranty-ok';
    case 'Override manual':
    case 'Pendente':
      return 'warranty-alert';
    default:
      return 'warranty-off';
  }
}

export function warrantyLabel(warrantyStatus: WarrantyStatus, warrantyOverridden = false): string {
  if (warrantyOverridden) {
    return 'Override manual';
  }

  return WARRANTY_STATUS_LABELS[warrantyStatus];
}

export function failureTypeLabel(value: FailureType | null): string {
  return value ? FAILURE_TYPE_LABELS[value] : 'N\u00e3o classificado';
}

export function failureCauseLabel(value: FailureCause | null): string {
  return value ? FAILURE_CAUSE_LABELS[value] : 'N\u00e3o classificada';
}

export function formatDate(value: string | null): string {
  if (!value) {
    return 'N\u00e3o informado';
  }

  return new Intl.DateTimeFormat('pt-BR').format(new Date(value));
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

export function trackableLabel(rma: Pick<RmaResponse, 'serialNumber' | 'batchNumber'>): string {
  if (rma.serialNumber) {
    return `Serial ${rma.serialNumber}`;
  }

  if (rma.batchNumber) {
    return `Lote ${rma.batchNumber}`;
  }

  return 'Item sem identifica\u00e7\u00e3o';
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

export function todayInputValue(): string {
  return new Date().toISOString().slice(0, 10);
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
