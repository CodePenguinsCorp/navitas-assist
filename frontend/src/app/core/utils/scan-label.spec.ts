import { buildLabelModel, looksLikeScanner } from './scan-label';
import { LABEL_RMA } from './scan-label.testing';

describe('Label model', () => {
  it('always shows the RMA code and product and only the selected fields, in a fixed order', () => {
    const label = buildLabelModel(LABEL_RMA, ['entryDate', 'trackable']);

    expect(label.rmaCode).toBe('RMA-2026-000007');
    expect(label.product).toBe('CTRL-1 | Controlador (+1)');
    expect(label.lines).toEqual([
      { label: 'Série / lote', value: 'Serial S-1 | Lote L-1' },
      { label: 'Entrada', value: '20/10/2026' }
    ]);
    expect(JSON.stringify(label)).not.toContain('Cliente Sigiloso');
  });

  it('includes optional client, priority and invoice when selected', () => {
    const lines = buildLabelModel(LABEL_RMA, ['client', 'priority', 'invoice']).lines.map((line) => line.value);
    expect(lines).toEqual(['Cliente Sigiloso', 'Alta', 'NF-99']);
  });

  it('distinguishes scanner bursts from human typing', () => {
    expect(looksLikeScanner(Array.from({ length: 32 }, (_, index) => index * 10))).toBe(true);
    expect(looksLikeScanner(Array.from({ length: 32 }, (_, index) => index * 180))).toBe(false);
    expect(looksLikeScanner([0, 5, 10])).toBe(false);
  });
});
