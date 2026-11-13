import { IconComponent, IconName } from '../../shared/icon/icon.component';
import {
  Component,
  DestroyRef,
  ElementRef,
  Injector,
  afterNextRender,
  computed,
  effect,
  inject,
  signal,
  untracked,
  viewChild,
  viewChildren,
} from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Subscription, finalize, forkJoin, map } from 'rxjs';
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
  RmaResponse,
  RmaStatus,
  WarrantyStatus,
} from '../../core/models';
import { ClockService } from '../../core/services/clock.service';
import { DEADLINE_FILTER_OPTIONS, DeadlineFilterValue, businessToday, deadlineStatus } from '../../core/utils/rma-deadline';
import { PermissionService } from '../../core/services/permission.service';
import { CatalogService } from '../../core/services/catalog.service';
import { KanbanViewService } from '../../core/services/kanban-view.service';
import { RmaService } from '../../core/services/rma.service';
import { extractHttpErrorMessage } from '../../core/utils/catalog-ui';
import { businessDateInputValue } from '../../core/utils/date';
import { formatDate, normalizeText } from '../../core/utils/rma-ui';
import {
  CustomSelectComponent,
  CustomSelectOption,
} from '../../shared/form-controls/custom-select/custom-select.component';
import { BoundedFilterPanelsDirective } from '../../shared/form-controls/bounded-filter-panels.directive';
import { DatePickerComponent } from '../../shared/form-controls/date-picker/date-picker.component';
import { BulkRmaResult, KanbanBulkActionsComponent } from '../../shared/kanban-bulk-actions/kanban-bulk-actions.component';
import { PageHeaderComponent } from '../../shared/page-header/page-header.component';
import { RmaKanbanBoardComponent } from '../../shared/rma-kanban-board/rma-kanban-board.component';
import { ModalFocusDirective } from '../../shared/modal-focus/modal-focus.directive';
import { RmaStatusFieldComponent } from '../../shared/rma-status-field/rma-status-field.component';
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
  imports: [IconComponent, 
    ReactiveFormsModule,
    BoundedFilterPanelsDirective,
    CustomSelectComponent,
    DatePickerComponent,
    RmaKanbanBoardComponent,
    RmaDetailModalComponent,
    RmaStatusFieldComponent,
    KanbanBulkActionsComponent,
    ModalFocusDirective,
    PageHeaderComponent,
  ],
  templateUrl: './kanban.component.html',
  styleUrl: './kanban.component.css',
})
export class KanbanComponent {
  private readonly clock = inject(ClockService);
  protected readonly deadlineFilterOptions = DEADLINE_FILTER_OPTIONS;
  private readonly formBuilder = inject(FormBuilder);
  private readonly permissions = inject(PermissionService);
  private readonly catalogService = inject(CatalogService);
  private readonly kanbanViewService = inject(KanbanViewService);
  private readonly rmaService = inject(RmaService);
  private readonly injector = inject(Injector);
  private readonly destroyRef = inject(DestroyRef);
  private loadRequest?: Subscription;
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
  protected readonly bulkSelectedIds = signal<readonly number[]>([]);
  protected readonly bulkBusy = signal(false);
  protected readonly bulkSelectedRmas = computed(() => this.rmasSignal().filter((rma) => this.bulkSelectedIds().includes(rma.id)));
  protected readonly hiddenSelectedCount = computed(() => this.bulkSelectedRmas().filter((rma) => !this.filteredRmas().some((visible) => visible.id === rma.id)).length);
  protected readonly selectedRmaId = signal<number | null>(null);
  protected readonly detailRmaId = signal<number | null>(null);

