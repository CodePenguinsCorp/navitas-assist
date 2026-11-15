import {
  DiagnosisResponse,
  RmaBlockResponse,
  RmaItemResponse,
  RmaResponse,
  RmaStatus,
  RmaStatusHistoryResponse,
  WarrantyOverrideStatus
} from '../models';
import { formatBusinessDateTime, formatDateOnly } from './date';
import { blockDuration } from './rma-block';
import { failureCauseLabel, failureTypeLabel, statusLabel, warrantyLabel } from './rma-ui';

/**
 * Information contract shared by the two RMA details (list tabs and Kanban modal):
 * same labels, order and formatting; each detail keeps its own markup.
 */
export interface RmaFact {
  label: string;
  value: string;
  empty: boolean;
}

export type RmaDetailSection =
  'failure' | 'products' | 'receipt' | 'diagnosis' | 'repair' | 'parts' | 'protocols' | 'blocks' | 'history';

export const RMA_DETAIL_SECTIONS: ReadonlyArray<{ id: RmaDetailSection; label: string }> = [
  { id: 'failure', label: 'Falha relatada' },
  { id: 'products', label: 'Produtos' },
  { id: 'receipt', label: 'Recebimento' },
  { id: 'diagnosis', label: 'Diagnóstico' },
  { id: 'repair', label: 'Reparo e testes' },
  { id: 'parts', label: 'Peças' },
  { id: 'protocols', label: 'Protocolos' },
  { id: 'blocks', label: 'Impedimentos' },
  { id: 'history', label: 'Histórico' }
];

export const NO_DIAGNOSIS_LABEL = 'Sem diagnóstico registrado.';

const NO_ASSIGNEE = 'Sem responsável';

export function sectionLabel(id: RmaDetailSection): string {
  return RMA_DETAIL_SECTIONS.find((section) => section.id === id)?.label ?? '';
}

export function warrantyTermLabel(months: number): string {
  return months === 1 ? '1 mês' : `${months} meses`;
}

export function warrantyExpiryLabel(item: Pick<RmaItemResponse, 'warrantyExpiresAt'>): RmaFact {
  return item.warrantyExpiresAt
    ? fact('Vencimento', formatDateOnly(item.warrantyExpiresAt))
    : missing('Vencimento', 'Sem data da compra');
}

export function purchaseFact(rma: Pick<RmaResponse, 'purchaseDate' | 'purchaseDateUnknown'>): RmaFact {
  if (rma.purchaseDateUnknown) return missing('Compra', 'Desconhecida');
  return rma.purchaseDate ? fact('Compra', formatDateOnly(rma.purchaseDate)) : missing('Compra', 'Não informada');
}

export function invoiceFact(rma: Pick<RmaResponse, 'invoiceNumber'>): RmaFact {
  return textFact('Nota fiscal', rma.invoiceNumber, 'Não informada');
}

export function rmaItemFacts(item: RmaItemResponse): RmaFact[] {
  return [
    fact('SKU', item.productSku),
    textFact('Série', item.serialNumber, 'Não informada'),
    textFact('Lote', item.batchNumber, 'Não informado'),
    ...(item.manufacturedAt ? [fact('Fabricação', formatDateOnly(item.manufacturedAt))] : []),
    fact('Prazo de garantia', warrantyTermLabel(item.warrantyMonths)),
    warrantyExpiryLabel(item)
  ];
}

export function receiptFacts(rma: RmaResponse): RmaFact[] {
  return filledFacts([
    ['Acessórios', rma.receivedAccessories],
    ['Condição física', rma.physicalCondition]
  ]);
}

