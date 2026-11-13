import { PageResponse, RmaItemResponse, RmaResponse, WarrantyStatus } from '../core/models';

/** Data-only builders shared by the RMA specs. */
export function buildRmaItem(overrides: Partial<RmaItemResponse> = {}): RmaItemResponse {
  return {
    id: 1,
    productId: 2,
    productName: 'Produto',
    productSku: 'SKU-2',
    batchNumber: null,
    serialNumber: 'SER-2',
    manufacturedAt: null,
    warrantyMonths: 12,
    warrantyExpiresAt: null,
    warrantyStatus: WarrantyStatus.PENDING,
    ...overrides
  };
}

export function buildRma(overrides: Partial<RmaResponse> = {}): RmaResponse {
  const items = overrides.items ?? [buildRmaItem()];
  const first = items[0];
  return {
    id: 1,
    code: 'RMA-2026-000001',
    clientId: 1,
    clientName: 'Cliente',
    items,
    productId: first?.productId ?? 2,
    productName: first?.productName ?? 'Produto',
    productSku: first?.productSku ?? 'SKU-2',
    batchNumber: first?.batchNumber ?? null,
    serialNumber: first?.serialNumber ?? null,
    manufacturedAt: first?.manufacturedAt ?? null,
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
    shippedAt: null,
    carrier: null,
    trackingCode: null,
    diagnosis: null,
    statusHistory: [],
    stagePeriods: [{ status: 'RECEIVED', enteredAt: '2026-10-20T12:00:00Z', leftAt: null, durationSeconds: 0 }],
    assignmentHistory: [],
    dueDateHistory: [],
    deadline: { status: 'NO_DUE_DATE', dueSoonFrom: null, daysUntilDue: null },
    currentBlock: null,
    blockHistory: [],
    sla: {
      status: 'NORMAL',
      startedAt: '2026-10-20T12:00:00Z',
      warningAt: '2026-10-21T07:12:00Z',
      dueAt: '2026-10-21T12:00:00Z',
      elapsedSeconds: 0,
      limitSeconds: 86400
    },
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
