import { ProtocolExecutionResponse } from '../models';
import { normalizeDecimal, protocolProgressLabel, protocolProgressPercent } from './protocol-ui';

const execution: ProtocolExecutionResponse = {
  id: 9, rmaId: 4, rmaCode: 'OS-4', templateId: 2, templateName: 'Bancada PWM', versionNumber: 3, status: 'IN_PROGRESS',
  blockedStatuses: [], startedBy: 'tech', startedAt: '2026-10-20T12:00:00Z', completedBy: null, completedAt: null,
  totalItems: 3, completedItems: 2, requiredItems: 2, pendingRequiredItems: 1, failedItems: 1, items: []
};

describe('protocol progress', () => {
  // Vermelho: mede 2/3 registros (67%), incluindo opcionais, em vez de 1/2 obrigatórios atendidos.
  it('measures satisfied required items rather than recorded optional items', () => {
    expect(protocolProgressLabel(execution)).toBe('1/2 obrigatórios atendidos');
    expect(protocolProgressPercent(execution)).toBe(50);
  });

  // Vermelho: opcionais registrados produzem percentual mesmo sem obrigatórios.
  it('does not invent completion when there are no required items', () => {
    const optional = { ...execution, requiredItems: 0, pendingRequiredItems: 0 };
    expect(protocolProgressLabel(optional)).toBe('Sem itens obrigatórios');
    expect(protocolProgressPercent(optional)).toBe(0);
  });

  // Vermelho: as duas entradas continuam mostrando 2/3 em vez de limitar o numerador de obrigatórios.
  it.each([{ pending: -1, label: '2/2 obrigatórios atendidos', percent: 100 }, { pending: 3, label: '0/2 obrigatórios atendidos', percent: 0 }])('clamps required progress for pending=$pending', ({ pending, label, percent }) => {
    const value = { ...execution, pendingRequiredItems: pending };
    expect(protocolProgressLabel(value)).toBe(label); expect(protocolProgressPercent(value)).toBe(percent);
  });

  it.each([['12,50', '12.50'], [' -0.000125 ', '-0.000125'], ['0', '0'], [' ', null]])('preserves decimal normalization for %s', (value, expected) => {
    expect(normalizeDecimal(value!)).toBe(expected);
  });
});
