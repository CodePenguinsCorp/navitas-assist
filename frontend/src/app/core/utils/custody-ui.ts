import { CustodyFlag, CustodyMovementType, StorageLocationType } from '../models';

export const STORAGE_LOCATION_TYPE_LABELS: Record<StorageLocationType, string> = {
  AREA: 'Área',
  BENCH: 'Bancada',
  SHELF: 'Prateleira',
  QUARANTINE: 'Quarentena',
  SHIPPING: 'Expedição'
};

export const STORAGE_LOCATION_TYPE_OPTIONS: StorageLocationType[] = ['AREA', 'BENCH', 'SHELF', 'QUARANTINE', 'SHIPPING'];

export const CUSTODY_MOVEMENT_TYPE_LABELS: Record<CustodyMovementType, string> = {
  ENTRY: 'Entrada',
  TRANSFER: 'Transferência',
  EXIT: 'Saída'
};

export const CUSTODY_FLAG_LABELS: Record<CustodyFlag, string> = {
  OK: 'Localizado',
  MISSING: 'Sem localização',
  STALE: 'Parado'
};

export function custodyFlagClass(flag: CustodyFlag): string {
  switch (flag) {
    case 'MISSING':
      return 'priority-high';
    case 'STALE':
      return 'warranty-alert';
    default:
      return 'warranty-ok';
  }
}
