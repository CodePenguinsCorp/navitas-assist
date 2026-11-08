import {
  DiagnosisResponse,
  RmaBlockResponse,
  RmaItemResponse,
  RmaResponse,
  RmaStatus
} from '../models';
import { formatDateOnly } from './date';
import { blockDuration } from './rma-block';
import { failureCauseLabel, failureTypeLabel, statusLabel } from './rma-ui';

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
  return `Bloqueado há ${blockDuration(block, now)}`;
}

export type RmaHistoryEntry =
  | { kind: 'status'; at: string; by: string; label: string; status: RmaStatus; note: string | null }
  | { kind: 'assignee'; at: string; by: string; from: string; to: string };

/**
 * Status records and assignee changes, newest first. A status record may be a priority change
 * or a note with the same status, so no transition or origin is inferred from neighbours.
 * Ties keep input order (status records, then assignee changes); the input arrays are not changed.
 */
export function rmaHistory(rma: Pick<RmaResponse, 'statusHistory' | 'assignmentHistory'>): RmaHistoryEntry[] {
  const entries: RmaHistoryEntry[] = [
    ...rma.statusHistory.map((record): RmaHistoryEntry => ({
      kind: 'status',
      at: record.changedAt,
      by: record.changedBy,
      label: `Status registrado: ${statusLabel(record.status)}`,
      status: record.status,
      note: record.note
    })),
    ...rma.assignmentHistory.map((record): RmaHistoryEntry => ({
      kind: 'assignee',
      at: record.changedAt,
      by: record.changedBy,
      from: record.previousAssigneeName?.trim() || NO_ASSIGNEE,
      to: record.newAssigneeName?.trim() || NO_ASSIGNEE
    }))
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
