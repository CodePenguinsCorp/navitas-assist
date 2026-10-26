import { wipLabel } from './wip-ui';

describe('WIP column labels', () => {
  it('communicates unlimited, normal, near, full and exceeded without relying on color', () => {
    expect(wipLabel({ status: 'TRIAGE', maxItems: null, blocking: false, currentCount: 4 })).toContain('Sem limite');
    expect(wipLabel({ status: 'TRIAGE', maxItems: 10, blocking: true, currentCount: 7 })).toContain('Normal');
    expect(wipLabel({ status: 'TRIAGE', maxItems: 10, blocking: true, currentCount: 8 })).toContain('Próximo');
    expect(wipLabel({ status: 'TRIAGE', maxItems: 10, blocking: true, currentCount: 10 })).toContain('Atingido');
    expect(wipLabel({ status: 'TRIAGE', maxItems: 10, blocking: true, currentCount: 11 })).toContain('Excedido');
  });
});
