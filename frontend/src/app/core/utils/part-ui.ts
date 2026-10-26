import { ManualPartMovementType, PartMovementResponse, PartMovementType, PartReservationStatus } from '../models';

export const PART_MOVEMENT_LABELS: Record<PartMovementType, string> = {
  ENTRY: 'Entrada',
  EXIT: 'Saída',
  ADJUSTMENT: 'Ajuste',
  RESERVATION: 'Reserva',
  RESERVATION_CANCEL: 'Cancelamento de reserva',
  CONSUMPTION: 'Consumo',
  REVERSAL: 'Estorno'
};

export const MANUAL_MOVEMENT_TYPES: ManualPartMovementType[] = ['ENTRY', 'EXIT', 'ADJUSTMENT'];

export const PART_RESERVATION_STATUS_LABELS: Record<PartReservationStatus, string> = {
  PENDING: 'Pendente',
  ACTIVE: 'Reservada',
  CONSUMED: 'Consumida',
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
