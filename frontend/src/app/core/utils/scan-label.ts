import { RmaResponse } from '../models';
import { formatDateOnly } from './date';
import { priorityLabel, rmaItemTrackableLabel } from './rma-ui';

export type LabelFieldKey = 'client' | 'trackable' | 'entryDate' | 'priority' | 'invoice';

export interface LabelLine {
  label: string;
  value: string;
}

export interface LabelModel {
  rmaCode: string;
  product: string;
  lines: LabelLine[];
}

export const LABEL_FIELD_OPTIONS: ReadonlyArray<{ key: LabelFieldKey; label: string }> = [
  { key: 'client', label: 'Cliente' },
  { key: 'trackable', label: 'Série / lote' },
  { key: 'entryDate', label: 'Entrada' },
  { key: 'priority', label: 'Prioridade' },
  { key: 'invoice', label: 'Nota fiscal' }
];

export const DEFAULT_LABEL_FIELDS: LabelFieldKey[] = ['trackable', 'entryDate'];

/**
 * Pure label model: the printed label and its on-screen preview both render this, so the template is testable before
 * printing. RMA code and product are always present; the other lines follow the selected fields, in a fixed order.
 */
export function buildLabelModel(rma: RmaResponse, fields: readonly LabelFieldKey[]): LabelModel {
  const firstItem = rma.items[0];
  const product = firstItem ? `${firstItem.productSku} | ${firstItem.productName}` : `${rma.productSku} | ${rma.productName}`;
  const values: Record<LabelFieldKey, string | null> = {
    client: rma.clientName,
    trackable: firstItem ? rmaItemTrackableLabel(firstItem) : null,
    entryDate: formatDateOnly(rma.entryDate, ''),
    priority: priorityLabel(rma.priority),
    invoice: rma.invoiceNumber
  };

  return {
    rmaCode: rma.code,
    product: rma.items.length > 1 ? `${product} (+${rma.items.length - 1})` : product,
    lines: LABEL_FIELD_OPTIONS
      .filter((option) => fields.includes(option.key) && Boolean(values[option.key]))
      .map((option) => ({ label: option.label, value: values[option.key] as string }))
  };
}

/**
 * Keyboard-emulating scanners type the whole code within a few milliseconds; people type far slower. Used only to label
 * the source in the audit trail.
 */
export function looksLikeScanner(keyTimestamps: readonly number[]): boolean {
  if (keyTimestamps.length < 8) {
    return false;
  }

  const elapsed = keyTimestamps[keyTimestamps.length - 1] - keyTimestamps[0];
  return elapsed / (keyTimestamps.length - 1) < 35;
}