  private readonly rmasSignal = signal<RmaResponse[]>([]);
  protected readonly detailRma = computed(() => this.rmasSignal().find((rma) => rma.id === this.detailRmaId()) ?? null);
  private readonly statusFeedbackRmaId = signal<number | null>(null);
  protected readonly statusFeedbackRma = computed(() => this.rmasSignal().find(rma => rma.id === this.statusFeedbackRmaId()) ?? null);
  private readonly assignableUsersSignal = signal<AssignableUserResponse[]>([]);
  private readonly viewsSignal = signal<KanbanViewResponse[]>([]);
  private readonly boardStatus = viewChild.required<RmaStatusFieldComponent>('boardStatus');

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
  protected readonly filteredRmas = computed(() =>
    filterKanbanRmas(this.rmasSignal(), this.filters(), this.clock.now()),
  );
  protected readonly activeFilterCount = computed(() => countActiveFilters(this.filters()));
  protected readonly advancedFiltersOpen = signal(false);
  protected readonly activeFilterChips = computed<ReadonlyArray<KanbanFilterChip>>(() => {
    const filters = this.filters();
    return ADVANCED_FILTER_KEYS.filter((key) => filters[key] !== DEFAULT_KANBAN_FILTERS[key]).map((key) => ({
      key,
      label: `${FILTER_LABELS[key]}: ${this.filterValueLabel(key, filters[key])}`,
    }));
  });
  protected readonly totalRmas = computed(() => this.rmasSignal().length);
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
  protected readonly assigneeSelectOptions = computed<
    ReadonlyArray<CustomSelectOption<number | null>>
  >(() => [
    { value: null, label: 'Sem responsável' },
    ...this.assignableUsersSignal().map((user) => ({
      value: user.id,
      label: `${user.fullName} (@${user.username})`,
    })),
  ]);
  protected readonly canUpdateStatus = computed(() => this.permissions.hasPermission('rma.status'));
  protected readonly canUpdateAssignee = computed(() => this.permissions.hasPermission('rma.responsavel'));
  protected readonly canUpdatePriority = computed(() => this.permissions.hasPermission('rma.editar'));
  /** Seleção e ações em lote: basta uma das ações disponíveis no lote. */
  protected readonly canBulkEdit = computed(() =>
    this.permissions.hasAny(['rma.status', 'rma.editar', 'rma.responsavel']),
  );
  protected readonly activeCount = computed(
    () => this.filteredRmas().filter((rma) => !CLOSED_RMA_STATUSES.includes(rma.status)).length,
  );
  protected readonly highPriorityCount = computed(
    () => this.filteredRmas().filter((rma) => rma.priority === 'HIGH').length,
  );
  protected readonly waitingPartCount = computed(
    () => this.filteredRmas().filter((rma) => rma.status === 'WAITING_PART').length,
  );
  protected readonly closedCount = computed(
    () => this.filteredRmas().filter((rma) => CLOSED_RMA_STATUSES.includes(rma.status)).length,
  );
  /** Indicators belong to a current successful read: hidden before it and after a failure. */
  protected readonly boardReady = computed(() => this.hasLoaded() && !this.loadFailed());
  /**
   * First indicator: "Y RMAs" without filter, "X de Y RMAs" with one, with the singular of the last number.
   */
  protected readonly totalSummary = computed(() => {
    if (!this.boardReady()) return null;
    const count = this.filteredRmas().length;
    const overall = this.activeFilterCount() > 0 ? this.totalRmas() : null;
    return { count, overall, label: (overall ?? count) === 1 ? 'RMA' : 'RMAs' };
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
    this.filtersForm.valueChanges.pipe(takeUntilDestroyed()).subscribe(() => this.releaseDivergentView());
    this.loadKanban();
    this.loadViews();
    // Sem permissão de lote (após um 403 ou ao mudar o próprio perfil), a seleção some com a barra.
    effect(() => {
      if (!this.canBulkEdit()) untracked(() => this.bulkSelectedIds.set([]));
    });
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

  protected toggleBulkSelection(rma: RmaResponse): void {
    if (this.bulkBusy() || this.boardUpdatingId() !== null || !this.canBulkEdit()) return;
    this.bulkSelectedIds.update((ids) => ids.includes(rma.id) ? ids.filter((id) => id !== rma.id) : [...ids, rma.id]);
  }

  protected selectVisibleRmas(): void {
    if (this.bulkBusy() || this.boardUpdatingId() !== null || !this.canBulkEdit()) return;
    this.bulkSelectedIds.update((ids) => [...new Set([...ids, ...this.filteredRmas().map((rma) => rma.id)])]);
  }

  protected clearBulkSelection(): void {
    if (!this.bulkBusy()) this.bulkSelectedIds.set([]);
  }

  protected applyBulkResults(results: BulkRmaResult[]): void {
    const updated = new Map(results.filter((result) => result.rma).map((result) => [result.id, result.rma!]));
    this.rmasSignal.update((rmas) => rmas.map((rma) => updated.get(rma.id) ?? rma));
    const succeeded = new Set(results.filter((result) => result.success).map((result) => result.id));
    this.bulkSelectedIds.update((ids) => ids.filter((id) => !succeeded.has(id)));
  }

  protected openDetail(rma: RmaResponse): void {
    this.selectRma(rma);
    this.detailRmaId.set(rma.id);
  }

  protected closeDetail(): void {
    this.detailRmaId.set(null);
    this.assignmentError.set('');
  }

  protected selectRma(rma: RmaResponse): void {
    this.selectedRmaId.set(rma.id);
    this.pageError.set('');
  }

  /** A save made inside the detail (impediment, due date) replaces the card in place. */
  protected applyRmaUpdate(updated: RmaResponse): void {
    this.rmasSignal.update((rmas) => rmas.map((rma) => rma.id === updated.id ? updated : rma));
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
    if (!this.canUpdateAssignee() || this.bulkBusy() || this.boardUpdatingId() !== null || assigneeId === rma.assigneeId) {
      return;
    }

    this.submitAssigneeUpdate(rma, { assigneeId });
  }

  protected startCardDrag(event: DragEvent, rma: RmaResponse): void {
    if (!this.canUpdateStatus() || this.bulkBusy() || this.boardUpdatingId() !== null) {
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
      !this.canUpdateStatus() || this.bulkBusy() ||
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

  protected dropOnColumn(event: DragEvent, status: RmaStatus): void {
    event.preventDefault();

    if (!this.canUpdateStatus() || this.bulkBusy() || this.boardUpdatingId() !== null) {
      this.clearBoardDragState();
      return;
    }

    const draggedId = this.draggedRmaId();
    const dragged = this.rmasSignal().find((item) => item.id === draggedId);
    if (!dragged) {
      this.clearBoardDragState();
      return;
    }

    if (dragged.status === status) {
      this.selectRma(dragged);
      this.clearBoardDragState();
      return;
    }

    this.statusFeedbackRmaId.set(dragged.id);
    this.boardStatus().move(status, dragged);
    this.clearBoardDragState();
  }

  /** Only the latest read counts: a newer one (retry or reload) cancels the previous, as does destroy. */
  private loadKanban(): void {
    this.loadRequest?.unsubscribe();
    this.loading.set(true);

    this.loadRequest = forkJoin({
      rmas: this.rmaService.listBoard(),
      assignableUsers: this.catalogService.listAssignableUsers(),
    })
      .pipe(takeUntilDestroyed(this.destroyRef), finalize(() => this.loading.set(false)))
      .subscribe({
        next: ({ rmas, assignableUsers }) => {
          this.rmasSignal.set(rmas);
          this.assignableUsersSignal.set(assignableUsers);
          this.syncSelection(rmas);
          this.hasLoaded.set(true);
          this.loadFailed.set(false);
          this.loadErrorMessage.set('');
        },
        error: (error) => {
          this.loadFailed.set(true);
          this.loadErrorMessage.set(extractHttpErrorMessage(error, 'Não foi possível carregar o Kanban.'));
        },
      });
  }

  private loadViews(): void {
    this.kanbanViewService.list().subscribe({
      next: (views) => {
        this.viewsSignal.set(sortViews(views));
        const defaultView = views.find((view) => view.defaultView);
        if (defaultView) {
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

  private syncSelection(rmas: RmaResponse[]): void {
    const selectedId = this.selectedRmaId();
    if (selectedId === null) {
      return;
    }

    const refreshed = rmas.find((item) => item.id === selectedId);
    if (!refreshed) {
      this.selectedRmaId.set(null);
    }
  }

  private submitAssigneeUpdate(target: RmaResponse, payload: RmaAssigneeUpdateRequest): void {
    this.boardUpdatingId.set(target.id);
    this.pageError.set('');
    this.assignmentError.set('');

    this.rmaService
      .updateAssignee(target.id, payload)
      .pipe(finalize(() => this.boardUpdatingId.set(null)))
      .subscribe({
        next: (updated) => {
          this.selectedRmaId.set(updated.id);
          this.loadKanban();
        },
        error: (error) => {
          this.assignmentError.set(
            extractHttpErrorMessage(error, 'Não foi possível atualizar o responsável do RMA.'),
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

function filterKanbanRmas(rmas: RmaResponse[], filters: KanbanFilterValues, now: number): RmaResponse[] {
  const query = normalizeSearch(filters.query);
  const today = businessToday(now);

  return rmas.filter((rma) => {
    const matchesQuery = !query || rmaSearchText(rma).includes(query);
    const matchesPriority = filters.priority === 'all' || rma.priority === filters.priority;
    const matchesStatus = filters.status === 'all' || rma.status === filters.status;
    const matchesWarranty =
      filters.warranty === 'all' ||
      rma.items.some((item) => item.warrantyStatus === filters.warranty);
    const matchesAssignee =
      filters.assignee === 'all' ||
      (filters.assignee === 'unassigned'
        ? rma.assigneeId === null
        : rma.assigneeId === filters.assignee);
    const matchesEntryDate = isWithinRange(rma.entryDate, filters.entryFrom, filters.entryTo);
    const updatedDate = businessDateInputValue(new Date(rma.updatedAt));
    const matchesUpdatedDate = isWithinRange(updatedDate, filters.updatedFrom, filters.updatedTo);

    return (
      (filters.blocked === 'all' || Boolean(rma.currentBlock) === (filters.blocked === 'blocked')) &&
      (filters.deadline === 'all' || deadlineStatus(rma, today) === filters.deadline) &&
      matchesQuery &&
      matchesPriority &&
      matchesStatus &&
      matchesWarranty &&
      matchesAssignee &&
      matchesEntryDate &&
      matchesUpdatedDate
    );
  });
}

function rmaSearchText(rma: RmaResponse): string {
  const itemValues = rma.items.flatMap((item) => [
    item.productName,
    item.productSku,
    item.batchNumber,
    item.serialNumber,
  ]);

  return normalizeSearch(
    [
      rma.code,
      rma.clientName,
      rma.productName,
      rma.productSku,
      rma.batchNumber,
      rma.serialNumber,
      ...itemValues,
    ].join(' '),
  );
}

function normalizeSearch(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('pt-BR')
    .trim();
}

function isWithinRange(value: string, from: string, to: string): boolean {
  return (!from || value >= from) && (!to || value <= to);
}

function countActiveFilters(filters: KanbanFilterValues): number {
  return Object.entries(filters).filter(([key, value]) => {
    if (key === 'query') {
      return Boolean(normalizeSearch(String(value)));
    }
    return value !== '' && value !== 'all';
  }).length;
}

function mergeAssigneeOptions(
  assignableUsers: AssignableUserResponse[],
  rmas: RmaResponse[],
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
