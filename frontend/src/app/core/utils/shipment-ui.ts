import { ShipmentEventSource, ShipmentStatus, ShipmentType } from '../models';

export const SHIPMENT_TYPE_LABELS: Record<ShipmentType, string> = {
  PICKUP: 'Coleta',
  POSTING: 'Postagem',
  TRANSFER: 'Transferência',
  RETURN: 'Devolução'
};

export const SHIPMENT_STATUS_LABELS: Record<ShipmentStatus, string> = {
  CREATED: 'Criada',
  LABEL_ISSUED: 'Etiqueta registrada',
  IN_TRANSIT: 'Em trânsito',
  DELIVERY_ATTEMPT: 'Tentativa de entrega',
  EXCEPTION: 'Exceção',
  DELIVERED: 'Entregue',
  CANCELLED: 'Cancelada'
};

export const SHIPMENT_EVENT_SOURCE_LABELS: Record<ShipmentEventSource, string> = {
  SYSTEM: 'Sistema',
  INTEGRATION: 'Transportadora',
  MANUAL: 'Manual'
};

export function shipmentStatusClass(status: ShipmentStatus): string {
  switch (status) {
    case 'EXCEPTION':
      return 'priority-high';
    case 'DELIVERY_ATTEMPT':
      return 'warranty-alert';
    case 'DELIVERED':
      return 'warranty-ok';
    case 'CANCELLED':
      return 'warranty-off';
    default:
      return 'priority-low';
  }
}

export function formatCurrency(value: number | null): string {
  return value === null ? '—' : new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
}

export function normalizeCost(value: string): string | null {
  const normalized = value.trim().replace(/\s/g, '').replace(',', '.');
  return normalized ? normalized : null;
}
