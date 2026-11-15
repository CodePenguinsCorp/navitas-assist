import { TipDirective } from '../../shared/tip/tip.directive';
import { IconComponent, IconName } from '../../shared/icon/icon.component';
import {
  Component,
  DestroyRef,
  ElementRef,
  Injector,
  afterNextRender,
  computed,
  inject,
  signal,
  viewChild,
  viewChildren,
} from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { Subscription, distinctUntilChanged, finalize, forkJoin, map, of } from 'rxjs';
import {
  CLOSED_RMA_STATUSES,
  RMA_PRIORITY_LABELS,
  RMA_STATUS_FLOW,
  RMA_STATUS_LABELS,
  WARRANTY_STATUS_LABELS,
} from '../../core/mock-data';
import {
  AssignableUserResponse,
  KanbanViewFilters,
  KanbanViewRequest,
  KanbanViewResponse,
  RmaPriority,
  RmaAssigneeUpdateRequest,
  RmaBoardCardResponse,
  RmaBoardCountsResponse,
  RmaBoardFilters,
  RmaBoardPageResponse,
  RmaResponse,
  RmaStatus,
  WarrantyStatus,
} from '../../core/models';
import { DEADLINE_FILTER_OPTIONS, DeadlineFilterValue } from '../../core/utils/rma-deadline';
import { PermissionService } from '../../core/services/permission.service';
import { CatalogService } from '../../core/services/catalog.service';
import { KanbanViewService } from '../../core/services/kanban-view.service';
import { RmaService } from '../../core/services/rma.service';
import { extractHttpErrorMessage } from '../../core/utils/catalog-ui';
import { boardProductSummary, formatDate, normalizeText, statusLabel, toBoardCard } from '../../core/utils/rma-ui';
import {
  CustomSelectComponent,
  CustomSelectOption,
} from '../../shared/form-controls/custom-select/custom-select.component';
import { BoundedFilterPanelsDirective } from '../../shared/form-controls/bounded-filter-panels.directive';
import { DatePickerComponent } from '../../shared/form-controls/date-picker/date-picker.component';
import { PageHeaderComponent } from '../../shared/page-header/page-header.component';
import { RmaBoardColumnState, RmaKanbanBoardComponent } from '../../shared/rma-kanban-board/rma-kanban-board.component';
import { ModalFocusDirective } from '../../shared/modal-focus/modal-focus.directive';
import { ToastService } from '../../core/services/toast.service';
import { ErrorDialogComponent } from '../../shared/error-dialog/error-dialog.component';
import { RmaDetailModalComponent } from '../../shared/rma-detail-modal/rma-detail-modal.component';

interface KanbanHeroStat {
  icon: IconName;
  tone: string;
  label: string;
  value: string;
  detail: string;
}

type AssigneeFilterValue = 'all' | 'unassigned' | number;
type PriorityFilterValue = 'all' | RmaPriority;
type StatusFilterValue = 'all' | RmaStatus;
type WarrantyFilterValue = 'all' | WarrantyStatus;

interface KanbanFilterValues {
  blocked: 'all' | 'blocked' | 'unblocked';
  deadline: DeadlineFilterValue;
  query: string;
  priority: PriorityFilterValue;
  status: StatusFilterValue;
  warranty: WarrantyFilterValue;
  assignee: AssigneeFilterValue;
  entryFrom: string;
  entryTo: string;
  updatedFrom: string;
  updatedTo: string;
}

type ViewModalMode = 'create' | 'rename' | null;

/** Filters kept behind the "Filtros" toggle; search, Prazo and assignee stay in the quick row. */
const ADVANCED_FILTER_KEYS = [
  'priority',
  'status',
  'blocked',
  'warranty',
  'entryFrom',
  'entryTo',
  'updatedFrom',
  'updatedTo',
] as const satisfies ReadonlyArray<keyof KanbanFilterValues>;

type AdvancedFilterKey = (typeof ADVANCED_FILTER_KEYS)[number];

interface KanbanFilterChip {
  key: AdvancedFilterKey;
  label: string;
}

const FILTER_LABELS: Record<AdvancedFilterKey, string> = {
  priority: 'Prioridade',
  status: 'Status',
  blocked: 'Impedimentos',
  warranty: 'Garantia',
  entryFrom: 'Entrada a partir de',
  entryTo: 'Entrada até',
  updatedFrom: 'Atualização a partir de',
  updatedTo: 'Atualização até',
};

@Component({
  selector: 'app-kanban',
  imports: [ErrorDialogComponent, TipDirective, IconComponent, 
    ReactiveFormsModule,
    BoundedFilterPanelsDirective,
    CustomSelectComponent,
    DatePickerComponent,
    RmaKanbanBoardComponent,
    RmaDetailModalComponent,
    ModalFocusDirective,
    PageHeaderComponent,
  ],
  templateUrl: './kanban.component.html',
  styleUrl: './kanban.component.css',
})
export class KanbanComponent {
  protected readonly deadlineFilterOptions = DEADLINE_FILTER_OPTIONS;
  private readonly formBuilder = inject(FormBuilder);
  private readonly permissions = inject(PermissionService);
  private readonly catalogService = inject(CatalogService);
  private readonly kanbanViewService = inject(KanbanViewService);
  private readonly rmaService = inject(RmaService);
  private readonly injector = inject(Injector);
  private readonly destroyRef = inject(DestroyRef);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private loadRequest?: Subscription;
  private detailRequest?: Subscription;
  private incrementalRequests = new Subscription();
  private reconcileRequest?: Subscription;
  private queryGeneration = 0;
  private searchTimer?: ReturnType<typeof setTimeout>;
  protected readonly columnStates = signal<Partial<Record<RmaStatus, RmaBoardColumnState>>>({});
  protected readonly liveMessage = signal('');
  protected readonly columnFeedback = computed(() => Object.values(this.columnStates()).some(column => column?.loadingMore || column?.error));
  private readonly countsSignal = signal<RmaBoardCountsResponse | null>(null);
  private readonly overallCount = signal(0);
  private readonly board = viewChild(RmaKanbanBoardComponent);
  private readonly filtersToggle = viewChild.required<ElementRef<HTMLButtonElement>>('filtersToggle');
  private readonly chipRemoveButtons = viewChildren<ElementRef<HTMLButtonElement>>('chipRemove');

