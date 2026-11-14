import { formatBusinessDateTime } from './date';
import { canReverseMovement, formatCurrency, formatQuantity, formatSignedQuantity, movementChanges, movementTypeTone, reservationStatusClass } from './part-ui';

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
    expect(canReverseMovement({ type: 'RESERVATION', reversed: false })).toBe(false);
    expect(canReverseMovement({ type: 'REVERSAL', reversed: false })).toBe(false);
  });

  it('maps reservation statuses to chip tones', () => {
    expect(reservationStatusClass('PENDING')).toBe('warranty-alert');
    expect(reservationStatusClass('CONSUMED')).toBe('warranty-ok');
    expect(reservationStatusClass('REVERSED')).toBe('warranty-off');
  });

  it('maps every movement type to a semantic tone', () => {
    expect(movementTypeTone('ENTRY')).toBe('tone-success');
    expect(movementTypeTone('EXIT')).toBe('tone-danger');
    expect(movementTypeTone('ADJUSTMENT')).toBe('tone-warning');
    expect(movementTypeTone('RESERVATION')).toBe('tone-sky');
    expect(movementTypeTone('RESERVATION_CANCEL')).toBe('tone-slate');
    expect(movementTypeTone('CONSUMPTION')).toBe('tone-violet');
    expect(movementTypeTone('REVERSAL')).toBe('tone-slate');
  });

  it('lists only the balances a movement changed, keeping a zero movement visible', () => {
    expect(movementChanges({ onHandChange: 20, reservedChange: 0 })).toEqual([{ amount: '+20', label: 'em estoque' }]);
    expect(movementChanges({ onHandChange: 0, reservedChange: 1 })).toEqual([{ amount: '+1', label: 'reservado' }]);
    expect(movementChanges({ onHandChange: -1.5, reservedChange: -1.5 })).toEqual([
      { amount: '-1,5', label: 'em estoque' }, { amount: '-1,5', label: 'reservado' }
    ]);
    expect(movementChanges({ onHandChange: 0, reservedChange: 0 })).toEqual([{ amount: '0', label: 'em estoque' }]);
  });

  it('formats timestamps in America/Sao_Paulo regardless of the browser zone', () => {
    expect(formatBusinessDateTime('2026-10-24T02:30:00Z')).toBe('23/10/2026, 23:30');
    expect(formatBusinessDateTime(null)).toBe('Não informado');
  });
});
