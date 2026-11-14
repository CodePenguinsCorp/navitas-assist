import { ManualPartMovementType, PartMovementResponse, PartMovementType, PartReservationStatus } from '../models';

export const PART_MOVEMENT_LABELS: Record<PartMovementType, string> = {
  ENTRY: 'Entrada',
  EXIT: 'Saída',
  ADJUSTMENT: 'Ajuste',
  RESERVATION: 'Reserva',
  RESERVATION_CANCEL: 'Cancelamento de reserva',
  CONSUMPTION: 'Aplicação',
  REVERSAL: 'Estorno'
};

export const MANUAL_MOVEMENT_TYPES: ManualPartMovementType[] = ['ENTRY', 'EXIT', 'ADJUSTMENT'];

export const PART_RESERVATION_STATUS_LABELS: Record<PartReservationStatus, string> = {
  PENDING: 'Pendente',
  ACTIVE: 'Reservada',
  CONSUMED: 'Aplicada',
  CANCELLED: 'Cancelada',
  REVERSED: 'Estornada'
};

const REVERSIBLE_MOVEMENT_TYPES: PartMovementType[] = ['ENTRY', 'EXIT', 'ADJUSTMENT', 'CONSUMPTION'];

export function reservationStatusClass(status: PartReservationStatus): string {
  switch (status) {
    case 'ACTIVE':
      return 'priority-low';
    case 'PENDING':
      return 'warranty-alert';
    case 'CONSUMED':
      return 'warranty-ok';
    default:
      return 'warranty-off';
  }
}

const MOVEMENT_TYPE_TONES: Record<PartMovementType, string> = {
  ENTRY: 'tone-success',
  EXIT: 'tone-danger',
  ADJUSTMENT: 'tone-warning',
  RESERVATION: 'tone-sky',
  RESERVATION_CANCEL: 'tone-slate',
  CONSUMPTION: 'tone-violet',
  REVERSAL: 'tone-slate'
};

/** Tone class (`tone-*` in styles.css) for the movement type chip. */
export function movementTypeTone(type: PartMovementType): string {
  return MOVEMENT_TYPE_TONES[type];
}

export interface MovementChange {
  amount: string;
  label: 'em estoque' | 'reservado';
}

/** Signed changes the movement made; a movement that changed nothing still shows "0 em estoque". */
export function movementChanges(movement: Pick<PartMovementResponse, 'onHandChange' | 'reservedChange'>): MovementChange[] {
  const changes: MovementChange[] = [];
  if (movement.onHandChange !== 0) changes.push({ amount: formatSignedQuantity(movement.onHandChange), label: 'em estoque' });
  if (movement.reservedChange !== 0) changes.push({ amount: formatSignedQuantity(movement.reservedChange), label: 'reservado' });
  return changes.length ? changes : [{ amount: formatSignedQuantity(0), label: 'em estoque' }];
}

export function canReverseMovement(movement: Pick<PartMovementResponse, 'type' | 'reversed'>): boolean {
  return !movement.reversed && REVERSIBLE_MOVEMENT_TYPES.includes(movement.type);
}

export function formatQuantity(value: number, unit?: string | null): string {
  const formatted = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 3 }).format(value);
  return unit ? `${formatted} ${unit}` : formatted;
}

export function formatSignedQuantity(value: number): string {
  return value > 0 ? `+${formatQuantity(value)}` : formatQuantity(value);
}

export function formatCurrency(value: number): string {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
}
