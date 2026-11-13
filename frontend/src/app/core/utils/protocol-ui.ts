import { ProtocolExecutionResponse, ProtocolExecutionStatus, ProtocolItemOutcome, ProtocolItemType } from '../models';

export const PROTOCOL_ITEM_TYPE_LABELS: Record<ProtocolItemType, string> = {
  CHECK: 'Verificação',
  MEASUREMENT: 'Medição',
  TEXT: 'Anotação'
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

export function protocolProgressLabel(execution: Pick<ProtocolExecutionResponse, 'requiredItems' | 'pendingRequiredItems'>): string {
  const satisfied = Math.max(0, Math.min(execution.requiredItems, execution.requiredItems - execution.pendingRequiredItems));
  return execution.requiredItems === 0 ? 'Sem itens obrigatórios' : `${satisfied}/${execution.requiredItems} obrigatórios atendidos`;
}

export function protocolProgressPercent(execution: Pick<ProtocolExecutionResponse, 'requiredItems' | 'pendingRequiredItems'>): number {
  const satisfied = Math.max(0, Math.min(execution.requiredItems, execution.requiredItems - execution.pendingRequiredItems));
  return execution.requiredItems === 0 ? 0 : Math.round((satisfied / execution.requiredItems) * 100);
}

export function normalizeDecimal(value: string): string | null {
  const normalized = value.trim().replace(/\s/g, '').replace(',', '.');
  return normalized ? normalized : null;
}
