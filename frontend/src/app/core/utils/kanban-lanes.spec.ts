import { RmaResponse } from '../models';
import { groupKanbanLanes } from './kanban-lanes';

function rma(id: number, values: Partial<RmaResponse> = {}): RmaResponse {
  return { id, code: 'NAV-' + id, clientId: 1, clientName: 'Cliente', assigneeId: null, assigneeName: null,
    priority: 'HIGH', status: 'TRIAGE', items: [], ...values } as RmaResponse;
}

describe('Kanban lanes', () => {
  it('uses identity instead of names and positions empty lanes independently of descending order', () => {
    const cards = [rma(1, { assigneeId: 1, assigneeName: 'Ana' }), rma(2, { assigneeId: 2, assigneeName: 'Ana' }), rma(3)];
    const lanes = groupKanbanLanes(cards, 'ASSIGNEE', true, true);
    expect(lanes.map(lane => lane.items.map(card => card.id))).toEqual([[3], [2], [1]]);
    expect(groupKanbanLanes(cards, 'ASSIGNEE', false, false).at(-1)?.items[0].id).toBe(3);
  });

  it('canonicalizes product sets and never duplicates cards with repeated or differently ordered products', () => {
    const product = (id: number) => ({ productId: id, productName: 'Produto ' + id }) as RmaResponse['items'][number];
    const cards = [rma(1, { items: [product(2), product(1), product(1)] }), rma(2, { items: [product(1), product(2)] }), rma(3)];
    const lanes = groupKanbanLanes(cards, 'PRODUCT', false, false);
    expect(lanes).toHaveLength(2);
    expect(lanes[0].items.map(card => card.id)).toEqual([1, 2]);
    expect(lanes.flatMap(lane => lane.items)).toHaveLength(3);
  });

  it('keeps natural priority order, calculates counts from its input and regroups updated cards', () => {
    const cards = [rma(1, { priority: 'LOW', status: 'COMPLETED' }), rma(2), rma(3, { priority: 'MEDIUM' })];
    const lanes = groupKanbanLanes(cards, 'PRIORITY', false, false);
    expect(lanes.map(lane => lane.key)).toEqual(['priority:HIGH', 'priority:MEDIUM', 'priority:LOW']);
    expect(lanes[0]).toMatchObject({ activeCount: 1, highPriorityCount: 1 });
    expect(lanes[2].activeCount).toBe(0);
    expect(groupKanbanLanes([{ ...cards[0], priority: 'HIGH' }], 'PRIORITY', false, false)[0].key).toBe('priority:HIGH');
    expect(groupKanbanLanes(cards.slice(1), 'CLIENT', false, false)[0].items).toHaveLength(2);
    expect(groupKanbanLanes(cards, 'NONE', false, false)).toHaveLength(1);
  });
});