  protected readonly loading = signal(true);
  /** Board read state, kept apart from action errors (pageError). */
  protected readonly hasLoaded = signal(false);
  protected readonly loadFailed = signal(false);
  protected readonly loadErrorMessage = signal('');
  protected readonly pageError = signal('');
  /** Failure of an assignment made from the detail selector, shown inside the detail modal. */
  protected readonly assignmentError = signal('');
  protected readonly viewError = signal('');
  protected readonly viewBusy = signal(false);
  protected readonly activeViewId = signal<number | null>(null);
  protected readonly viewModalMode = signal<ViewModalMode>(null);
  protected readonly boardUpdatingId = signal<number | null>(null);
  protected readonly draggedRmaId = signal<number | null>(null);
  protected readonly dragTargetStatus = signal<RmaStatus | null>(null);
  protected readonly selectedRmaId = signal<number | null>(null);
  protected readonly detailRmaId = signal<number | null>(null);

  private readonly rmasSignal = signal<RmaBoardCardResponse[]>([]);
  /** Full detail of the open card, read from `GET /api/rmas/{id}` when the modal opens. */
  private readonly detailSignal = signal<RmaResponse | null>(null);
  protected readonly detailRma = computed(() => {
    const detail = this.detailSignal();
    return detail && detail.id === this.detailRmaId() ? detail : null;
  });
  protected readonly detailError = signal('');
  /** What the card already has, shown in the detail while the full read is in flight. */
  protected readonly detailCard = computed(() => this.rmasSignal().find((rma) => rma.id === this.detailRmaId()) ?? null);
  protected readonly productSummary = boardProductSummary;
  protected readonly statusText = statusLabel;
  private readonly assignableUsersSignal = signal<AssignableUserResponse[]>([]);
  private readonly viewsSignal = signal<KanbanViewResponse[]>([]);
  /** Set by the first change to the filters: a late default view must not overwrite what the person already chose. */
  private filtersEdited = false;
  private readonly toasts = inject(ToastService);
  private readonly cardRevisions = new Map<number, number>();