export function diagnosisFacts(diagnosis: DiagnosisResponse): RmaFact[] {
  return [
    textFact('Falha encontrada', diagnosis.foundFailure, 'Não informada'),
    diagnosis.failureType ? fact('Tipo', failureTypeLabel(diagnosis.failureType)) : missing('Tipo', failureTypeLabel(null)),
    diagnosis.probableCause
      ? fact('Causa provável', failureCauseLabel(diagnosis.probableCause))
      : missing('Causa provável', failureCauseLabel(null)),
    diagnosis.diagnosedAt
      ? fact('Data do diagnóstico', formatDateOnly(diagnosis.diagnosedAt, 'Não informada'))
      : missing('Data do diagnóstico', 'Não informada'),
    textFact('Técnico', diagnosis.technicianName, 'Não informado'),
    ...filledFacts([['Notas', diagnosis.notes]])
  ];
}

/** Records typed when the RMA was opened for a service already performed, with the creation labels. */
export function repairFacts(rma: RmaResponse): RmaFact[] {
  return filledFacts([
    ['Reparo', rma.repairSummary],
    ['Peças trocadas', rma.replacedPartsSummary],
    ['Testes', rma.testSummary]
  ]);
}

export function blockedLabel(block: RmaBlockResponse, now: number): string {
  return `Impedida há ${blockDuration(block, now)}`;
}


export type RmaHistoryEntry =
  | { kind: 'status'; at: string; by: string; label: string; status: RmaStatus; previous: RmaStatus | null; initial: boolean; note: string | null; event: RmaStatusHistoryResponse }
  | { kind: 'repair'; at: string; by: string; summary: string; voided: boolean; voidReason: string | null }
  | { kind: 'assignee'; at: string; by: string; from: string; to: string }
  | { kind: 'dueDate'; at: string; by: string; from: string | null; to: string | null }
  | { kind: 'warranty'; at: string; by: string; itemId: number; itemLabel: string; from: WarrantyOverrideStatus | null; to: WarrantyOverrideStatus | null; reason: string | null };

export function dueDateHistoryLabel(entry: { from: string | null; to: string | null }): string {
  if (!entry.from && entry.to) return `Data limite definida: ${formatDateOnly(entry.to)}`;
  if (entry.from && !entry.to) return `Data limite removida (era ${formatDateOnly(entry.from)})`;
  return `Data limite ${formatDateOnly(entry.from)} → ${formatDateOnly(entry.to)}`;
}

/** Title line of a history entry, shared by both details. */
export function historyEntryTitle(entry: RmaHistoryEntry): string {
  switch (entry.kind) {
    case 'status': return entry.label;
    case 'repair': return entry.summary;
    case 'assignee': return `${entry.from} → ${entry.to}`;
    case 'dueDate': return dueDateHistoryLabel(entry);
    case 'warranty': return `Garantia de ${entry.itemLabel}: ${entry.from ? warrantyLabel(entry.from) : 'Automático'} → ${entry.to ? warrantyLabel(entry.to) : 'Automático'}`;
  }
}

/** The server writes hours with a dot ("0.017 h"); the screen uses the Brazilian decimal comma. */
function decimalComma(summary: string): string {
  return summary.replace(/(\d)\.(\d+)( h)$/, '$1,$2$3');
}

/** A void summary ends with "Motivo: <reason>"; without it the whole summary is the reason. */
function voidReasonOf(summary: string): string {
  const index = summary.indexOf('Motivo: ');
  return index >= 0 ? summary.slice(index + 'Motivo: '.length) : summary;
}

export interface StatusTransition { previous: RmaStatus | null; initial: boolean }

/**
 * Previous status of each status record: the status of the record right before it in chronological order. Ties on the instant
 * break by id and then by input order. The first record is the creation (initial, no previous). The input is not changed.
 */
export function statusTransitions(records: readonly RmaStatusHistoryResponse[]): Map<RmaStatusHistoryResponse, StatusTransition> {
  const ordered = records
    .map((record, index) => ({ record, index }))
    .sort((a, b) => Date.parse(a.record.changedAt) - Date.parse(b.record.changedAt)
      || (a.record.id ?? Infinity) - (b.record.id ?? Infinity) || a.index - b.index);
  const result = new Map<RmaStatusHistoryResponse, StatusTransition>();
  ordered.forEach(({ record }, position) => {
    const previous = position > 0 ? ordered[position - 1].record.status : null;
    result.set(record, { previous, initial: position === 0 });
  });
  return result;
}

