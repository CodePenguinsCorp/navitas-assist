import { RmaResponse, WarrantyStatus } from '../models';
import { formatDateTime as formatCatalogDateTime } from './catalog-ui';
import {
  compareRmasForQueue,
  formatDateTime as formatRmaDateTime,
  normalizeText,
  ownerLabel,
  rmaItemTrackableLabel,
  warrantyLabel,
} from './rma-ui';

describe('RMA UI utilities', () => {
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

describe.each([
  ['RMA/SLA', formatRmaDateTime],
  ['cadastros', formatCatalogDateTime],
] as const)('%s date/time display', (_area, format) => {
  it.each([
    ['2026-10-20T02:30:00Z', '19/10/2026, 23:30'],
    ['2026-10-20T03:30:00Z', '20/10/2026, 00:30'],
    ['2026-01-01T01:15:00Z', '31/12/2025, 22:15'],
    ['2026-10-20T05:30:00+03:00', '19/10/2026, 23:30'],
  ])('renders %s in Sao Paulo', (instant, expected) => {
    expect(format(instant)).toBe(expected);
  });

  it.each([null, ''])('preserves the missing timestamp label for %s', (value) => {
    expect(format(value)).toBe('N\u00e3o informado');
  });
});
