import { RmaResponse, WarrantyStatus } from '../models';
import { buildRma, buildRmaItem } from '../../testing/rma-fixtures';
import { formatDateTime as formatCatalogDateTime } from './catalog-ui';
import {
  formatDateTime as formatRmaDateTime,
  boardProductSummary,
  itemCountLabel,
  normalizeText,
  ownerLabel,
  productSummary,
  rmaItemTrackableLabel,
  toBoardCard,
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

describe('toBoardCard', () => {
  it('keeps only what the card shows and filters, with the same shape as GET /api/rmas/board', () => {
    const rma = buildRma({
      id: 9, code: 'NAV-0009', clientName: 'Cliente', priority: 'HIGH', status: 'TRIAGE', dueDate: '2026-11-20',
      deadline: { status: 'DUE_SOON', dueSoonFrom: '2026-11-13' },
      assigneeId: 4, assigneeName: 'Ana', updatedAt: '2026-11-12T10:00:00Z',
      items: [
        buildRmaItem({ productName: 'Produto A', productSku: 'SKU-A', serialNumber: 'S1', batchNumber: 'L1', warrantyStatus: WarrantyStatus.IN_WARRANTY }),
        buildRmaItem({ id: 2, productName: 'Produto B', productSku: 'SKU-B', serialNumber: null, batchNumber: null, warrantyStatus: WarrantyStatus.OUT_OF_WARRANTY }),
      ],
      stagePeriods: [
        { status: 'RECEIVED', enteredAt: '2026-11-10T10:00:00Z', leftAt: '2026-11-12T09:00:00Z', durationSeconds: 100 },
        { status: 'TRIAGE', enteredAt: '2026-11-12T09:00:00Z', leftAt: null, durationSeconds: 0 },
      ],
      currentBlock: { id: 1, reason: 'Peça', category: null, blockedBy: 'x', blockedAt: '2026-11-12T09:30:00Z', resolvedBy: null, resolvedAt: null, resolutionNote: null },
    });
    expect(toBoardCard(rma)).toEqual({
      id: 9, code: 'NAV-0009', clientName: 'Cliente', productName: 'Produto A', additionalItems: 1,
      searchText: 'SKU-A L1 S1 Produto B SKU-B', warranty: 'IO',
      status: 'TRIAGE', priority: 'HIGH', entryDate: rma.entryDate, dueDate: '2026-11-20', dueSoonFrom: '2026-11-13',
      updatedAt: '2026-11-12T10:00:00Z', assigneeId: 4, assigneeName: 'Ana', blockedAt: '2026-11-12T09:30:00Z',
      currentStageEnteredAt: '2026-11-12T09:00:00Z',
    });
  });

  it('has no impediment when none is open and summarizes the product by count', () => {
    const card = toBoardCard(buildRma({ currentBlock: null }));
    expect(card.blockedAt).toBeUndefined();
    expect(card.additionalItems).toBeUndefined();
    expect(Object.keys(card)).not.toContain('blockedAt');
    expect(boardProductSummary({ productName: 'Produto A' })).toBe('Produto A');
    expect(boardProductSummary({ productName: 'Produto A', additionalItems: 2 })).toBe('Produto A + 2 item(ns)');
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