function statusEntryLabel(status: RmaStatus, transition: StatusTransition): string {
  if (transition.initial) return `Status inicial: ${statusLabel(status)}`;
  if (transition.previous && transition.previous !== status) return `Status alterado de ${statusLabel(transition.previous)} para ${statusLabel(status)}`;
  return `Status registrado: ${statusLabel(status)}`;
}

/**
 * Repair events, status records, assignee, due date and warranty changes, newest first. A status record may be a priority change
 * or a note with the same status; then the previous status equals the current one and no transition is shown.
 * Ties keep input order (repair, status, assignee, due date and warranty); the input arrays are not changed.
 */
export function rmaHistory(rma: Pick<RmaResponse, 'statusHistory' | 'assignmentHistory'> & Partial<Pick<RmaResponse, 'dueDateHistory' | 'warrantyHistory' | 'items' | 'repairHistory'>>): RmaHistoryEntry[] {
  const repairHistory = rma.repairHistory ?? [];
  const key = (event: { entityType: string; entityId: number }) => `${event.entityType}-${event.entityId}`;
  const voids = new Map(repairHistory.filter(event => event.action === 'VOID').map(event => [key(event), voidReasonOf(event.summary)]));
  const created = new Set(repairHistory.filter(event => event.action === 'CREATE').map(key));
  const transitions = statusTransitions(rma.statusHistory);
  const entries: RmaHistoryEntry[] = [
    ...repairHistory.filter(event => event.action !== 'VOID' || !created.has(key(event))).map((event): RmaHistoryEntry => ({
      kind: 'repair', at: event.changedAt, by: event.changedBy, summary: decimalComma(event.summary),
      voided: event.action !== 'VOID' && voids.has(key(event)), voidReason: event.action !== 'VOID' ? voids.get(key(event)) ?? null : null
    })),
    ...rma.statusHistory.map((record): RmaHistoryEntry => {
      const transition = transitions.get(record)!;
      return {
        kind: 'status',
        at: record.changedAt,
        by: record.changedBy,
        label: statusEntryLabel(record.status, transition),
        status: record.status,
        previous: transition.previous,
        initial: transition.initial,
        event: record,
        note: record.note
      };
    }),
    ...rma.assignmentHistory.map((record): RmaHistoryEntry => ({
      kind: 'assignee',
      at: record.changedAt,
      by: record.changedBy,
      from: record.previousAssigneeName?.trim() || NO_ASSIGNEE,
      to: record.newAssigneeName?.trim() || NO_ASSIGNEE
    })),
    ...(rma.dueDateHistory ?? []).map((record): RmaHistoryEntry => ({
      kind: 'dueDate',
      at: record.changedAt,
      by: record.changedBy,
      from: record.previousDueDate,
      to: record.newDueDate
    })),
    ...(rma.warrantyHistory ?? []).map((record): RmaHistoryEntry => {
      const item = rma.items?.find((item) => item.id === record.itemId);
      return { kind: 'warranty', at: record.changedAt, by: record.changedBy, itemId: record.itemId,
        itemLabel: item ? `${item.productName} (${item.productSku})` : `Item #${record.itemId}`,
        from: record.previousOverride, to: record.newOverride, reason: record.reason };
    })
  ];
  return entries.sort((left, right) => Date.parse(right.at) - Date.parse(left.at));
}

function fact(label: string, value: string): RmaFact {
  return { label, value, empty: false };
}

function missing(label: string, value: string): RmaFact {
  return { label, value, empty: true };
}

function textFact(label: string, value: string | null, fallback: string): RmaFact {
  return value?.trim() ? fact(label, value) : missing(label, fallback);
}

function filledFacts(pairs: ReadonlyArray<[string, string | null]>): RmaFact[] {
  return pairs.filter(([, value]) => Boolean(value?.trim())).map(([label, value]) => fact(label, value!));
}
