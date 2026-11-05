import { RmaResponse, WarrantyStatus } from '../models';

/** Shared RMA fixture for label and scan specs. */
export const LABEL_RMA = {
  id: 7, code: 'RMA-2026-000007', clientName: 'Cliente Sigiloso', productName: 'Controlador', productSku: 'CTRL-1', priority: 'HIGH',
  entryDate: '2026-10-20', invoiceNumber: 'NF-99',
  items: [
    { id: 1, productId: 2, productName: 'Controlador', productSku: 'CTRL-1', batchNumber: 'L-1', serialNumber: 'S-1', manufacturedAt: null, warrantyMonths: 12, warrantyExpiresAt: null, warrantyStatus: WarrantyStatus.PENDING },
    { id: 2, productId: 3, productName: 'Sensor', productSku: 'SEN-1', batchNumber: null, serialNumber: 'S-2', manufacturedAt: null, warrantyMonths: 12, warrantyExpiresAt: null, warrantyStatus: WarrantyStatus.PENDING }
  ]
} as unknown as RmaResponse;