  protected readonly filtersForm = this.formBuilder.nonNullable.group({
    blocked: ['all' as KanbanFilterValues['blocked']],
    deadline: ['all' as DeadlineFilterValue],
    query: [''],
    priority: ['all' as PriorityFilterValue],
    status: ['all' as StatusFilterValue],
    warranty: ['all' as WarrantyFilterValue],
    assignee: ['all' as AssigneeFilterValue],
    entryFrom: [''],
    entryTo: [''],
    updatedFrom: [''],
    updatedTo: [''],
  });
  private readonly filters = toSignal(
    this.filtersForm.valueChanges.pipe(map(() => this.filtersForm.getRawValue())),
    {
      initialValue: this.filtersForm.getRawValue(),
    },
  );
  protected readonly filteredRmas = this.rmasSignal.asReadonly();
  protected readonly activeFilterCount = computed(() => countActiveFilters(this.filters()));
  protected readonly advancedFiltersOpen = signal(false);
  protected readonly activeFilterChips = computed<ReadonlyArray<KanbanFilterChip>>(() => {
    const filters = this.filters();
    return ADVANCED_FILTER_KEYS.filter((key) => filters[key] !== DEFAULT_KANBAN_FILTERS[key]).map((key) => ({
      key,
      label: `${FILTER_LABELS[key]}: ${this.filterValueLabel(key, filters[key])}`,
    }));
  });
  protected readonly totalRmas = this.overallCount.asReadonly();
  protected readonly activeView = computed(() =>
    this.viewsSignal().find((view) => view.id === this.activeViewId()),
  );
  protected readonly viewSelectOptions = computed<ReadonlyArray<CustomSelectOption<number | null>>>(
    () => [
      { value: null, label: 'Padrão (sem filtros)' },
      ...this.viewsSignal().map((view) => ({
        value: view.id,
        label: `${view.defaultView ? '★ ' : ''}${view.name}`,
      })),
    ],
  );
  protected readonly assignableUsers = this.assignableUsersSignal.asReadonly();
  protected readonly statusSelectOptions = STATUS_SELECT_OPTIONS;
  protected readonly statusFilterOptions = STATUS_FILTER_OPTIONS;
  protected readonly blockedFilterOptions: ReadonlyArray<CustomSelectOption<KanbanFilterValues['blocked']>> = [
    { value: 'all', label: 'Todos os impedimentos' },
    { value: 'blocked', label: 'Bloqueados' },
    { value: 'unblocked', label: 'Não bloqueados' },
  ];
  protected readonly priorityFilterOptions = PRIORITY_FILTER_OPTIONS;
  protected readonly warrantyFilterOptions = WARRANTY_FILTER_OPTIONS;
  protected readonly assigneeFilterOptions = computed<
    ReadonlyArray<CustomSelectOption<AssigneeFilterValue>>
  >(() => [
    { value: 'all', label: 'Todos os responsáveis' },
    { value: 'unassigned', label: 'Sem responsável' },
    ...mergeAssigneeOptions(this.assignableUsersSignal(), this.rmasSignal()),
  ]);
  protected readonly canUpdateStatus = computed(() => this.permissions.hasPermission('rma.status'));
  protected readonly canUpdateAssignee = computed(() => this.permissions.hasPermission('rma.responsavel'));
  /** `rma.editar`: due date, priority and warranty become editable in the detail. */
  protected readonly canEditRma = computed(() => this.permissions.hasPermission('rma.editar'));
  protected readonly activeCount = computed(() => this.countsSignal()?.active ?? 0);
  protected readonly highPriorityCount = computed(() => this.countsSignal()?.highPriority ?? 0);
  protected readonly waitingPartCount = computed(() => this.countsSignal()?.waitingPart ?? 0);
  protected readonly closedCount = computed(() => this.countsSignal()?.closed ?? 0);
  /** Indicators belong to a current successful read: hidden before it and after a failure. */
  protected readonly boardReady = computed(() => this.hasLoaded() && !this.loadFailed() && !this.loading());
  /**
   * First indicator: "Y ordens de serviço" without filter, "X de Y ordens de serviço" with one, with the singular of the last number.
   */
  protected readonly totalSummary = computed(() => {
    if (!this.boardReady()) return null;
    const count = this.countsSignal()?.total ?? 0;
    const overall = this.activeFilterCount() > 0 ? this.totalRmas() : null;
    return { count, overall, label: (overall ?? count) === 1 ? 'OS' : 'OS' };
  });
  protected readonly heroStats = computed<ReadonlyArray<KanbanHeroStat>>(() => [
    {
      label: 'Em andamento',
      icon: 'wrench' as IconName,
      tone: '',
      value: String(this.activeCount()),
      detail: 'Cards ativos no fluxo',
    },
    {
      label: 'Alta prioridade',
      icon: 'flag' as IconName,
      tone: 'tone-danger',
      value: String(this.highPriorityCount()),
      detail: 'Itens que exigem atenção',
    },
    {
      label: 'Aguardando peça',
      icon: 'clock' as IconName,
      tone: 'tone-warning',
      value: String(this.waitingPartCount()),
      detail: 'Possível gargalo atual',
    },
    {
      label: 'Encerrados',
      icon: 'check' as IconName,
      tone: 'tone-success',
      value: String(this.closedCount()),
      detail: 'Concluídos ou devolvidos',
    },
  ]);

  protected readonly viewForm = this.formBuilder.nonNullable.group({
    name: ['', [Validators.required, Validators.maxLength(80)]],
    defaultView: [false],
  });

  constructor() {
    // /kanban?rma=<id> (link from the list) opens that OS; the param is dropped when the detail closes.
    this.route.queryParamMap.pipe(map((params) => params.get('rma')), distinctUntilChanged(), takeUntilDestroyed()).subscribe((value) => this.openRequestedRma(value));
    let previousQuery = this.filtersForm.getRawValue().query;
    this.destroyRef.onDestroy(() => { this.cancelReads(); clearTimeout(this.searchTimer); });
    this.filtersForm.valueChanges.pipe(takeUntilDestroyed()).subscribe(() => {
      this.filtersEdited = true;
      this.releaseDivergentView();
      const query = this.filtersForm.getRawValue().query;
      const debounce = query !== previousQuery;
      previousQuery = query;
      this.cancelReads();
      clearTimeout(this.searchTimer);
      this.columnStates.set({});
      this.rmasSignal.set([]);
      this.loading.set(true);
      if (debounce) this.searchTimer = setTimeout(() => this.loadKanban(), 300);
      else this.loadKanban();
    });
    this.loadKanban();
    this.loadViews();
  }

  protected retryLoad(): void {
    this.loadKanban();
  }

  /** A saved view stays selected only while the eleven filter values still match it. */
  private releaseDivergentView(): void {
    const view = this.activeView();
    if (!view) return;
    const saved = fromPersistedFilters(view.filters);
    const current = this.filtersForm.getRawValue();
    const matches = (Object.keys(saved) as Array<keyof KanbanFilterValues>).every((key) =>
      key === 'query' ? (normalizeText(current.query) ?? '') === saved.query : current[key] === saved[key],
    );
    if (!matches) this.activeViewId.set(null);
  }

  protected openDetail(rma: RmaBoardCardResponse): void {
    this.selectRma(rma);
    this.detailRmaId.set(rma.id);
    this.loadDetail(rma.id);
  }

  protected retryDetail(): void {
    const id = this.detailRmaId();
    if (id !== null) this.loadDetail(id);
  }

  private openRequestedRma(value: string | null): void {
    const id = Number(value);
    if (value === null || !Number.isInteger(id) || id <= 0) return;
    this.selectedRmaId.set(id);
    this.detailRmaId.set(id);
    this.loadDetail(id);
  }

