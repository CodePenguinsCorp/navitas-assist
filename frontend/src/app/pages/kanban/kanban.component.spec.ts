import { Signal, signal } from '@angular/core';
import { FormGroup } from '@angular/forms';
import { TestBed } from '@angular/core/testing';
import { of, throwError } from 'rxjs';
import { KanbanViewRequest, RmaResponse, WarrantyStatus } from '../../core/models';
import { SlaClockService } from '../../core/services/sla-clock.service';
import { AuthService } from '../../core/services/auth.service';
import { CatalogService } from '../../core/services/catalog.service';
import { KanbanViewService } from '../../core/services/kanban-view.service';
import { RmaService } from '../../core/services/rma.service';
import { KanbanComponent } from './kanban.component';

describe('KanbanComponent filters', () => {
  let component: KanbanHarness;
  let now = signal(Date.parse('2026-10-20T12:00:00Z'));
  let createdViewRequest: KanbanViewRequest | null;
  let failCreateView: boolean;

  beforeEach(async () => {
    now = signal(Date.parse('2026-10-20T12:00:00Z'));
    createdViewRequest = null;
    failCreateView = false;
    await TestBed.configureTestingModule({
      imports: [KanbanComponent],
      providers: [
        { provide: SlaClockService, useValue: { now } },
        { provide: AuthService, useValue: { hasAnyRole: () => true } },
        {
          provide: CatalogService,
          useValue: {
            listAssignableUsers: () =>
              of([{ id: 7, username: 'tecnico', fullName: 'Técnico Responsável' }]),
          },
        },
        {
          provide: KanbanViewService,
          useValue: {
            list: () => of([]),
            create: (request: KanbanViewRequest) => {
              createdViewRequest = request;
              if (failCreateView) {
                return throwError(() => ({ error: { message: 'Falha ao salvar' } }));
              }
              return of({
                id: 5,
                ...request,
                createdAt: '2026-10-20T12:00:00Z',
                updatedAt: '2026-10-20T12:00:00Z',
              });
            },
            update: (_id: number, request: KanbanViewRequest) =>
              of({
                id: 5,
                ...request,
                createdAt: '2026-10-20T12:00:00Z',
                updatedAt: '2026-10-20T12:00:00Z',
              }),
            setDefault: () => of({}),
            delete: () => of(undefined),
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

  it('combines SLA with advanced filters and clears the entire form', () => {
    component.filtersForm.patchValue({ sla: 'NORMAL', priority: 'HIGH', assignee: 7, query: 'arvore' });
    expect(component.filteredRmas().map((rma) => rma.id)).toEqual([1]);
    expect(component.activeFilterCount()).toBe(4);
    component.filtersForm.patchValue({ sla: 'CLOSED' });
    expect(component.filteredRmas()).toEqual([]);
    component.clearFilters();
    expect(component.filteredRmas()).toHaveLength(2);
    expect(component.filtersForm.getRawValue().sla).toBe('all');
    expect(component.activeFilterCount()).toBe(0);
  });

  it('updates the combined SLA filter as its deadline passes', () => {
    component.filtersForm.patchValue({ sla: 'OVERDUE', priority: 'HIGH', assignee: 7 });
    expect(component.filteredRmas()).toEqual([]);
    now.set(Date.parse('2026-10-20T13:00:00Z'));
    expect(component.filteredRmas().map((rma) => rma.id)).toEqual([1]);
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

  it('saves and reapplies the current filters, then resets them when the active view is deleted', () => {
    component.filtersForm.patchValue({ priority: 'HIGH', query: 'árvore' });
    component.openCreateViewModal();
    component.viewForm.patchValue({ name: 'Críticos', defaultView: true });

    component.saveView();

    expect(createdViewRequest).toEqual(
      expect.objectContaining({
        name: 'Críticos',
        defaultView: true,
        filters: expect.objectContaining({ priority: 'HIGH', query: 'árvore' }),
      }),
    );
    expect(component.activeViewId()).toBe(5);

    component.filtersForm.patchValue({ priority: 'all', query: '', sla: 'CLOSED' });
    component.applyView(5);
    expect(component.filtersForm.getRawValue().sla).toBe('all');
    expect(component.filteredRmas().map((rma) => rma.id)).toEqual([1]);
    expect(component.filtersForm.getRawValue()).toEqual(
      expect.objectContaining({ priority: 'HIGH', query: 'árvore' }),
    );

    component.deleteActiveView();
    expect(component.activeViewId()).toBeNull();
    expect(component.activeFilterCount()).toBe(0);
  });

  it('keeps the current filters when persistence fails', () => {
    failCreateView = true;
    component.filtersForm.patchValue({ status: 'TRIAGE', query: 'cliente' });
    component.openCreateViewModal();
    component.viewForm.patchValue({ name: 'Minha visão' });

    component.saveView();

    expect(component.filtersForm.getRawValue()).toEqual(
      expect.objectContaining({ status: 'TRIAGE', query: 'cliente' }),
    );
    expect(component.viewError()).toBe('Falha ao salvar');
  });
});

interface KanbanHarness {
  filtersForm: FormGroup;
  viewForm: FormGroup;
  filteredRmas: Signal<RmaResponse[]>;
  activeViewId: Signal<number | null>;
  viewError: Signal<string>;
  activeFilterCount: Signal<number>;
  activeCount: Signal<number>;
  highPriorityCount: Signal<number>;
  closedCount: Signal<number>;
  clearFilters(): void;
  applyView(value: unknown): void;
  openCreateViewModal(): void;
  saveView(): void;
  deleteActiveView(): void;
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
    sla: {
      status: values.status === 'COMPLETED' ? 'CLOSED' : 'NORMAL',
      startedAt: '2026-10-20T11:00:00Z',
      warningAt: values.status === 'COMPLETED' ? null : '2026-10-20T12:30:00Z',
      dueAt: values.status === 'COMPLETED' ? null : '2026-10-20T13:00:00Z',
      elapsedSeconds: 0,
      limitSeconds: values.status === 'COMPLETED' ? null : 7200,
    },
    createdAt: '2026-10-10T12:00:00Z',
    updatedAt: values.updatedAt,
  };
}
