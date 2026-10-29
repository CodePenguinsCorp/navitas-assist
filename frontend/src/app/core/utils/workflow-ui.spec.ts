import { allowedTransitions, commonTransitions, workflowColumns, isDone } from './workflow-ui';
import { RmaResponse, WorkflowStatusDefinition } from '../models';

describe('Published workflow operation', () => {
  const a = {
    status: 'NEW',
    statusCategory: 'PENDING',
    transitionOptions: [
      { status: 'CUSTOM', label: 'Customizado', allowed: true, reason: null },
      { status: 'DONE', label: 'Final', allowed: false, reason: 'Checklist' },
    ],
  } as unknown as RmaResponse;
  it('never offers blocked or absent evidence as a destination', () => {
    expect(allowedTransitions(a).map((x) => x.value)).toEqual(['CUSTOM']);
    expect(allowedTransitions({} as unknown as RmaResponse)).toEqual([]);
  });
  it('intersects per-card permissions for bulk transitions', () => {
    const b = { ...a, transitionOptions: [{ status: 'OTHER', label: 'Outro', allowed: true, reason: null }] };
    expect(commonTransitions([a, b])).toEqual([]);
    expect(commonTransitions([a, a])[0].value).toBe('CUSTOM');
  });
  it('keeps archived statuses only while used and preserves published order and labels', () => {
    const statuses = [
      { code: 'CUSTOM', label: 'Renomeado', active: true },
      { code: 'NEW', label: 'Arquivado', active: false },
      { code: 'OLD', label: 'Vazio', active: false },
    ] as WorkflowStatusDefinition[];
    expect(workflowColumns(statuses, [a]).map((x) => [x.code, x.label])).toEqual([
      ['CUSTOM', 'Renomeado'],
      ['NEW', 'Arquivado'],
    ]);
  });
  it('uses the published category for closure including custom statuses', () => {
    expect(isDone({ ...a, statusCategory: 'DONE' })).toBe(true);
    expect(isDone({ ...a, status: 'COMPLETED', statusCategory: 'IN_PROGRESS' })).toBe(false);
  });
});