  protected closeDetail(): void {
    if (this.route.snapshot.queryParamMap.has('rma')) void this.router.navigate([], { queryParams: { rma: null }, queryParamsHandling: 'merge', replaceUrl: true });
    this.detailRequest?.unsubscribe();
    this.detailRmaId.set(null);
    this.detailSignal.set(null);
    this.detailError.set('');
    this.assignmentError.set('');
  }

  /** Only the latest detail read counts. Opening a card uses the global loading; the column pages of the infinite scroll (next step) must pass SKIP_GLOBAL_LOADING. */
  private loadDetail(id: number): void {
    this.detailRequest?.unsubscribe();
    this.detailSignal.set(null);
    this.detailError.set('');
    this.detailRequest = this.rmaService.getById(id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (detail) => { if (this.detailRmaId() === id) this.detailSignal.set(detail); },
        error: (error) => { if (this.detailRmaId() === id) this.detailError.set(extractHttpErrorMessage(error, 'Não foi possível carregar a OS.')); },
      });
  }

  protected selectRma(rma: RmaBoardCardResponse): void {
    this.selectedRmaId.set(rma.id);
    this.pageError.set('');
  }

  /** Each write (assignee, status, priority, impediment, due date) replaces only its card with the response. */
  protected applyRmaUpdate(updated: RmaResponse): void {
    if (this.loading()) {
      if (this.detailRmaId() === updated.id) this.detailSignal.set(updated);
      this.loadKanban();
      return;
    }
    const card = toBoardCard(updated);
    const previous = this.rmasSignal().find(rma => rma.id === updated.id);
    this.applyCard(card);
    if (this.detailRmaId() === updated.id) this.detailSignal.set(updated);
    this.reconcileColumns([...new Set([previous?.status ?? card.status, card.status])]);
  }

  protected clearFilters(): void {
    this.filtersForm.reset(DEFAULT_KANBAN_FILTERS);
    this.activeViewId.set(null);
  }

  protected toggleAdvancedFilters(): void {
    this.advancedFiltersOpen.update((open) => !open);
  }

  /** Resets a single filter; a saved view that no longer matches is deselected, as with a manual edit. */
  protected removeFilter(key: keyof KanbanFilterValues): void {
    this.filtersForm.patchValue({ [key]: DEFAULT_KANBAN_FILTERS[key] });
  }

  /**
   * Removes a chip without dropping keyboard focus: it moves to the chip that took its place,
   * otherwise to the previous one, and to the "Filtros" toggle when no chip remains.
   */
  protected removeFilterChip(key: AdvancedFilterKey, index: number): void {
    this.removeFilter(key);
    afterNextRender(
      () => {
        const buttons = this.chipRemoveButtons();
        const target = buttons[Math.min(index, buttons.length - 1)] ?? this.filtersToggle();
        target.nativeElement.focus();
      },
      { injector: this.injector },
    );
  }

  private filterValueLabel(key: AdvancedFilterKey, value: KanbanFilterValues[AdvancedFilterKey]): string {
    const options: ReadonlyArray<CustomSelectOption<unknown>> | null =
      key === 'priority' ? this.priorityFilterOptions
        : key === 'status' ? this.statusFilterOptions
          : key === 'blocked' ? this.blockedFilterOptions
            : key === 'warranty' ? this.warrantyFilterOptions
              : null;
    return options?.find((option) => option.value === value)?.label ?? formatDate(String(value));
  }

  protected applyView(value: unknown): void {
    if (value === null) {
      this.clearFilters();
      return;
    }
    if (typeof value !== 'number') {
      return;
    }

    const view = this.viewsSignal().find((item) => item.id === value);
    if (!view) {
      return;
    }

    this.filtersForm.reset(fromPersistedFilters(view.filters));
    this.activeViewId.set(view.id);
    this.viewError.set('');
  }

  protected openCreateViewModal(): void {
    this.viewForm.reset({ name: '', defaultView: false });
    this.viewModalMode.set('create');
    this.viewError.set('');
  }

  protected openRenameViewModal(): void {
    const view = this.activeView();
    if (!view) {
      return;
    }
    this.viewForm.reset({ name: view.name, defaultView: view.defaultView });
    this.viewModalMode.set('rename');
    this.viewError.set('');
  }

  protected closeViewModal(): void {
    if (!this.viewBusy()) {
      this.viewModalMode.set(null);
    }
  }

  protected saveView(): void {
    if (this.viewForm.invalid) {
      this.viewForm.markAllAsTouched();
      return;
    }

    const mode = this.viewModalMode();
    const currentView = this.activeView();
    if (!mode || (mode === 'rename' && !currentView)) {
      return;
    }

    const raw = this.viewForm.getRawValue();
    const payload: KanbanViewRequest = {
      name: raw.name.trim(),
      defaultView: raw.defaultView,
      filters:
        mode === 'create'
          ? toPersistedFilters(this.filtersForm.getRawValue())
          : currentView!.filters,
    };
    const request =
      mode === 'create'
        ? this.kanbanViewService.create(payload)
        : this.kanbanViewService.update(currentView!.id, payload);

    this.viewBusy.set(true);
    this.viewError.set('');
    request.pipe(finalize(() => this.viewBusy.set(false))).subscribe({
      next: (saved) => {
        this.syncSavedView(saved);
        this.activeViewId.set(saved.id);
        this.releaseDivergentView();
        this.viewModalMode.set(null);
      },
      error: (error) => {
        this.viewError.set(
          extractHttpErrorMessage(error, 'Não foi possível salvar a visualização.'),
        );
      },
    });
  }

  protected makeActiveViewDefault(): void {
    const view = this.activeView();
    if (!view || view.defaultView || this.viewBusy()) {
      return;
    }

    this.viewBusy.set(true);
    this.viewError.set('');
    this.kanbanViewService
      .setDefault(view.id)
      .pipe(finalize(() => this.viewBusy.set(false)))
      .subscribe({
        next: (updated) => this.syncSavedView(updated),
        error: (error) => {
          this.viewError.set(
            extractHttpErrorMessage(error, 'Não foi possível definir a visualização padrão.'),
          );
        },
      });
  }

  protected deleteActiveView(): void {
    const view = this.activeView();
    if (!view || this.viewBusy()) {
      return;
    }

    this.viewBusy.set(true);
    this.viewError.set('');
    this.kanbanViewService
      .delete(view.id)
      .pipe(finalize(() => this.viewBusy.set(false)))
      .subscribe({
        next: () => {
          this.viewsSignal.update((views) => views.filter((item) => item.id !== view.id));
          this.clearFilters();
        },
        error: (error) => {
          this.viewError.set(
            extractHttpErrorMessage(error, 'Não foi possível excluir a visualização.'),
          );
        },
      });
  }

  /** The detail selector is the whole choice (no extra field), so a pick saves right away. */
  protected assignFromDetail(rma: RmaResponse, assigneeId: number | null): void {
    if (!this.canUpdateAssignee() || this.boardUpdatingId() !== null || assigneeId === rma.assigneeId) {
      return;
    }

    this.submitAssigneeUpdate(rma, { assigneeId });
  }

  protected startCardDrag(event: DragEvent, rma: RmaBoardCardResponse): void {
    if (!this.canUpdateStatus() || this.boardUpdatingId() !== null) {
      event.preventDefault();
      return;
    }

    this.draggedRmaId.set(rma.id);
    this.dragTargetStatus.set(null);
    this.selectRma(rma);

    event.dataTransfer?.setData('text/plain', String(rma.id));
    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = 'move';
    }
  }

  protected endCardDrag(): void {
    if (this.boardUpdatingId() === null) {
      this.clearBoardDragState();
    }
  }

  protected allowColumnDrop(event: DragEvent, status: RmaStatus): void {
    if (
      !this.canUpdateStatus() ||
      this.boardUpdatingId() !== null ||
      this.draggedRmaId() === null
    ) {
      return;
    }

    event.preventDefault();
    if (event.dataTransfer) {
      event.dataTransfer.dropEffect = 'move';
    }

    this.dragTargetStatus.set(status);
  }

  protected leaveColumn(status: RmaStatus): void {
    if (this.dragTargetStatus() === status) {
      this.dragTargetStatus.set(null);
    }
  }

  protected dropOnColumn(event: DragEvent, status: RmaStatus, beforeId: number | null = null): void {
    event.preventDefault();
    const dragged = this.rmasSignal().find(item => item.id === this.draggedRmaId());
    if (dragged) this.reorderCard(dragged, status, beforeId);
    this.clearBoardDragState();
  }

  protected moveByKeyboard(rma: RmaBoardCardResponse, direction: number): void {
    if (!this.canUpdateStatus() || this.boardUpdatingId() !== null) return;
    const state = this.columnStates()[rma.status];
    if (!state || state.loadingMore) return;
    const index = state.cards.findIndex(card => card.id === rma.id);
    if (index < 0 || index + direction < 0) return;
    if (index + direction >= state.cards.length) {
      if (state.hasMore) this.loadMore(rma.status);
      return;
    }
    const beforeId = direction < 0 ? state.cards[index - 1].id : state.cards[index + 2]?.id ?? null;
    this.reorderCard(rma, rma.status, beforeId);
  }

  protected reorderCard(rma: RmaBoardCardResponse, status: RmaStatus, beforeId: number | null): void {
    if (!this.canUpdateStatus() || this.boardUpdatingId() !== null) return;
    if (!this.columnStates()[rma.status]?.cards.some(card => card.id === rma.id)) return;
    const target = this.columnStates()[status] ?? { cards: [], total: 0, hasMore: false, loadingMore: false, error: false, nextPage: 1, generation: this.queryGeneration };
    if (beforeId === rma.id) return;
    const current = this.columnStates()[rma.status]!.cards;
    // Dropping a card right where it already is (same column, same neighbour) is not a change: no request, no notice.
    if (status === rma.status && beforeId === (current[current.findIndex(card => card.id === rma.id) + 1]?.id ?? null)) return;
    this.pauseColumnReads();
    const snapshot = this.columnStates();
    const source = snapshot[rma.status]!.cards;
    const originalBefore = source[source.findIndex(card => card.id === rma.id) + 1]?.id ?? null;
    const counts = this.countsSignal();
    const generation = this.queryGeneration;
    const items = target.cards.filter(card => card.id !== rma.id);
    const index = beforeId === null ? items.length : items.findIndex(card => card.id === beforeId);
    if (index < 0) return;
    const afterId = items[index - 1]?.id ?? null;
    const moved = { ...rma, status };
    if (!this.columnStates()[status]) this.setColumn(status, target);
    this.applyCard(moved);
    this.setColumn(status, { cards: [...items.slice(0, index), moved, ...items.slice(index)] });
    this.syncCards();
    this.boardUpdatingId.set(rma.id);
    this.selectedRmaId.set(rma.id);
    this.pageError.set('');
    this.rmaService.updateBoardPosition(rma.id, { status, afterId, beforeId })
      .pipe(takeUntilDestroyed(this.destroyRef), finalize(() => this.boardUpdatingId.set(null)))
      .subscribe({
        next: card => {
          if (generation !== this.queryGeneration) { this.loadKanban(); return; }
          this.applyCard(card);
          const revision = this.cardRevisions.get(card.id);
          this.toasts.show({ message: rma.status === status ? 'Ordem atualizada' : `Movido para ${statusLabel(status)}`, tone: 'success',
            actions: [{ label: 'Desfazer', run: () => {
              const current = this.rmasSignal().find(item => item.id === card.id);
              if (!current || revision !== this.cardRevisions.get(card.id)) {
                this.pageError.set('O status mudou. Não é possível desfazer esta movimentação.'); return;
              }
              this.reorderCard(current, rma.status, originalBefore);
            } }],
          });
          this.liveMessage.set(`${card.code} na posição ${index + 1} de ${statusLabel(status)}.`);
          this.restoreCardFocus(card.id);
          this.reconcileColumns([...new Set([rma.status, status])], card.id);
        },
        error: error => {
          if (generation !== this.queryGeneration) return;
          this.columnStates.set(snapshot); this.countsSignal.set(counts); this.syncCards();
          const message = extractHttpErrorMessage(error, 'Não foi possível mover a OS. Tente novamente.');
          this.pageError.set(message); this.liveMessage.set(message); this.restoreCardFocus(rma.id);
        },
      });
  }

  protected loadMore(status: RmaStatus): void {
    const state = this.columnStates()[status];
    if (!state || state.loadingMore || !state.hasMore || this.boardUpdatingId() !== null) return;
    if (state.nextPage === 0) { this.reconcileColumns([status]); return; }
    const generation = this.queryGeneration;
    this.setColumn(status, { loadingMore: true, error: false });
    this.liveMessage.set(`Carregando mais em ${statusLabel(status)}.`);
    const request = this.rmaService.listBoardColumn({ ...this.serverFilters(), status }, state.nextPage)
      .pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
        next: page => {
          if (generation !== this.queryGeneration) return;
          const existing = this.columnStates()[status]!.cards;
          this.setColumn(status, this.pageState(page, generation, uniqueCards([...existing, ...page.cards])));
          this.syncCards();
          this.liveMessage.set(`${this.columnStates()[status]!.cards.length} de ${page.total} OS em ${statusLabel(status)}.`);
        },
        error: () => {
          if (generation !== this.queryGeneration) return;
          this.setColumn(status, { loadingMore: false, error: true });
          this.liveMessage.set('Não foi possível carregar mais. Tentar novamente.');
        },
      });
    this.incrementalRequests.add(request);
  }

  private cancelReads(): void {
    this.queryGeneration++;
    this.loadRequest?.unsubscribe(); this.reconcileRequest?.unsubscribe();
    this.incrementalRequests.unsubscribe(); this.incrementalRequests = new Subscription();
  }

  private pauseColumnReads(): void {
    this.incrementalRequests.unsubscribe(); this.incrementalRequests = new Subscription();
    this.reconcileRequest?.unsubscribe();
    for (const status of this.visibleStatuses()) {
      if (this.columnStates()[status]?.loadingMore) this.setColumn(status, { loadingMore: false, nextPage: 0, hasMore: true });
    }
  }

  private serverFilters(): RmaBoardFilters { return toPersistedFilters(this.filtersForm.getRawValue()); }

  private visibleStatuses(): RmaStatus[] {
    const status = this.filtersForm.getRawValue().status;
    return RMA_STATUS_FLOW.filter(item => status === 'all' || status === item);
  }

  private pageState(page: RmaBoardPageResponse, generation: number, cards = page.cards): RmaBoardColumnState {
    return { cards, total: page.total, hasMore: page.hasMore, loadingMore: false, error: false, nextPage: page.page + 1, generation };
  }

  private setColumn(status: RmaStatus, patch: Partial<RmaBoardColumnState>): void {
    this.columnStates.update(columns => ({ ...columns, [status]: { ...columns[status]!, ...patch } }));
  }

  private syncCards(): void { this.rmasSignal.set(RMA_STATUS_FLOW.flatMap(status => this.columnStates()[status]?.cards ?? [])); }

  private loadKanban(): void {
    clearTimeout(this.searchTimer);
    this.cancelReads();
    const generation = this.queryGeneration;
    this.loading.set(true);
    const filters = this.serverFilters();
    this.loadRequest = forkJoin({
      pages: forkJoin(this.visibleStatuses().map(status => this.rmaService.listBoardColumn({ ...filters, status }))),
      counts: this.rmaService.getBoardCounts(filters),
      overall: this.rmaService.getBoardCounts(),
      assignableUsers: this.catalogService.listAssignableUsers(),
    }).pipe(takeUntilDestroyed(this.destroyRef), finalize(() => { if (generation === this.queryGeneration) this.loading.set(false); }))
      .subscribe({
        next: ({ pages, counts, overall, assignableUsers }) => {
          if (generation !== this.queryGeneration) return;
          const columns: Partial<Record<RmaStatus, RmaBoardColumnState>> = {};
          this.visibleStatuses().forEach((status, index) => columns[status] = this.pageState(pages[index], generation));
          this.columnStates.set(columns); this.syncCards();
          this.countsSignal.set(counts); this.overallCount.set(overall.total);
          this.assignableUsersSignal.set(assignableUsers); this.syncSelection(this.rmasSignal());
          this.hasLoaded.set(true); this.loadFailed.set(false); this.loadErrorMessage.set('');
        },
        error: error => {
          if (generation !== this.queryGeneration) return;
          this.loadFailed.set(true);
          this.loadErrorMessage.set(extractHttpErrorMessage(error, 'Não foi possível carregar o Kanban.'));
        },
      });
  }

  private applyCard(card: RmaBoardCardResponse): void {
    this.cardRevisions.set(card.id, (this.cardRevisions.get(card.id) ?? 0) + 1);
    const previous = this.rmasSignal().find(item => item.id === card.id);
    if (previous && previous.status !== card.status) this.setColumn(previous.status, {
      cards: this.columnStates()[previous.status]!.cards.filter(item => item.id !== card.id),
      total: Math.max(0, this.columnStates()[previous.status]!.total - 1),
    });
    const target = this.columnStates()[card.status];
    if (target) {
      const exists = target.cards.some(item => item.id === card.id);
      this.setColumn(card.status, { cards: exists ? target.cards.map(item => item.id === card.id ? card : item) : [...target.cards, card], total: target.total + (exists ? 0 : 1) });
    }
    if (previous) this.countsSignal.update(counts => {
      if (!counts) return counts;
      const statusCounts = { ...counts.statusCounts };
      if (previous.status !== card.status) {
        statusCounts[previous.status] = Math.max(0, (statusCounts[previous.status] ?? 0) - 1);
        statusCounts[card.status] = (statusCounts[card.status] ?? 0) + 1;
      }
      const closedDelta = Number(CLOSED_RMA_STATUSES.includes(card.status)) - Number(CLOSED_RMA_STATUSES.includes(previous.status));
      return { ...counts, statusCounts, highPriority: counts.highPriority + Number(card.priority === 'HIGH') - Number(previous.priority === 'HIGH'),
        closed: counts.closed + closedDelta, active: counts.active - closedDelta, waitingPart: statusCounts.WAITING_PART ?? 0 };
    });
    this.syncCards();
  }

  private reconcileColumns(affected: RmaStatus[], focusId?: number): void {
    this.reconcileRequest?.unsubscribe();
    this.incrementalRequests.unsubscribe(); this.incrementalRequests = new Subscription();
    const visible = this.visibleStatuses();
    this.columnStates.update(columns => Object.fromEntries(Object.entries(columns).filter(([status]) => visible.includes(status as RmaStatus))));
    this.syncCards();
    const statuses = [...new Set([...affected, ...visible.filter(status => this.columnStates()[status]?.loadingMore || this.columnStates()[status]?.nextPage === 0)])]
      .filter(status => visible.includes(status) && this.columnStates()[status]);
    const generation = this.queryGeneration;
    const filters = this.serverFilters();
    const requests = statuses.map(status => {
      const count = Math.max(1, Math.ceil(this.columnStates()[status]!.cards.length / 20));
      this.setColumn(status, { nextPage: 0, loadingMore: true, error: false });
      return forkJoin(Array.from({ length: count }, (_, page) => this.rmaService.listBoardColumn({ ...filters, status }, page)));
    });
    this.reconcileRequest = forkJoin({ pages: requests.length ? forkJoin(requests) : of([]), counts: this.rmaService.getBoardCounts(filters) })
      .pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
        next: ({ pages, counts }) => {
          if (generation !== this.queryGeneration) return;
          statuses.forEach((status, index) => {
            const batch = pages[index];
            this.setColumn(status, this.pageState(batch.at(-1)!, generation, uniqueCards(batch.flatMap(page => page.cards))));
          });
          this.countsSignal.set(counts); this.syncCards();
          if (focusId !== undefined) this.restoreCardFocus(focusId);
        },
        error: () => {
          if (generation !== this.queryGeneration) return;
          statuses.forEach(status => this.setColumn(status, { loadingMore: false, error: true, hasMore: true }));
          this.pageError.set('Não foi possível atualizar o quadro. Tente novamente na coluna.');
        },
      });
  }

  private restoreCardFocus(id: number): void {
    afterNextRender(() => {
      if (!this.board()?.focusCard(id)) this.filtersToggle().nativeElement.focus({ preventScroll: true });
    }, { injector: this.injector });
  }

  private loadViews(): void {
    this.kanbanViewService.list().subscribe({
      next: (views) => {
        this.viewsSignal.set(sortViews(views));
        const defaultView = views.find((view) => view.defaultView);
        if (defaultView && !this.filtersEdited) {
          this.applyView(defaultView.id);
        }
      },
      error: (error) => {
        this.viewError.set(
          extractHttpErrorMessage(error, 'Não foi possível carregar as visualizações salvas.'),
        );
      },
    });
  }

  private syncSavedView(saved: KanbanViewResponse): void {
    this.viewsSignal.update((views) =>
      sortViews([
        ...views
          .filter((view) => view.id !== saved.id)
          .map((view) => (saved.defaultView ? { ...view, defaultView: false } : view)),
        saved,
      ]),
    );
  }

  private syncSelection(rmas: RmaBoardCardResponse[]): void {
    const selectedId = this.selectedRmaId();
    if (selectedId === null) {
      return;
    }

    const refreshed = rmas.find((item) => item.id === selectedId);
    if (!refreshed) {
      this.selectedRmaId.set(null);
    }
  }

  private submitAssigneeUpdate(target: Pick<RmaResponse, 'id'>, payload: RmaAssigneeUpdateRequest): void {
    this.boardUpdatingId.set(target.id);
    this.pageError.set('');
    this.assignmentError.set('');

    this.rmaService
      .updateAssignee(target.id, payload)
      .pipe(finalize(() => this.boardUpdatingId.set(null)))
      .subscribe({
        next: (updated) => {
          this.selectedRmaId.set(updated.id);
          this.applyRmaUpdate(updated);
        },
        error: (error) => {
          this.assignmentError.set(
            extractHttpErrorMessage(error, 'Não foi possível atualizar o responsável da OS.'),
          );
        },
      });
  }

  private clearBoardDragState(): void {
    this.draggedRmaId.set(null);
    this.dragTargetStatus.set(null);
  }
}

