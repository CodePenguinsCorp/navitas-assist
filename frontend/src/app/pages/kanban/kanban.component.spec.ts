import { Signal, signal } from '@angular/core';
import { FormGroup } from '@angular/forms';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { Subject, of, throwError } from 'rxjs';
import { KanbanViewRequest, KanbanViewResponse, RmaResponse, WarrantyStatus } from '../../core/models';
import { SlaClockService } from '../../core/services/sla-clock.service';
import { CatalogService } from '../../core/services/catalog.service';
import { KanbanViewService } from '../../core/services/kanban-view.service';
import { LoadingService } from '../../core/services/loading.service';
import { RmaService } from '../../core/services/rma.service';
import { BulkRmaResult } from '../../shared/kanban-bulk-actions/kanban-bulk-actions.component';
import { KanbanComponent } from './kanban.component';
import { mountUnderRoot, simulateNativeModality } from '../../testing/native-dialog';
import { profilePermissions, providePermissions } from '../../testing/permission-fixtures';

describe('KanbanComponent filters', () => {
  let component: KanbanHarness;
  let fixture: ComponentFixture<KanbanComponent>;
  let now = signal(Date.parse('2026-10-20T12:00:00Z'));
  let createdViewRequest: KanbanViewRequest | null;
  let failCreateView: boolean;
  let assigneeUpdates: Array<[number, { assigneeId: number | null }]>;
  let failAssignee: boolean;

  beforeEach(async () => {
    now = signal(Date.parse('2026-10-20T12:00:00Z'));
    createdViewRequest = null;
    failCreateView = false;
    assigneeUpdates = [];
    failAssignee = false;
    await TestBed.configureTestingModule({
      imports: [KanbanComponent],
      providers: [
        provideRouter([]),
        { provide: SlaClockService, useValue: { now } },
        providePermissions(profilePermissions('ADMIN')),
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
        {
          provide: RmaService,
          useValue: {
            listBoard: () => of(TEST_RMAS),
            getById: (id: number) => of(TEST_RMAS.find((rma) => rma.id === id)),
            updateAssignee: (id: number, payload: { assigneeId: number | null }) => {
              assigneeUpdates.push([id, payload]);
              if (failAssignee) return throwError(() => ({ error: { message: 'Técnico inativo' } }));
              return of({ ...TEST_RMAS.find((rma) => rma.id === id)!, assigneeId: payload.assigneeId });
            },
          },
        },
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
    const summary: HTMLElement | null = fixture.nativeElement.querySelector('.page-summary');
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

  function saveCurrentAsView(name: string): void {
    component.openCreateViewModal();
    component.viewForm.patchValue({ name });
    component.saveView();
    fixture.detectChanges();
  }

  it('deselects the saved view when a chip removal makes the filters differ from it', () => {
    component.filtersForm.patchValue({ priority: 'HIGH', warranty: WarrantyStatus.IN_WARRANTY });
    saveCurrentAsView('Garantia');
    expect(component.activeViewId()).toBe(5);
    component.removeFilter('warranty');
    expect(component.activeViewId()).toBeNull();
    expect(component.filtersForm.getRawValue()).toEqual(expect.objectContaining({ priority: 'HIGH', warranty: 'all' }));
    expect(createdViewRequest?.filters).toEqual(expect.objectContaining({ warranty: WarrantyStatus.IN_WARRANTY }));
  });

  it('deselects the saved view on a manual edit, including SLA, and keeps it when the values come back equal', () => {
    component.filtersForm.patchValue({ priority: 'HIGH', query: 'árvore' });
    saveCurrentAsView('Críticos');
    component.filtersForm.patchValue({ query: '  árvore  ' });
    expect(component.activeViewId(), 'surrounding spaces are not a different search').toBe(5);
    component.filtersForm.patchValue({ sla: 'OVERDUE' });
    expect(component.activeViewId()).toBeNull();
    component.applyView(5);
    expect(component.activeViewId()).toBe(5);
    component.filtersForm.patchValue({ entryFrom: '2026-10-01' });
    expect(component.activeViewId()).toBeNull();
  });

  it('keeps the view selected after renaming it', () => {
    component.filtersForm.patchValue({ priority: 'HIGH' });
    saveCurrentAsView('Críticos');
    (component as unknown as { openRenameViewModal(): void }).openRenameViewModal();
    component.viewForm.patchValue({ name: 'Urgentes' });
    component.saveView();
    fixture.detectChanges();
    expect(component.activeViewId()).toBe(5);
    expect(component.filtersForm.getRawValue().priority).toBe('HIGH');
  });

  it('still moves focus to the Filtros toggle after the last chip of a saved view is removed', async () => {
    component.filtersForm.patchValue({ priority: 'HIGH' });
    saveCurrentAsView('Críticos');
    const remove = fixture.nativeElement.querySelector('[aria-label="Remover filtro Prioridade: Alta"]') as HTMLButtonElement;
    remove.focus();
    remove.click();
    fixture.detectChanges();
    await fixture.whenStable();
    expect(component.activeViewId()).toBeNull();
    expect(document.activeElement).toBe(findButton('Filtros'));
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
    chooseDetailStatus('IN_REPAIR');
    expect(fixture.nativeElement.querySelectorAll('.modal-overlay').length).toBe(2);
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    fixture.detectChanges();
    // Only the status confirmation on top reacts; the detail below stays open.
    expect(fixture.nativeElement.querySelector('app-rma-detail-modal')).not.toBeNull();
    expect(fixture.nativeElement.querySelectorAll('.modal-overlay').length).toBe(1);
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('app-rma-detail-modal')).toBeNull();
  });

  it('opens the status dialog with the stage picked in the detail selector', () => {
    fixture.detectChanges();
    component.openDetail(TEST_RMAS[0]);
    fixture.detectChanges();
    chooseDetailStatus('IN_REPAIR');
    expect(fixture.nativeElement.textContent).toContain('Novo status');
    expect(component.statusForm.getRawValue()).toEqual({ status: 'IN_REPAIR', note: '' });
    expect(fixture.nativeElement.querySelector('#kanbanStatusNote')).not.toBeNull();
  });

  it('opens the status and assignment modals from the detail modal', () => {
    fixture.detectChanges();
    component.openDetail(TEST_RMAS[0]);
    fixture.detectChanges();
    chooseDetailStatus('IN_REPAIR');
    expect(fixture.nativeElement.textContent).toContain('Novo status');
    fixture.nativeElement.querySelectorAll('.modal-overlay')[1].querySelector('.modal-close').click();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelectorAll('.modal-overlay').length).toBe(1);
  });

  it('saves the assignee picked in the detail selector through the existing service, without a dialog', () => {
    fixture.detectChanges();
    component.openDetail(TEST_RMAS[0]);
    fixture.detectChanges();
    chooseDetailAssignee('Sem responsável');
    expect(assigneeUpdates).toEqual([[TEST_RMAS[0].id, { assigneeId: null }]]);
    expect(fixture.nativeElement.querySelectorAll('.modal-overlay').length).toBe(1);
    expect(fixture.nativeElement.textContent).not.toContain('Novo responsável');
  });

  it('shows a failed inline assignment inside the detail modal', () => {
    failAssignee = true;
    fixture.detectChanges();
    component.openDetail(TEST_RMAS[0]);
    fixture.detectChanges();
    chooseDetailAssignee('Sem responsável');
    expect(fixture.nativeElement.querySelector('app-rma-detail-modal [role="alert"]')?.textContent).toContain('Técnico inativo');
    expect(fixture.nativeElement.querySelector('app-rma-detail-modal')).not.toBeNull();
  });

  function chooseDetailAssignee(name: string): void {
    fixture.nativeElement.querySelector('app-rma-detail-modal .rma-detail__assignee-picker .custom-select__trigger').click();
    fixture.detectChanges();
    const option = [...fixture.nativeElement.querySelectorAll('app-rma-detail-modal .rma-detail__assignee-picker .custom-select__option')]
      .find((item: HTMLElement) => item.querySelector('.custom-select__name')?.textContent?.trim() === name) as HTMLButtonElement;
    option.click();
    fixture.detectChanges();
  }

  function chooseDetailStatus(status: string): void {
    fixture.nativeElement.querySelector('app-rma-detail-modal .rma-detail__status .custom-select__trigger').click();
    fixture.detectChanges();
    fixture.nativeElement.querySelector(`app-rma-detail-modal .custom-select__option[data-status="${status}"]`).click();
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

  it('does not mark the saved view as active when SLA, which views do not persist, is filtering the board', () => {
    component.filtersForm.patchValue({ priority: 'HIGH', sla: 'OVERDUE' });
    component.openCreateViewModal();
    component.viewForm.patchValue({ name: 'Atrasados', defaultView: false });

    component.saveView();

    expect(createdViewRequest).toEqual(expect.objectContaining({ name: 'Atrasados' }));
    expect(component.filtersForm.getRawValue().sla).toBe('OVERDUE');
    expect(component.activeViewId()).toBeNull();
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
  statusForm: FormGroup;
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
    }, dueDate: null, deadline: { status: 'NO_DUE_DATE', dueSoonFrom: null, daysUntilDue: null }, stagePeriods: [{ status: 'RECEIVED', enteredAt: '2026-10-20T11:00:00Z', leftAt: null, durationSeconds: 0 }], dueDateHistory: [],
    createdAt: '2026-10-10T12:00:00Z',
    updatedAt: values.updatedAt,
  };
}

describe('KanbanComponent dialog focus', () => {
  let fixture: ComponentFixture<KanbanComponent>;
  let page: HTMLElement;
  let loading: LoadingService;
  let statusSave: Subject<RmaResponse>;
  let viewSave: Subject<KanbanViewResponse>;
  let assigneeSave: Subject<RmaResponse>;

  beforeEach(async () => {
    vi.useFakeTimers();
    await TestBed.configureTestingModule({
      imports: [KanbanComponent],
      providers: [
        provideRouter([]),
        { provide: SlaClockService, useValue: { now: signal(Date.parse('2026-10-20T12:00:00Z')) } },
        providePermissions(profilePermissions('ADMIN')),
        { provide: CatalogService, useValue: { listAssignableUsers: () => of([]) } },
        {
          provide: KanbanViewService,
          useValue: { list: () => of([]), create: () => (viewSave = new Subject<KanbanViewResponse>()) },
        },
        {
          provide: RmaService,
          useValue: {
            listBoard: () => of(TEST_RMAS),
            getById: (id: number) => of(TEST_RMAS.find((rma) => rma.id === id)),
            updateStatus: () => (statusSave = new Subject<RmaResponse>()),
            updateAssignee: () => (assigneeSave = new Subject<RmaResponse>()),
          },
        },
      ],
    }).compileComponents();
    fixture = TestBed.createComponent(KanbanComponent);
    page = fixture.nativeElement as HTMLElement;
    loading = TestBed.inject(LoadingService);
    render();
  });

  afterEach(() => vi.useRealTimers());

  function render(): void {
    fixture.detectChanges();
    TestBed.tick();
  }

  function find<T extends HTMLElement = HTMLElement>(selector: string): T {
    const found = page.querySelector<T>(selector);
    expect(found, selector + ' must exist').not.toBeNull();
    return found!;
  }

  function button(root: ParentNode, text: string): HTMLButtonElement {
    const found = [...root.querySelectorAll<HTMLButtonElement>('button')].find((item) => item.textContent?.trim().startsWith(text));
    expect(found, text).toBeDefined();
    return found!;
  }

  function press(key: string): KeyboardEvent {
    const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true });
    (document.activeElement ?? document.body).dispatchEvent(event);
    render();
    return event;
  }

  function activate(target: HTMLElement): HTMLElement {
    target.focus();
    target.click();
    render();
    return target;
  }

  function openDetailFromCard(): HTMLElement {
    return activate(find('.board-card'));
  }

  const detail = () => page.querySelector<HTMLElement>('app-rma-detail-modal .rma-detail');
  const statusTrigger = () => find<HTMLButtonElement>('app-rma-detail-modal .rma-detail__status .custom-select__trigger');
  const statusDialog = () => page.querySelector<HTMLElement>('[aria-labelledby="kanban-status-title"]');
  const viewDialog = () => page.querySelector<HTMLElement>('[aria-labelledby="kanban-view-title"]');

  function confirmStatusFromDetail(status: string): void {
    activate(statusTrigger());
    find<HTMLButtonElement>(`app-rma-detail-modal .custom-select__option[data-status="${status}"]`).click();
    render();
  }

  it('names the view and status dialogs for assistive technology', () => {
    activate(button(page, 'Salvar atual'));
    expect(viewDialog()?.getAttribute('role')).toBe('dialog');
    expect(viewDialog()?.getAttribute('aria-modal')).toBe('true');
    expect(find('#kanban-view-title').textContent?.trim()).toBe('Salvar visualização');
    button(viewDialog()!, 'Cancelar').click();
    render();
    openDetailFromCard();
    confirmStatusFromDetail('IN_REPAIR');
    expect(statusDialog()?.getAttribute('role')).toBe('dialog');
    expect(statusDialog()?.getAttribute('aria-modal')).toBe('true');
    expect(find('#kanban-status-title').textContent?.trim()).toBe('Status');
  });

  it('focuses the detail panel from its card and returns to the card on Escape', () => {
    const card = openDetailFromCard();
    expect(document.activeElement).toBe(detail());
    expect(press('Escape').defaultPrevented).toBe(true);
    expect(detail()).toBeNull();
    expect(document.activeElement).toBe(card);
  });

  it('closes only the status selector, then only the confirmation, returning to the detail selector', () => {
    openDetailFromCard();
    activate(statusTrigger());
    expect(page.querySelector('app-rma-detail-modal .custom-select__menu')).not.toBeNull();
    press('Escape');
    expect(page.querySelector('app-rma-detail-modal .custom-select__menu')).toBeNull();
    expect(detail()).not.toBeNull();
    expect(document.activeElement).toBe(statusTrigger());

    confirmStatusFromDetail('IN_REPAIR');
    expect(document.activeElement).toBe(find('[aria-labelledby="kanban-status-title"] app-custom-select .custom-select__trigger'));
    expect(press('Escape').defaultPrevented).toBe(true);
    expect(statusDialog()).toBeNull();
    expect(detail()).not.toBeNull();
    expect(document.activeElement).toBe(statusTrigger());
  });

  it('keeps Tab from an open selector menu under the selector, without option stops', () => {
    openDetailFromCard();
    statusTrigger().focus();
    press('ArrowDown');
    const option = document.activeElement as HTMLElement;
    expect(option.getAttribute('role')).toBe('option');
    press('Tab');
    expect(page.querySelector('app-rma-detail-modal .custom-select__menu')).toBeNull();
    expect(document.activeElement).toBe(statusTrigger());
    press('Tab');
    expect(detail()!.contains(document.activeElement)).toBe(true);
    expect((document.activeElement as HTMLElement).getAttribute('role')).not.toBe('option');
  });

  it('keeps the detail open on Escape while its inline assignment is saved', () => {
    openDetailFromCard();
    activate(find('app-rma-detail-modal .rma-detail__assignee-picker .custom-select__trigger'));
    const option = [...page.querySelectorAll<HTMLButtonElement>('app-rma-detail-modal .rma-detail__assignee-picker .custom-select__option')]
      .find((item) => item.querySelector('.custom-select__name')?.textContent?.trim() === 'Sem responsável')!;
    option.click();
    render();
    expect(press('Escape').defaultPrevented).toBe(false);
    expect(detail()).not.toBeNull();
    assigneeSave.next({ ...TEST_RMAS[0], assigneeId: null });
    assigneeSave.complete();
    render();
    press('Escape');
    expect(detail()).toBeNull();
  });

  it('focuses Nome in the view dialog, ignores Escape while saving and returns to Salvar atual', () => {
    const trigger = activate(button(page, 'Salvar atual'));
    const name = find<HTMLInputElement>('#kanbanViewName');
    expect(document.activeElement).toBe(name);
    name.value = 'Críticos';
    name.dispatchEvent(new Event('input', { bubbles: true }));
    find('[aria-labelledby="kanban-view-title"] form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    render();
    expect(press('Escape').defaultPrevented).toBe(false);
    expect(viewDialog()).not.toBeNull();
    viewSave.error({ error: { message: 'Falha ao salvar' } });
    render();
    expect(press('Escape').defaultPrevented).toBe(true);
    expect(viewDialog()).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });

  it('opens impediments over the detail with focus on its title and returns to Ver impedimentos', () => {
    openDetailFromCard();
    const inspect = activate(button(find('app-rma-detail-modal'), 'Ver impedimentos'));
    const dialog = find<HTMLDialogElement>('app-rma-block-panel dialog');
    expect(dialog.open).toBe(true);
    expect(document.activeElement).toBe(find('#block-panel-title'));
    expect(loading.visible()).toBe(false);
    for (let node: HTMLElement | null = dialog; node; node = node.parentElement) {
      expect(node.inert, 'the native dialog and its ancestors stay interactive').toBe(false);
    }
    expect(press('Escape').defaultPrevented, 'the detail below ignores Escape').toBe(false);
    expect(detail()).not.toBeNull();
    button(dialog, 'Fechar').click();
    render();
    expect(dialog.open).toBe(false);
    expect(detail()).not.toBeNull();
    expect(document.activeElement).toBe(inspect);
    expect(find('.kanban-page').closest('[inert]'), 'the page stays behind the detail').not.toBeNull();
    press('Escape');
    expect(detail()).toBeNull();
  });
});

describe('KanbanComponent dialog focus under the root blocker', () => {
  let fixture: ComponentFixture<unknown>;
  let page: HTMLElement;
  let loading: LoadingService;
  let statusSave: Subject<RmaResponse>;
  let restoreModality: () => void;

  beforeEach(async () => {
    // Under the real root, whose blocker takes focus on showModal() as in a browser.
    restoreModality = simulateNativeModality();
    await TestBed.configureTestingModule({
      imports: [KanbanComponent],
      providers: [
        provideRouter([{ path: '', component: KanbanComponent }]),
        { provide: SlaClockService, useValue: { now: signal(Date.parse('2026-10-20T12:00:00Z')) } },
        providePermissions(profilePermissions('ADMIN')),
        { provide: CatalogService, useValue: { listAssignableUsers: () => of([]) } },
        { provide: KanbanViewService, useValue: { list: () => of([]) } },
        {
          provide: RmaService,
          useValue: {
            listBoard: () => of(TEST_RMAS),
            getById: (id: number) => of(TEST_RMAS.find((rma) => rma.id === id)),
            updateStatus: () => (statusSave = new Subject<RmaResponse>()),
          },
        },
      ],
    }).compileComponents();
    ({ fixture, element: page } = await mountUnderRoot(KanbanComponent));
    vi.useFakeTimers();
    loading = TestBed.inject(LoadingService);
    render();
  });

  afterEach(() => {
    TestBed.resetTestingModule();
    vi.useRealTimers();
    restoreModality();
  });

  function render(): void {
    fixture.detectChanges();
    TestBed.tick();
  }

  function find<T extends HTMLElement = HTMLElement>(selector: string): T {
    const found = page.querySelector<T>(selector);
    expect(found, selector + ' must exist').not.toBeNull();
    return found!;
  }

  function activate(target: HTMLElement): HTMLElement {
    target.focus();
    target.click();
    render();
    return target;
  }

  function press(key: string): KeyboardEvent {
    const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true });
    (document.activeElement ?? document.body).dispatchEvent(event);
    render();
    return event;
  }

  const blocker = () => (fixture.nativeElement as HTMLElement).querySelector<HTMLDialogElement>('dialog.global-loading-dialog')!;
  const statusTrigger = () => find<HTMLButtonElement>('app-rma-detail-modal .rma-detail__status .custom-select__trigger');
  const statusDialog = () => page.querySelector<HTMLElement>('[aria-labelledby="kanban-status-title"]');

  it('ignores Escape while the status change is saved and returns once after the global overlay hides', () => {
    activate(find('.board-card'));
    activate(statusTrigger());
    find<HTMLButtonElement>('app-rma-detail-modal .custom-select__option[data-status="IN_REPAIR"]').click();
    render();
    find('[aria-labelledby="kanban-status-title"] form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    render();
    expect(press('Escape').defaultPrevented).toBe(false);
    expect(statusDialog()).not.toBeNull();

    loading.start();
    vi.advanceTimersByTime(200);
    render();
    expect(blocker().open, 'the root blocker is shown').toBe(true);
    expect(statusDialog()!.contains(document.activeElement), 'the blocker took focus away from the dialog').toBe(false);

    const trigger = statusTrigger();
    const focus = vi.spyOn(trigger, 'focus');
    statusSave.next({ ...TEST_RMAS[0], status: 'IN_REPAIR' });
    statusSave.complete();
    render();
    expect(statusDialog()).toBeNull();
    expect(document.activeElement).not.toBe(trigger);

    loading.finish();
    vi.advanceTimersByTime(400);
    render();
    expect(blocker().open).toBe(false);
    expect(document.activeElement).toBe(statusTrigger());
    expect(focus).toHaveBeenCalledTimes(1);
  });
});
