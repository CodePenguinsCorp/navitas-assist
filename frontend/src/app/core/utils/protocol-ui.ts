import { ProtocolExecutionResponse, ProtocolExecutionStatus, ProtocolItemOutcome, ProtocolItemType } from '../models';

export const PROTOCOL_ITEM_TYPE_LABELS: Record<ProtocolItemType, string> = {
  CHECK: 'Verificação',
  MEASUREMENT: 'Medição',
  TEXT: 'Texto'
};

export const PROTOCOL_OUTCOME_LABELS: Record<ProtocolItemOutcome, string> = {
  PASSED: 'Aprovado',
  FAILED: 'Reprovado',
  NOT_APPLICABLE: 'Não se aplica'
};

export const PROTOCOL_EXECUTION_STATUS_LABELS: Record<ProtocolExecutionStatus, string> = {
  IN_PROGRESS: 'Em andamento',
  COMPLETED: 'Concluído',
  FAILED: 'Concluído com reprovação'
};

export function protocolOutcomeClass(outcome: ProtocolItemOutcome | null): string {
  switch (outcome) {
    case 'PASSED':
      return 'warranty-ok';
    case 'FAILED':
      return 'priority-high';
    case 'NOT_APPLICABLE':
      return 'warranty-off';
    default:
      return 'warranty-alert';
  }
}

export function protocolProgressLabel(execution: Pick<ProtocolExecutionResponse, 'completedItems' | 'totalItems' | 'pendingRequiredItems'>): string {
  const pending = execution.pendingRequiredItems > 0 ? ` · ${execution.pendingRequiredItems} obrigatório(s) pendente(s)` : '';
  return `${execution.completedItems}/${execution.totalItems} itens${pending}`;
}

export function protocolProgressPercent(execution: Pick<ProtocolExecutionResponse, 'completedItems' | 'totalItems'>): number {
  return execution.totalItems === 0 ? 0 : Math.round((execution.completedItems / execution.totalItems) * 100);
}

export function normalizeDecimal(value: string): string | null {
  const normalized = value.trim().replace(/\s/g, '').replace(',', '.');
  return normalized ? normalized : null;
}