const STATUS_SELECT_OPTIONS: ReadonlyArray<CustomSelectOption<RmaStatus>> = RMA_STATUS_FLOW.map(
  (status) => ({
    value: status,
    label: RMA_STATUS_LABELS[status],
  }),
);

const DEFAULT_KANBAN_FILTERS: KanbanFilterValues = {
  blocked: 'all',
  deadline: 'all',
  query: '',
  priority: 'all',
  status: 'all',
  warranty: 'all',
  assignee: 'all',
  entryFrom: '',
  entryTo: '',
  updatedFrom: '',
  updatedTo: '',
};

const PRIORITY_FILTER_OPTIONS: ReadonlyArray<CustomSelectOption<PriorityFilterValue>> = [
  { value: 'all', label: 'Todas as prioridades' },
  ...(['HIGH', 'MEDIUM', 'LOW'] as RmaPriority[]).map((priority) => ({
    value: priority,
    label: RMA_PRIORITY_LABELS[priority],
  })),
];

const STATUS_FILTER_OPTIONS: ReadonlyArray<CustomSelectOption<StatusFilterValue>> = [
  { value: 'all', label: 'Todos os status' },
  ...STATUS_SELECT_OPTIONS,
];

const WARRANTY_FILTER_OPTIONS: ReadonlyArray<CustomSelectOption<WarrantyFilterValue>> = [
  { value: 'all', label: 'Todas as garantias' },
  ...Object.values(WarrantyStatus).map((warranty) => ({
    value: warranty,
    label: WARRANTY_STATUS_LABELS[warranty],
  })),
];

