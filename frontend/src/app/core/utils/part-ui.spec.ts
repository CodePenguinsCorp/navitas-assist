import { formatBusinessDateTime } from './date';
import { canReverseMovement, formatCurrency, formatQuantity, formatSignedQuantity, movementChanges, movementTypeTone, movementTypeIcon, PART_MOVEMENT_LABELS, PART_USAGE_STATUS_LABELS, usageStatusClass } from './part-ui';

describe('Part UI utilities', () => {
  it('formats quantities, signed changes and BRL currency in pt-BR', () => {
    expect(formatQuantity(1.5, 'm')).toBe('1,5 m');
    expect(formatQuantity(3)).toBe('3');
    expect(formatSignedQuantity(2)).toBe('+2');
    expect(formatSignedQuantity(-2)).toBe('-2');
    expect(formatCurrency(37.05).replace(/\s/g, ' ')).toBe('R$ 37,05');
  });

  it('allows reversal only for unreversed stock-changing movements', () => {
    expect(canReverseMovement({ type: 'CONSUMPTION', reversed: false })).toBe(true);
    expect(canReverseMovement({ type: 'ENTRY', reversed: true })).toBe(false);
    expect(canReverseMovement({ type: 'REVERSAL', reversed: false })).toBe(false);
  });

  it('maps usage statuses to chip tones', () => {
    expect(usageStatusClass('USED')).toBe('warranty-ok');
    expect(usageStatusClass('REVERTED')).toBe('warranty-off');
  });

  it('maps every movement type to a semantic tone', () => {
    expect(movementTypeTone('ENTRY')).toBe('tone-success');
    expect(movementTypeTone('EXIT')).toBe('tone-danger');
    expect(movementTypeTone('ADJUSTMENT')).toBe('tone-warning');
    expect(movementTypeTone('CONSUMPTION')).toBe('tone-violet');
    expect(movementTypeTone('REVERSAL')).toBe('tone-slate');
  });

  it('lists only the balances a movement changed, keeping a zero movement visible', () => {
    expect(movementChanges({ onHandChange: 20, })).toEqual([{ amount: '+20', label: 'em estoque' }]);

    expect(movementChanges({ onHandChange: -1.5, })).toEqual([
      { amount: '-1,5', label: 'em estoque' }
    ]);
    expect(movementChanges({ onHandChange: 0, })).toEqual([{ amount: '0', label: 'em estoque' }]);
  });

  it('formats timestamps in America/Sao_Paulo regardless of the browser zone', () => {
    expect(formatBusinessDateTime('2026-10-24T02:30:00Z')).toBe('23/10/2026, 23:30');
    expect(formatBusinessDateTime(null)).toBe('Não informado');
  });
});

describe('Apresentação dos movimentos de peças', () => {
  it.each([
    ['ENTRY', 'plus'], ['EXIT', 'logout'], ['ADJUSTMENT', 'move'],
    ['CONSUMPTION', 'wrench'], ['REVERSAL', 'undo']
  ] as const)('identifica o tipo %s com o ícone %s', (type, icon) => {
    expect(movementTypeIcon(type)).toBe(icon);
  });

  it('usa reversão também nos rótulos compartilhados com a OS', () => {
    expect(PART_MOVEMENT_LABELS.REVERSAL).toBe('Reversão');
    expect(PART_USAGE_STATUS_LABELS.REVERTED).toBe('Uso desfeito');
  });
});
