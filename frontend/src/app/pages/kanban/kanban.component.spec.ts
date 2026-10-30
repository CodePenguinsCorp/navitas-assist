import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Signal, signal } from '@angular/core';
import { FormGroup } from '@angular/forms';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { of, throwError } from 'rxjs';
import { KanbanViewRequest, RmaResponse, WarrantyStatus } from '../../core/models';
import { SlaClockService } from '../../core/services/sla-clock.service';
import { AuthService } from '../../core/services/auth.service';
import { CatalogService } from '../../core/services/catalog.service';
import { KanbanViewService } from '../../core/services/kanban-view.service';
import { RmaService } from '../../core/services/rma.service';
import { BulkRmaResult } from '../../shared/kanban-bulk-actions/kanban-bulk-actions.component';
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

  it('selects across columns and filters, clears selection and patches affected cards', () => {
    component.toggleBulkSelection(TEST_RMAS[0]);
    component.toggleBulkSelection(TEST_RMAS[1]);
    expect(component.bulkSelectedRmas()).toHaveLength(2);
    component.filtersForm.patchValue({ priority: 'HIGH' });
    expect(component.hiddenSelectedCount()).toBe(1);
    component.selectVisibleRmas();
    expect(component.bulkSelectedRmas()).toHaveLength(2);
    const updated = { ...TEST_RMAS[0], priority: 'LOW' as const };
    component.applyBulkResults([
      { id: 1, code: updated.code, success: true, message: 'OK', rma: updated },
      { id: 2, code: TEST_RMAS[1].code, success: false, message: 'Etapa alterada', rma: { ...TEST_RMAS[1], status: 'IN_DIAGNOSIS' } },
    ]);
    expect(component.bulkSelectedRmas().map((rma) => rma.id)).toEqual([2]);
    component.clearFilters();
    expect(component.filteredRmas()[0]).toBe(updated);
    expect(component.filteredRmas()[1].status).toBe('IN_DIAGNOSIS');
    component.clearBulkSelection();
    expect(component.bulkSelectedRmas()).toEqual([]);
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
  bulkSelectedRmas: Signal<RmaResponse[]>;
  hiddenSelectedCount: Signal<number>;
  toggleBulkSelection(rma: RmaResponse): void;
  selectVisibleRmas(): void;
  clearBulkSelection(): void;
  applyBulkResults(results: BulkRmaResult[]): void;
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

describe('KanbanComponent status note limit', () => {
  let fixture: ComponentFixture<KanbanComponent>;
  let http: HttpTestingController;
  let page: HTMLElement;
  let targetStatusLabel: string;
  const errorMessage = 'A observação deve ter no máximo 255 caracteres.';

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [KanbanComponent],
      providers: [provideHttpClient(), provideHttpClientTesting()]
    }).compileComponents();
    http = TestBed.inject(HttpTestingController);
    TestBed.inject(AuthService).restoreSession().subscribe();
    http.expectOne('/api/auth/me').flush({
      id: 1, username: 'tester', fullName: 'Tester', role: 'ADMIN', active: true,
      createdAt: TEST_RMAS[0].createdAt, updatedAt: TEST_RMAS[0].updatedAt
    });
    fixture = TestBed.createComponent(KanbanComponent);
    http.expectOne('/api/rmas').flush(TEST_RMAS);
    http.expectOne('/api/users/assignable').flush([]);
    http.expectOne('/api/kanban-views').flush([]);
    fixture.detectChanges();
    page = fixture.nativeElement as HTMLElement;
    page.querySelector<HTMLElement>('.board-card')!.dispatchEvent(new Event('dragstart', { bubbles: true, cancelable: true }));
    fixture.detectChanges();
    page.querySelector<HTMLElement>('.board-column[data-status="IN_DIAGNOSIS"]')!
      .dispatchEvent(new Event('drop', { bubbles: true, cancelable: true }));
    fixture.detectChanges();
    targetStatusLabel = statusLabel();
  });

  afterEach(() => http.verify());

  function note(): HTMLTextAreaElement {
    return page.querySelector<HTMLTextAreaElement>('#kanbanStatusNote')!;
  }

  function statusLabel(): string {
    return page.querySelector('.modal-overlay app-custom-select[formControlName="status"] .custom-select__label')!.textContent!.trim();
  }

  function enterNote(value: string): void {
    note().value = value;
    note().dispatchEvent(new Event('input', { bubbles: true }));
    fixture.detectChanges();
  }

  function submit(): void {
    page.querySelector('.modal-overlay form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    fixture.detectChanges();
  }

  function expectBlockedOversize(): void {
    enterNote('n'.repeat(256));
    submit();
    const requests = http.match({ method: 'PATCH', url: '/api/rmas/1/status' });
    for (const request of requests) {
      request.flush({ message: 'Validation failed', details: ['note: too long'] }, { status: 400, statusText: 'Bad Request' });
    }
    fixture.detectChanges();
    expect(requests).toHaveLength(0);
    expect(note().value).toHaveLength(256);
    expect(statusLabel()).toBe(targetStatusLabel);
    expect(note().closest('.field-group')?.textContent).toContain(errorMessage);
    expect(page.querySelector('.modal-overlay [role="alert"]')?.textContent).toContain('Confira os dados da alteração de status.');
    expect(page.querySelector('.modal-overlay')).not.toBeNull();
  }

  function succeed(expectedNote: string | null): void {
    const request = http.expectOne({ method: 'PATCH', url: '/api/rmas/1/status' });
    expect(request.request.body).toEqual({ status: 'IN_DIAGNOSIS', note: expectedNote });
    const saved: RmaResponse = { ...TEST_RMAS[0], status: 'IN_DIAGNOSIS' };
    request.flush(saved);
    http.expectOne('/api/rmas').flush([saved, TEST_RMAS[1]]);
    http.expectOne('/api/users/assignable').flush([]);
    fixture.detectChanges();
    expect(page.querySelector('.modal-overlay')).toBeNull();
    expect(page.querySelector('.board-column[data-status="IN_DIAGNOSIS"] .board-card')?.textContent).toContain(saved.code);
  }

  it('informs and applies the API limit without an initial error', () => {
    expect(note().maxLength).toBe(255);
    expect(page.querySelector('label[for="kanbanStatusNote"]')?.textContent).toContain('255');
    expect(note().closest('.field-group')?.textContent).not.toContain(errorMessage);
    expect(page.querySelector('.modal-overlay [role="alert"]')).toBeNull();
  });

  it.each([
    { label: 'empty', value: '', expected: null },
    { label: 'boundary', value: 'n'.repeat(255), expected: 'n'.repeat(255) },
    { label: 'trimmed', value: '  Nota  ', expected: 'Nota' }
  ])('saves $label notes with the existing normalization', ({ value, expected }) => {
    enterNote(value);
    submit();
    succeed(expected);
  });

  it('blocks oversized notes and preserves the selected status and form', () => {
    expectBlockedOversize();
  });

  it('removes feedback and permits saving after correction', () => {
    expectBlockedOversize();
    enterNote('n'.repeat(255));
    expect(note().closest('.field-group')?.textContent).not.toContain(errorMessage);
    submit();
    succeed('n'.repeat(255));
  });
});
