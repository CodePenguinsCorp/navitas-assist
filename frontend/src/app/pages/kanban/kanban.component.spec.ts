import { Signal } from '@angular/core';
import { FormGroup } from '@angular/forms';
import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { RmaResponse, WarrantyStatus } from '../../core/models';
import { AuthService } from '../../core/services/auth.service';
import { CatalogService } from '../../core/services/catalog.service';
import { RmaService } from '../../core/services/rma.service';
import { KanbanComponent } from './kanban.component';

describe('KanbanComponent filters', () => {
  let component: KanbanHarness;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [KanbanComponent],
      providers: [
        { provide: AuthService, useValue: { hasAnyRole: () => true } },
        {
          provide: CatalogService,
          useValue: {
            listAssignableUsers: () =>
              of([{ id: 7, username: 'tecnico', fullName: 'Técnico Responsável' }]),
          },
        },
        { provide: RmaService, useValue: { list: () => of(TEST_RMAS) } },
      ],
    }).compileComponents();

    component = TestBed.createComponent(KanbanComponent)
      .componentInstance as unknown as KanbanHarness;
  });

  it.each([
    ['nav-0001', 1],
    ['ARVORE', 1],
    ['controlador premium', 1],
    ['lote-beta', 2],
    ['SERIE-ALFA', 1],
  ])(
    'searches by code, client and item tracking data without case or accent sensitivity',
    (query, id) => {
      component.filtersForm.patchValue({ query });

      expect(component.filteredRmas().map((rma) => rma.id)).toEqual([id]);
    },
  );

  it('combines priority, status, warranty, assignee and business-date filters', () => {
    component.filtersForm.patchValue({
      priority: 'HIGH',
      status: 'TRIAGE',
      warranty: WarrantyStatus.IN_WARRANTY,
      assignee: 7,
      entryFrom: '2026-10-10',
      entryTo: '2026-10-10',
      updatedFrom: '2026-10-19',
      updatedTo: '2026-10-19',
    });

    expect(component.filteredRmas().map((rma) => rma.id)).toEqual([1]);
    expect(component.highPriorityCount()).toBe(1);
    expect(component.activeCount()).toBe(1);
  });

  it('returns an empty result and restores all cards and counters when filters are cleared', () => {
    component.filtersForm.patchValue({ query: 'não existe' });

    expect(component.filteredRmas()).toEqual([]);
    expect(component.activeCount()).toBe(0);

    component.clearFilters();

    expect(component.filteredRmas()).toHaveLength(2);
    expect(component.activeCount()).toBe(1);
    expect(component.closedCount()).toBe(1);
    expect(component.activeFilterCount()).toBe(0);
  });
});

interface KanbanHarness {
  filtersForm: FormGroup;
  filteredRmas: Signal<RmaResponse[]>;
  activeFilterCount: Signal<number>;
  activeCount: Signal<number>;
  highPriorityCount: Signal<number>;
  closedCount: Signal<number>;
  clearFilters(): void;
}

const TEST_RMAS: RmaResponse[] = [
  buildRma({
    id: 1,
    code: 'NAV-0001',
    clientName: 'Árvore Equipamentos',
    productName: 'Controlador Premium',
    productSku: 'CTRL-01',
    batchNumber: 'LOTE-ALFA',
    serialNumber: 'SERIE-ALFA',
    entryDate: '2026-10-10',
    updatedAt: '2026-10-20T02:30:00Z',
    priority: 'HIGH',
    status: 'TRIAGE',
    assigneeId: 7,
    assigneeName: 'Técnico Responsável',
    warrantyStatus: WarrantyStatus.IN_WARRANTY,
  }),
  buildRma({
    id: 2,
    code: 'NAV-0002',
    clientName: 'Cliente Beta',
    productName: 'Sensor Básico',
    productSku: 'SENSOR-02',
    batchNumber: 'LOTE-BETA',
    serialNumber: 'SERIE-BETA',
    entryDate: '2026-10-15',
    updatedAt: '2026-10-20T15:00:00Z',
    priority: 'LOW',
    status: 'COMPLETED',
    assigneeId: null,
    assigneeName: null,
    warrantyStatus: WarrantyStatus.OUT_OF_WARRANTY,
  }),
];

function buildRma(values: {
  id: number;
  code: string;
  clientName: string;
  productName: string;
  productSku: string;
  batchNumber: string;
  serialNumber: string;
  entryDate: string;
  updatedAt: string;
  priority: RmaResponse['priority'];
  status: RmaResponse['status'];
  assigneeId: number | null;
  assigneeName: string | null;
  warrantyStatus: WarrantyStatus;
}): RmaResponse {
  return {
    id: values.id,
    code: values.code,
    clientId: values.id,
    clientName: values.clientName,
    items: [
      {
        id: values.id,
        productId: values.id,
        productName: values.productName,
        productSku: values.productSku,
        batchNumber: values.batchNumber,
        serialNumber: values.serialNumber,
        manufacturedAt: '2026-01-01',
        warrantyMonths: 12,
        warrantyExpiresAt: '2027-01-01',
        warrantyStatus: values.warrantyStatus,
      },
    ],
    productId: values.id,
    productName: values.productName,
    productSku: values.productSku,
    batchNumber: values.batchNumber,
    serialNumber: values.serialNumber,
    manufacturedAt: '2026-01-01',
    purchaseDate: '2026-02-01',
    purchaseDateUnknown: false,
    entryDate: values.entryDate,
    invoiceNumber: null,
    invoiceFileName: null,
    receivedBy: 'Atendimento',
    reportedFailure: 'Falha informada',
    receivedAccessories: null,
    physicalCondition: null,
    priority: values.priority,
    status: values.status,
    assigneeId: values.assigneeId,
    assigneeName: values.assigneeName,
    repairSummary: null,
    replacedPartsSummary: null,
    testSummary: null,
    shippedAt: null,
    carrier: null,
    trackingCode: null,
    diagnosis: null,
    statusHistory: [],
    assignmentHistory: [],
    createdAt: '2026-10-10T12:00:00Z',
    updatedAt: values.updatedAt,
  };
}
