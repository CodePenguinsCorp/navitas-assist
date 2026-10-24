import { Signal, signal } from '@angular/core';
import { FormGroup } from '@angular/forms';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { of, Subject, throwError } from 'rxjs';
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
  let listedRmas: RmaResponse[];
  let positionRequest: { id: number; payload: unknown } | null;
  let positionResult: Subject<RmaResponse[]>;
  let allowWrites: boolean;

  beforeEach(async () => {
    now = signal(Date.parse('2026-10-20T12:00:00Z'));
    createdViewRequest = null;
    failCreateView = false;
    listedRmas = TEST_RMAS;
    positionRequest = null;
    positionResult = new Subject<RmaResponse[]>();
    allowWrites = true;
    await TestBed.configureTestingModule({
      imports: [KanbanComponent],
      providers: [
        { provide: SlaClockService, useValue: { now } },
        { provide: AuthService, useValue: { hasAnyRole: () => allowWrites } },
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
        { provide: RmaService, useValue: {
          list: () => of(listedRmas),
          updatePosition: (id: number, payload: unknown) => {
            positionRequest = { id, payload };
            return positionResult;
          },
        } },
      ],
    }).compileComponents();

    component = TestBed.createComponent(KanbanComponent)
      .componentInstance as unknown as KanbanHarness;
  });

  function orderFixture(): ComponentFixture<KanbanComponent> {
    listedRmas = [
      { ...TEST_RMAS[0], id: 1, code: 'NAV-0001', priority: 'LOW', boardPosition: 1 },
      { ...TEST_RMAS[0], id: 2, code: 'NAV-0002', priority: 'LOW', boardPosition: 2 },
      { ...TEST_RMAS[0], id: 3, code: 'NAV-0003', priority: 'HIGH', boardPosition: 3 },
    ];
    const fixture = TestBed.createComponent(KanbanComponent);
    component = fixture.componentInstance as unknown as KanbanHarness;
    fixture.detectChanges();
    return fixture;
  }

  function cardIds(fixture: ComponentFixture<KanbanComponent>): string[] {
    return Array.from(fixture.nativeElement.querySelectorAll('.board-card h4'), (item: any) => item.textContent.trim());
  }

  it('persists a keyboard-accessible move with filters and restores hidden cards in server order', async () => {
    const fixture = orderFixture();
    expect(cardIds(fixture)).toEqual(['NAV-0001', 'NAV-0002', 'NAV-0003']);
    component.filtersForm.patchValue({ query: 'NAV-000' });
    component.filtersForm.patchValue({ priority: 'LOW' });
    fixture.detectChanges();
    const up: HTMLButtonElement = fixture.nativeElement.querySelector('[aria-label="Subir NAV-0002"]');
    expect(up).not.toBeNull();
    up.focus();
    up.click();
    expect(positionRequest).toEqual({ id: 2, payload: { expectedStatus: 'TRIAGE', anchorId: 1, after: false } });
    fixture.detectChanges();
    expect(up.disabled).toBe(true);
    positionResult.next([listedRmas[1], listedRmas[0], listedRmas[2]].map((rma, index) => ({ ...rma, boardPosition: index + 1 })));
    positionResult.complete();
    fixture.detectChanges();
    await fixture.whenStable();
    expect(document.activeElement).toBe(fixture.nativeElement.querySelector('[data-rma-id="2"]'));
    component.clearFilters();
    fixture.detectChanges();
    expect(cardIds(fixture)).toEqual(['NAV-0002', 'NAV-0001', 'NAV-0003']);
    expect(fixture.nativeElement.querySelector('[aria-label="Descer NAV-0002"]')).toBeTruthy();
  });

  it('keeps order and filters when persistence fails and reports the error', () => {
    const fixture = orderFixture();
    component.filtersForm.patchValue({ priority: 'LOW' });
    fixture.detectChanges();
    fixture.nativeElement.querySelector('[aria-label="Subir NAV-0002"]').click();
    positionResult.error({ error: { message: 'Quadro alterado; tente novamente.' } });
    fixture.detectChanges();
    expect(component.filtersForm.getRawValue().priority).toBe('LOW');
    expect(cardIds(fixture)).toEqual(['NAV-0001', 'NAV-0002']);
    expect(fixture.nativeElement.textContent).toContain('Quadro alterado; tente novamente.');
  });

  it('supports dropping a card before another card within its column', () => {
    const fixture = orderFixture();
    const cards = fixture.nativeElement.querySelectorAll('.board-card');
    cards[2].dispatchEvent(new Event('dragstart', { bubbles: true, cancelable: true }));
    fixture.detectChanges();
    const drag = new Event('dragover', { bubbles: true, cancelable: true });
    cards[0].dispatchEvent(drag);
    expect(drag.defaultPrevented).toBe(true);
    cards[0].dispatchEvent(new Event('drop', { bubbles: true, cancelable: true }));
    expect(positionRequest).toEqual({ id: 3, payload: { expectedStatus: 'TRIAGE', anchorId: 1, after: false } });
  });

  it('does not reorder when a card is dropped on itself', () => {
    const fixture = orderFixture();
    const card = fixture.nativeElement.querySelector('.board-card');
    card.dispatchEvent(new Event('dragstart', { bubbles: true, cancelable: true }));
    fixture.detectChanges();
    card.dispatchEvent(new Event('drop', { bubbles: true, cancelable: true }));
    expect(positionRequest).toBeNull();
    expect(cardIds(fixture)).toEqual(['NAV-0001', 'NAV-0002', 'NAV-0003']);
  });

  it('includes concurrently created cards returned by the server', () => {
    const fixture = orderFixture();
    fixture.nativeElement.querySelector('[aria-label="Subir NAV-0002"]').click();
    positionResult.next([
      { ...listedRmas[1], boardPosition: 1 },
      { ...listedRmas[0], boardPosition: 2 },
      listedRmas[2],
      { ...listedRmas[0], id: 4, code: 'NAV-0004', boardPosition: 4 },
    ]);
    positionResult.complete();
    fixture.detectChanges();
    expect(cardIds(fixture)).toEqual(['NAV-0002', 'NAV-0001', 'NAV-0003', 'NAV-0004']);
  });

  it('appends a column drop after the complete column even when the last card is hidden', () => {
    const fixture = orderFixture();
    component.filtersForm.patchValue({ priority: 'LOW' });
    fixture.detectChanges();
    fixture.nativeElement.querySelector('.board-card').dispatchEvent(new Event('dragstart', { bubbles: true, cancelable: true }));
    fixture.detectChanges();
    fixture.nativeElement.querySelector('[data-status="TRIAGE"]').dispatchEvent(new Event('drop', { bubbles: true, cancelable: true }));
    expect(positionRequest).toEqual({ id: 1, payload: { expectedStatus: 'TRIAGE', anchorId: 3, after: true } });
  });

  it('preserves the confirmation flow when dropping into another column', () => {
    const fixture = orderFixture();
    fixture.nativeElement.querySelector('.board-card').dispatchEvent(new Event('dragstart', { bubbles: true, cancelable: true }));
    fixture.detectChanges();
    fixture.nativeElement.querySelector('[data-status="IN_REPAIR"]').dispatchEvent(new Event('drop', { bubbles: true, cancelable: true }));
    fixture.detectChanges();
    expect(positionRequest).toBeNull();
    expect(fixture.nativeElement.querySelector('.modal-overlay').textContent).toContain('Status');
    expect((component as any).statusForm.getRawValue().status).toBe('IN_REPAIR');
  });

  it('hides ordering actions from viewers and disables them during bulk operations', () => {
    allowWrites = false;
    const viewer = orderFixture();
    expect(viewer.nativeElement.querySelector('.board-card__order')).toBeNull();
    expect(viewer.nativeElement.querySelector('.board-card').draggable).toBe(false);
    allowWrites = true;
    const operator = orderFixture();
    (component as any).bulkBusy.set(true);
    operator.detectChanges();
    const buttons = Array.from(operator.nativeElement.querySelectorAll('.board-card__order button')) as HTMLButtonElement[];
    expect(buttons.length).toBeGreaterThan(0);
    expect(buttons.every((button) => button.disabled)).toBe(true);
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
    boardPosition: values.id,
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
