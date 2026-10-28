import { RmaResponse, WarrantyStatus } from '../models';
import {
  compareRmasForBoard,
  compareRmasForQueue,
  normalizeText,
  ownerLabel,
  rmaItemTrackableLabel,
  warrantyLabel,
} from './rma-ui';

describe('RMA UI utilities', () => {
  it('orders board cards by persisted position rather than priority or update time', () => {
    const first = { id: 1, boardPosition: 1, priority: 'LOW', updatedAt: '2026-01-01' } as unknown as RmaResponse;
    const second = { id: 2, boardPosition: 2, priority: 'HIGH', updatedAt: '2026-10-01' } as unknown as RmaResponse;
    expect([second, first].sort(compareRmasForBoard).map((rma) => rma.id)).toEqual([1, 2]);
  });
  it('normalizes optional text and renders responsibility and warranty labels', () => {
    expect(normalizeText('  observacao  ')).toBe('observacao');
    expect(normalizeText('   ')).toBeNull();
    expect(ownerLabel({ assigneeName: '  Tecnico  ' })).toBe('Tecnico');
    expect(ownerLabel({ assigneeName: null })).toBe('Sem respons\u00e1vel');
    expect(warrantyLabel(WarrantyStatus.IN_WARRANTY)).toBe('Em garantia');
  });

  it('renders available tracking identifiers', () => {
    expect(rmaItemTrackableLabel({ serialNumber: 'SER-1', batchNumber: 'LOT-1' })).toBe(
      'Serial SER-1 | Lote LOT-1',
    );
    expect(rmaItemTrackableLabel({ serialNumber: null, batchNumber: null })).toBe(
      'Item sem identifica\u00e7\u00e3o',
    );
  });

  it('orders the queue by priority before entry date', () => {
    const low = { priority: 'LOW', entryDate: '2026-01-01' } as RmaResponse;
    const high = { priority: 'HIGH', entryDate: '2026-10-01' } as RmaResponse;
    expect(compareRmasForQueue(high, low)).toBeLessThan(0);
  });
});
