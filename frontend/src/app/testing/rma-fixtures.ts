import { PageResponse, RmaItemResponse, RmaResponse, WarrantyStatus } from '../core/models';

/** Data-only builders shared by the RMA specs. */
export function buildRmaItem(overrides: Partial<RmaItemResponse> = {}): RmaItemResponse {
  return {
    id: 1,
    productName: 'Produto',
    productSku: 'SKU-2',
    batchNumber: null,
    serialNumber: 'SER-2',
    manufacturedAt: null,
    warrantyMonths: 12,
    warrantyExpiresAt: null,
    warrantyStatus: WarrantyStatus.PENDING,
    calculatedWarrantyStatus: WarrantyStatus.PENDING,
    warrantyOverride: null,
    ...overrides
  };
}

export function buildRma(overrides: Partial<RmaResponse> = {}): RmaResponse {
  const items = overrides.items ?? [buildRmaItem()];
  return {
    id: 1,
    code: 'OS-2026-000001',
    clientName: 'Cliente',
    items,
    purchaseDate: null,
    purchaseDateUnknown: true,
    entryDate: '2026-10-20',
    dueDate: null,
    invoiceNumber: 'NF-123',
    receivedBy: 'tester',
    reportedFailure: 'Falha',
    receivedAccessories: null,
    physicalCondition: null,
    priority: 'MEDIUM',
    status: 'RECEIVED',
    assigneeId: null,
    assigneeName: null,
    repairSummary: null,
    replacedPartsSummary: null,
    testSummary: null,
    carrier: null,
    trackingCode: null,
    diagnosis: null,
    statusHistory: [],
    stagePeriods: [{ status: 'RECEIVED', enteredAt: '2026-10-20T12:00:00Z', leftAt: null, durationSeconds: 0 }],
    assignmentHistory: [],
    dueDateHistory: [], warrantyHistory: [],
    deadline: { status: 'NO_DUE_DATE', dueSoonFrom: null },
    currentBlock: null,
    blockHistory: [],
    createdAt: '2026-10-20T12:00:00Z',
    updatedAt: '2026-10-20T12:00:00Z',
    ...overrides
  };
}

export function buildRmaPage(
  content: RmaResponse[],
  page = 0,
  size = 20,
  totalElements = content.length
): PageResponse<RmaResponse> {
  return { content, page, size, totalElements, totalPages: Math.ceil(totalElements / size) };
}