function countActiveFilters(filters: KanbanFilterValues): number {
  return Object.entries(filters).filter(([key, value]) => {
    if (key === 'query') {
      return Boolean(String(value).trim());
    }
    return value !== '' && value !== 'all';
  }).length;
}

function mergeAssigneeOptions(
  assignableUsers: AssignableUserResponse[],
  rmas: RmaBoardCardResponse[],
): ReadonlyArray<CustomSelectOption<number>> {
  const options = new Map<number, string>(
    assignableUsers.map((user) => [user.id, `${user.fullName} (@${user.username})`]),
  );

  for (const rma of rmas) {
    if (rma.assigneeId !== null && rma.assigneeName && !options.has(rma.assigneeId)) {
      options.set(rma.assigneeId, rma.assigneeName);
    }
  }

  return [...options.entries()]
    .sort((left, right) => left[1].localeCompare(right[1], 'pt-BR'))
    .map(([value, label]) => ({ value, label }));
}

function toPersistedFilters(filters: KanbanFilterValues): KanbanViewFilters {
  return {
    blocked: filters.blocked === 'all' ? null : filters.blocked === 'blocked',
    query: normalizeText(filters.query),
    priority: filters.priority === 'all' ? null : filters.priority,
    status: filters.status === 'all' ? null : filters.status,
    warranty: filters.warranty === 'all' ? null : filters.warranty,
    assigneeId: typeof filters.assignee === 'number' ? filters.assignee : null,
    unassignedOnly: filters.assignee === 'unassigned',
    entryFrom: filters.entryFrom || null,
    entryTo: filters.entryTo || null,
    updatedFrom: filters.updatedFrom || null,
    updatedTo: filters.updatedTo || null,
    deadline: filters.deadline === 'all' ? null : filters.deadline,
  };
}

function fromPersistedFilters(filters: KanbanViewFilters): KanbanFilterValues {
  return {
    blocked: filters.blocked == null ? 'all' : filters.blocked ? 'blocked' : 'unblocked',
    deadline: filters.deadline ?? 'all',
    query: filters.query ?? '',
    priority: filters.priority ?? 'all',
    status: filters.status ?? 'all',
    warranty: filters.warranty ?? 'all',
    assignee: filters.unassignedOnly ? 'unassigned' : (filters.assigneeId ?? 'all'),
    entryFrom: filters.entryFrom ?? '',
    entryTo: filters.entryTo ?? '',
    updatedFrom: filters.updatedFrom ?? '',
    updatedTo: filters.updatedTo ?? '',
  };
}

function sortViews(views: KanbanViewResponse[]): KanbanViewResponse[] {
  return [...views].sort((left, right) => left.name.localeCompare(right.name, 'pt-BR'));
}

function uniqueCards(cards: RmaBoardCardResponse[]): RmaBoardCardResponse[] {
  const ids = new Set<number>();
  return cards.filter(card => !ids.has(card.id) && Boolean(ids.add(card.id)));
}
