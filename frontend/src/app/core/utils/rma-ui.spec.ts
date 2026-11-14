import { RmaResponse, WarrantyStatus } from '../models';
import { buildRma, buildRmaItem } from '../../testing/rma-fixtures';
import { formatDateTime as formatCatalogDateTime } from './catalog-ui';
import {
  compareRmasForQueue,
  formatDateTime as formatRmaDateTime,
  itemCountLabel,
  normalizeText,
  ownerLabel,
  productSummary,
  rmaItemTrackableLabel,
  trackableLabel,
  warrantyLabel,
} from './rma-ui';

describe('OS UI utilities', () => {
  it('normalizes optional text and renders responsibility and warranty labels', () => {
    expect(normalizeText('  observacao  ')).toBe('observacao');
    expect(normalizeText('   ')).toBeNull();
    expect(ownerLabel({ assigneeName: '  Tecnico  ' })).toBe('Tecnico');
    expect(ownerLabel({ assigneeName: null })).toBe('Sem respons\u00e1vel');
    expect(warrantyLabel(WarrantyStatus.IN_WARRANTY)).toBe('Em garantia');
  });

  it('renders available tracking identifiers', () => {
    expect(rmaItemTrackableLabel({ serialNumber: 'SER-1', batchNumber: 'LOT-1' })).toBe(
      'Série SER-1 · Lote LOT-1',
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

  it('formats item counts', () => {
    // Hoje itemCountLabel não existe (vermelho de compilação).
    expect(itemCountLabel(1)).toBe('1 item');
    expect(itemCountLabel(2)).toBe('2 itens');
    expect(itemCountLabel(0)).toBe('0 itens');
  });

  it('keeps productSummary and trackableLabel for several items', () => {
    const rma = buildRma({
      items: [
        buildRmaItem({ productName: 'Produto A', serialNumber: 'S1', batchNumber: 'L1' }),
        buildRmaItem({ id: 2, productName: 'Produto B', serialNumber: 'S2', batchNumber: null }),
      ],
    });
    expect(productSummary(rma)).toBe('Produto A + 1 item(ns)');
    expect(trackableLabel(rma)).toBe('Série S1 · Lote L1 + 1 item(ns)');
  });
});

describe.each([
  ['OS', formatRmaDateTime],
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
