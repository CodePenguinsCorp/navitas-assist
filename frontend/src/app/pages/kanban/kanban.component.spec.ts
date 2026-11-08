import { Signal, signal } from '@angular/core';
import { FormGroup } from '@angular/forms';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
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
  let fixture: ComponentFixture<KanbanComponent>;
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
        provideRouter([]),
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
        { provide: RmaService, useValue: { listBoard: () => of(TEST_RMAS), getById: (id: number) => of(TEST_RMAS.find((rma) => rma.id === id)) } },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(KanbanComponent);
    component = fixture.componentInstance as unknown as KanbanHarness;
  });

  it('does not show the permanent drag instruction in the header', () => {
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).not.toContain('Arraste os cards entre as colunas');
  });

  it('shows the four indicators in a single compact summary', () => {
    fixture.detectChanges();
    const summary: HTMLElement | null = fixture.nativeElement.querySelector('.kanban-summary');
    expect(summary).not.toBeNull();
    expect(fixture.nativeElement.querySelector('.stats-grid')).toBeNull();
    expect(fixture.nativeElement.querySelector('.stat-card')).toBeNull();
    for (const label of ['Em andamento', 'Alta prioridade', 'Aguardando peça', 'Encerrados']) {
      expect(summary!.textContent).toContain(label);
    }
  });

  it('shows search, SLA and assignee as quick filters and hides the other eight controls until Filtros is opened', () => {
    fixture.detectChanges();
    const host: HTMLElement = fixture.nativeElement;
    const panel = host.querySelector<HTMLElement>('#kanbanAdvancedFilters');
    const quick = ['query', 'sla', 'assignee'];
    const advanced = ['priority', 'status', 'blocked', 'warranty', 'entryFrom', 'entryTo', 'updatedFrom', 'updatedTo'];
    for (const name of quick) {
      const control = host.querySelector(`[formcontrolname="${name}"]`);
      expect(control, name).not.toBeNull();
      expect(panel?.contains(control) ?? false, name).toBe(false);
    }
    const isHidden = (name: string) => {
      const control = host.querySelector(`[formcontrolname="${name}"]`);
      return control === null || Boolean(control.closest('[hidden]'));
    };
    expect(advanced.filter(isHidden)).toEqual(advanced);

    const toggle = findButton('Filtros');
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect(toggle.getAttribute('aria-controls')).toBe('kanbanAdvancedFilters');
    toggle.click();
    fixture.detectChanges();
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    expect(advanced.filter(isHidden)).toEqual([]);
    expect(Object.keys(component.filtersForm.controls)).toHaveLength(11);
  });

  it('shows an active advanced filter as a removable chip while the panel is closed', () => {
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelectorAll('.board-card')).toHaveLength(2);
    component.filtersForm.patchValue({ priority: 'HIGH' });
    fixture.detectChanges();
    expect(component.advancedFiltersOpen()).toBe(false);
    const chips = chipTexts();
    expect(chips).toEqual(['Prioridade: Alta']);
    expect(fixture.nativeElement.querySelector('[aria-label="Remover filtro Prioridade: Alta"]')).not.toBeNull();
    expect(fixture.nativeElement.querySelectorAll('.board-card')).toHaveLength(1);
    expect(findButton('Filtros').textContent).toContain('1');
  });

  it('really hides the advanced panel when collapsed and shows it when expanded', () => {
    fixture.detectChanges();
    const panel = fixture.nativeElement.querySelector('#kanbanAdvancedFilters') as HTMLElement;
    expect(panel.hidden).toBe(true);
    expect(getComputedStyle(panel).display).toBe('none');
    findButton('Filtros').click();
    fixture.detectChanges();
    expect(panel.hidden).toBe(false);
    expect(getComputedStyle(panel).display).toBe('grid');
    findButton('Filtros').click();
    fixture.detectChanges();
    expect(panel.hidden).toBe(true);
    expect(getComputedStyle(panel).display).toBe('none');
  });

  it('moves focus to the next chip, then the previous one, then the Filtros toggle when chips are removed', async () => {
    component.filtersForm.patchValue({ priority: 'HIGH', status: 'TRIAGE', warranty: WarrantyStatus.IN_WARRANTY });
    fixture.detectChanges();
    const removeButton = (label: string) =>
      fixture.nativeElement.querySelector(`[aria-label="Remover filtro ${label}"]`) as HTMLButtonElement;
    const remove = async (label: string) => {
      const button = removeButton(label);
      button.focus();
      button.click();
      fixture.detectChanges();
      await fixture.whenStable();
    };

    await remove('Prioridade: Alta');
    expect(document.activeElement).toBe(removeButton('Status: Triagem'));

    await remove('Garantia: Em garantia');
    expect(document.activeElement).toBe(removeButton('Status: Triagem'));

    await remove('Status: Triagem');
    expect(chipTexts()).toEqual([]);
    expect(document.activeElement).toBe(findButton('Filtros'));
  });

  it('removes only the clicked chip', () => {
    component.filtersForm.patchValue({ priority: 'HIGH', status: 'TRIAGE' });
    fixture.detectChanges();
    expect(component.activeFilterCount()).toBe(2);
    expect(chipTexts()).toEqual(['Prioridade: Alta', 'Status: Triagem']);
    (fixture.nativeElement.querySelector('[aria-label="Remover filtro Status: Triagem"]') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(component.activeFilterCount()).toBe(1);
    expect(component.filtersForm.getRawValue()).toEqual(expect.objectContaining({ priority: 'HIGH', status: 'all' }));
    expect(chipTexts()).toEqual(['Prioridade: Alta']);
  });

  it('keeps the active view selected when a chip is removed', () => {
    component.filtersForm.patchValue({ priority: 'HIGH', warranty: WarrantyStatus.IN_WARRANTY });
    component.openCreateViewModal();
    component.viewForm.patchValue({ name: 'Garantia' });
    component.saveView();
    fixture.detectChanges();
    component.removeFilter('warranty');
    expect(component.activeViewId()).toBe(5);
    expect(component.filtersForm.getRawValue()).toEqual(expect.objectContaining({ priority: 'HIGH', warranty: 'all' }));
  });

  it('labels date, assignee and search chips with readable values', () => {
    component.filtersForm.patchValue({ entryFrom: '2026-10-10', assignee: 'unassigned', query: '  arvore ' });
    expect(component.activeFilterChips().map((chip) => chip.label)).toEqual(['Entrada a partir de: 10/10/2026']);
    component.filtersForm.patchValue({ blocked: 'blocked', warranty: WarrantyStatus.IN_WARRANTY });
    expect(component.activeFilterChips().map((chip) => chip.key)).toEqual(['blocked', 'warranty', 'entryFrom']);
  });

  it('keeps saved views usable in a single row', () => {
    fixture.detectChanges();
    const host: HTMLElement = fixture.nativeElement;
    expect(host.textContent).not.toContain('Salve e reaplique');
    expect(host.querySelector('.kanban-views [aria-label="Visualização salva do Kanban"]')).not.toBeNull();
    expect(findButton('Salvar atual')).toBeTruthy();
    const optionalButtons = () =>
      ['Renomear', 'Tornar padrão', 'Excluir'].filter((text) =>
        [...host.querySelectorAll<HTMLButtonElement>('.kanban-views button')].some((button) => button.textContent?.trim() === text),
      );
    expect(optionalButtons()).toEqual([]);
    component.openCreateViewModal();
    component.viewForm.patchValue({ name: 'Críticos' });
    component.saveView();
    fixture.detectChanges();
    expect(optionalButtons()).toEqual(['Renomear', 'Tornar padrão', 'Excluir']);
  });

  function findButton(text: string): HTMLButtonElement {
    const button = [...fixture.nativeElement.querySelectorAll('button')].find((item: HTMLButtonElement) =>
      item.textContent?.trim().startsWith(text),
    ) as HTMLButtonElement | undefined;
    expect(button, text).toBeDefined();
    return button!;
  }

  function chipTexts(): string[] {
    return [...fixture.nativeElement.querySelectorAll('.kanban-chip__label')].map((chip: HTMLElement) => chip.textContent!.trim());
  }

  it('opens the detail modal when a card is clicked and closes it', () => {
    fixture.detectChanges();
    fixture.nativeElement.querySelector('.board-card').click();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('app-rma-detail-modal .rma-detail')).not.toBeNull();
    fixture.nativeElement.querySelector('app-rma-detail-modal .modal-close').click();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('app-rma-detail-modal')).toBeNull();
  });

  it('closes the detail modal with Escape only when no other modal covers it', () => {
    fixture.detectChanges();
    component.openDetail(TEST_RMAS[0]);
    fixture.detectChanges();
    clickDetailButton('Alterar status');
    expect(fixture.nativeElement.querySelectorAll('.modal-overlay').length).toBe(2);
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('app-rma-detail-modal')).not.toBeNull();
    fixture.nativeElement.querySelectorAll('.modal-overlay')[1].querySelector('.modal-close').click();
    fixture.detectChanges();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('app-rma-detail-modal')).toBeNull();
  });

  it('opens the status and assignment modals from the detail modal', () => {
    fixture.detectChanges();
    component.openDetail(TEST_RMAS[0]);
    fixture.detectChanges();
    clickDetailButton('Alterar status');
    expect(fixture.nativeElement.textContent).toContain('Novo status');
    fixture.nativeElement.querySelectorAll('.modal-overlay')[1].querySelector('.modal-close').click();
    fixture.detectChanges();
    clickDetailButton('responsável');
    expect(fixture.nativeElement.textContent).toContain('Novo responsável');
  });

  function clickDetailButton(text: string): void {
    const button = [...fixture.nativeElement.querySelectorAll('app-rma-detail-modal button')].find((item: HTMLButtonElement) => item.textContent?.includes(text)) as HTMLButtonElement;
    button.click();
    fixture.detectChanges();
  }

  it('preserves selection and filters when inspecting impediments from the detail modal', () => {
    component.filtersForm.patchValue({ priority: 'HIGH' });
    fixture.detectChanges();
    component.openDetail(TEST_RMAS[1]);
    fixture.detectChanges();
    const inspect = [...fixture.nativeElement.querySelectorAll('app-rma-detail-modal button')].find((button: HTMLButtonElement) => button.textContent?.includes('Ver impedimentos')) as HTMLButtonElement;
    inspect.click();
    fixture.detectChanges();
    const dialog: HTMLDialogElement = fixture.nativeElement.querySelector('app-rma-block-panel dialog');
    expect(dialog.open).toBe(true);
    dialog.querySelector<HTMLButtonElement>('button')!.click();
    expect(component.selectedRmaId()).toBe(2);
    expect(component.filtersForm.getRawValue().priority).toBe('HIGH');
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

  it('combines blockage with existing filters, persists it and clears it', () => {
    Object.assign(TEST_RMAS[0], { currentBlock: { id: 9, reason: 'Peça pendente' } });
    component.filtersForm.patchValue({ blocked: 'blocked', priority: 'HIGH' });
    expect(component.filteredRmas().map((rma) => rma.id)).toEqual([1]);
    component.openCreateViewModal();
    component.viewForm.patchValue({ name: 'Impedidos' });
    component.saveView();
    expect(createdViewRequest?.filters).toEqual(expect.objectContaining({ blocked: true }));
    component.filtersForm.patchValue({ blocked: 'unblocked', priority: 'all' });
    expect(component.filteredRmas().map((rma) => rma.id)).toEqual([2]);
    component.applyView(5);
    expect(component.filtersForm.getRawValue().blocked).toBe('blocked');
    component.clearFilters();
    expect(component.filteredRmas()).toHaveLength(2);
    expect(component.filtersForm.getRawValue().blocked).toBe('all');
    Object.assign(TEST_RMAS[0], { currentBlock: null });
  });

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
  selectedRmaId: Signal<number | null>;
  selectRma(rma: RmaResponse): void;
  openDetail(rma: RmaResponse): void;
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
  advancedFiltersOpen: Signal<boolean>;
  activeFilterChips: Signal<ReadonlyArray<{ key: string; label: string }>>;
  removeFilter(key: string): void;
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
    currentBlock: null,
    blockHistory: [],
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
