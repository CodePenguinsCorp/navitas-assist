import { Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { finalize, forkJoin, map } from 'rxjs';
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
  RmaStatusUpdateRequest,
  WarrantyStatus,
  WipLimit,
} from '../../core/models';
import { SlaClockService } from '../../core/services/sla-clock.service';
import { SlaFilterValue, SLA_LABELS, slaStatus } from '../../core/utils/rma-sla';
import { AuthService } from '../../core/services/auth.service';
import { CatalogService } from '../../core/services/catalog.service';
import { KanbanViewService } from '../../core/services/kanban-view.service';
import { RmaService } from '../../core/services/rma.service';
import { WipService } from '../../core/services/wip.service';
import { wipErrorMessage } from '../../core/utils/wip-ui';
import { KanbanWipSettingsComponent } from '../../shared/kanban-wip-settings/kanban-wip-settings.component';
import { extractHttpErrorMessage } from '../../core/utils/catalog-ui';
import { businessDateInputValue } from '../../core/utils/date';
import { normalizeText } from '../../core/utils/rma-ui';
import {
  CustomSelectComponent,
  CustomSelectOption,
} from '../../shared/form-controls/custom-select/custom-select.component';
import { BoundedFilterPanelsDirective } from '../../shared/form-controls/bounded-filter-panels.directive';
import { DatePickerComponent } from '../../shared/form-controls/date-picker/date-picker.component';
import { BulkRmaResult, KanbanBulkActionsComponent } from '../../shared/kanban-bulk-actions/kanban-bulk-actions.component';
import { RmaKanbanBoardComponent } from '../../shared/rma-kanban-board/rma-kanban-board.component';

interface KanbanHeroStat {
  label: string;
  value: string;
  detail: string;
}

type AssigneeFilterValue = 'all' | 'unassigned' | number;
type PriorityFilterValue = 'all' | RmaPriority;
type StatusFilterValue = 'all' | RmaStatus;
type WarrantyFilterValue = 'all' | WarrantyStatus;

interface KanbanFilterValues {
  sla: SlaFilterValue;
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

@Component({
  selector: 'app-kanban',
  imports: [
    ReactiveFormsModule,
    BoundedFilterPanelsDirective,
    CustomSelectComponent,
    DatePickerComponent,
    RmaKanbanBoardComponent,
    KanbanBulkActionsComponent,
    KanbanWipSettingsComponent,
  ],
  templateUrl: './kanban.component.html',
  styleUrl: './kanban.component.css',
})
export class KanbanComponent {
  private readonly slaClock = inject(SlaClockService);
  protected readonly slaFilterOptions: ReadonlyArray<CustomSelectOption<SlaFilterValue>> = [
    { value: 'all', label: 'Todas as situações' },
    ...(['NORMAL', 'WARNING', 'OVERDUE', 'CLOSED'] as const).map((value) => ({ value, label: SLA_LABELS[value] }))
  ];
  private readonly formBuilder = inject(FormBuilder);
  private readonly authService = inject(AuthService);
  private readonly catalogService = inject(CatalogService);
  private readonly kanbanViewService = inject(KanbanViewService);
  private readonly rmaService = inject(RmaService);
  private readonly wipService = inject(WipService);
  protected readonly wipLimits = signal<WipLimit[]>([]);
  protected readonly wipError = signal('');
  protected readonly canOverrideWip = computed(() => this.authService.hasAnyRole(['ADMIN']));

  protected readonly loading = signal(true);
  protected readonly pageError = signal('');
  protected readonly statusModalError = signal('');
  protected readonly assignmentModalError = signal('');
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

  private readonly rmasSignal = signal<RmaResponse[]>([]);
  private readonly assignableUsersSignal = signal<AssignableUserResponse[]>([]);
  private readonly viewsSignal = signal<KanbanViewResponse[]>([]);
  private readonly pendingStatusRmaSignal = signal<RmaResponse | null>(null);
  private readonly pendingAssignmentRmaSignal = signal<RmaResponse | null>(null);

  protected readonly filtersForm = this.formBuilder.nonNullable.group({
    sla: ['all' as SlaFilterValue],
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
    filterKanbanRmas(this.rmasSignal(), this.filters(), this.slaClock.now()),
  );
  protected readonly activeFilterCount = computed(() => countActiveFilters(this.filters()));
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
  protected readonly pendingStatusRma = this.pendingStatusRmaSignal.asReadonly();
  protected readonly pendingAssignmentRma = this.pendingAssignmentRmaSignal.asReadonly();
  protected readonly statusSelectOptions = STATUS_SELECT_OPTIONS;
  protected readonly statusFilterOptions = STATUS_FILTER_OPTIONS;
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
  protected readonly canUpdateStatus = computed(() =>
    this.authService.hasAnyRole(['ADMIN', 'SERVICE_DESK', 'TECHNICIAN']),
  );
  protected readonly canUpdateAssignee = computed(() =>
    this.authService.hasAnyRole(['ADMIN', 'SERVICE_DESK']),
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
  protected readonly heroStats = computed<ReadonlyArray<KanbanHeroStat>>(() => [
    {
      label: 'Em andamento',
      value: String(this.activeCount()),
      detail: 'Cards ativos no fluxo',
    },
    {
      label: 'Alta prioridade',
      value: String(this.highPriorityCount()),
      detail: 'Itens que exigem atenção',
    },
    {
      label: 'Aguardando peça',
      value: String(this.waitingPartCount()),
      detail: 'Possível gargalo atual',
    },
    {
      label: 'Encerrados',
      value: String(this.closedCount()),
      detail: 'Concluídos ou devolvidos',
    },
  ]);

  protected readonly statusForm = this.formBuilder.nonNullable.group({
    wipOverrideReason: ['', Validators.maxLength(200)],
    status: ['RECEIVED' as RmaStatus, [Validators.required]],
    note: [''],
  });

  protected readonly assignmentForm = this.formBuilder.group({
    assigneeId: [null as number | null],
  });

  protected readonly viewForm = this.formBuilder.nonNullable.group({
    name: ['', [Validators.required, Validators.maxLength(80)]],
    defaultView: [false],
  });

  constructor() {
    this.loadWip();
    this.loadKanban();
    this.loadViews();
  }

  protected toggleBulkSelection(rma: RmaResponse): void {
    if (this.bulkBusy() || this.boardUpdatingId() !== null || !this.canUpdateStatus()) return;
    this.bulkSelectedIds.update((ids) => ids.includes(rma.id) ? ids.filter((id) => id !== rma.id) : [...ids, rma.id]);
  }

  protected selectVisibleRmas(): void {
    if (this.bulkBusy() || this.boardUpdatingId() !== null || !this.canUpdateStatus()) return;
    this.bulkSelectedIds.update((ids) => [...new Set([...ids, ...this.filteredRmas().map((rma) => rma.id)])]);
  }

  protected clearBulkSelection(): void {
    if (!this.bulkBusy()) this.bulkSelectedIds.set([]);
  }

  protected applyBulkResults(results: BulkRmaResult[]): void {
    this.loadWip();
    const updated = new Map(results.filter((result) => result.rma).map((result) => [result.id, result.rma!]));
    this.rmasSignal.update((rmas) => rmas.map((rma) => updated.get(rma.id) ?? rma));
    const succeeded = new Set(results.filter((result) => result.success).map((result) => result.id));
    this.bulkSelectedIds.update((ids) => ids.filter((id) => !succeeded.has(id)));
  }

  protected selectRma(rma: RmaResponse): void {
    this.selectedRmaId.set(rma.id);
    this.pageError.set('');
  }

  protected clearFilters(): void {
    this.filtersForm.reset(DEFAULT_KANBAN_FILTERS);
    this.activeViewId.set(null);
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

  protected openAssignmentModal(rma: RmaResponse): void {
    if (!this.canUpdateAssignee() || this.bulkBusy() || this.boardUpdatingId() !== null) {
      return;
    }

    this.pendingAssignmentRmaSignal.set(rma);
    this.assignmentModalError.set('');
    this.assignmentForm.reset({ assigneeId: rma.assigneeId });
  }

  protected closeAssignmentModal(): void {
    if (this.boardUpdatingId() !== null) {
      return;
    }

    this.pendingAssignmentRmaSignal.set(null);
    this.assignmentModalError.set('');
  }

  protected saveAssignment(): void {
    const target = this.pendingAssignmentRmaSignal();
    if (!target) {
      return;
    }

    this.submitAssigneeUpdate(target, this.assignmentForm.getRawValue());
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

    this.openStatusModal(dragged, status);
    this.clearBoardDragState();
  }

  protected closeStatusModal(): void {
    if (this.boardUpdatingId() !== null) {
      return;
    }

    this.pendingStatusRmaSignal.set(null);
    this.statusModalError.set('');
    this.clearBoardDragState();
  }

  protected saveStatusChange(): void {
    const target = this.pendingStatusRmaSignal();
    if (!target) {
      return;
    }

    if (this.statusForm.invalid) {
      this.statusForm.markAllAsTouched();
      this.statusModalError.set('Informe um status válido.');
      return;
    }

    const raw = this.statusForm.getRawValue();
    if (raw.status === target.status) {
      this.statusModalError.set('Escolha uma fase diferente da atual.');
      return;
    }

    this.submitStatusUpdate(target, {
      status: raw.status,
      note: normalizeText(raw.note),
      ...(this.canOverrideWip() && raw.wipOverrideReason.trim() ? { wipOverrideReason: raw.wipOverrideReason.trim() } : {}),
    });
  }

  private loadKanban(): void {
    this.loading.set(true);
    this.pageError.set('');

    forkJoin({
      rmas: this.rmaService.list(),
      assignableUsers: this.catalogService.listAssignableUsers(),
    })
      .pipe(finalize(() => this.loading.set(false)))
      .subscribe({
        next: ({ rmas, assignableUsers }) => {
          this.rmasSignal.set(rmas);
          this.assignableUsersSignal.set(assignableUsers);
          this.syncSelection(rmas);
        },
        error: (error) => {
          this.pageError.set(extractHttpErrorMessage(error, 'Não foi possível carregar o Kanban.'));
        },
      });
  }

  protected loadWip(): void {
    this.wipService.list().subscribe({
      next: limits => { this.wipLimits.set(limits); this.wipError.set(''); },
      error: () => this.wipError.set('Não foi possível atualizar as contagens de WIP. Os limites continuam validados pelo servidor; as contagens exibidas podem estar desatualizadas.'),
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

  private openStatusModal(rma: RmaResponse, status: RmaStatus): void {
    this.pendingStatusRmaSignal.set(rma);
    this.statusModalError.set('');
    this.statusForm.reset({
      status,
      note: '',
    });
  }

  private submitStatusUpdate(target: RmaResponse, payload: RmaStatusUpdateRequest): void {
    this.boardUpdatingId.set(target.id);
    this.pageError.set('');
    this.statusModalError.set('');

    this.rmaService
      .updateStatus(target.id, payload)
      .pipe(finalize(() => { this.boardUpdatingId.set(null); this.loadWip(); }))
      .subscribe({
        next: (updated) => {
          this.selectedRmaId.set(updated.id);
          this.pendingStatusRmaSignal.set(null);
          this.loadKanban();
        },
        error: (error) => {
          this.statusModalError.set(
            wipErrorMessage(error, 'Não foi possível atualizar o status do RMA.'),
          );
        },
      });
  }

  private submitAssigneeUpdate(target: RmaResponse, payload: RmaAssigneeUpdateRequest): void {
    this.boardUpdatingId.set(target.id);
    this.pageError.set('');
    this.assignmentModalError.set('');

    this.rmaService
      .updateAssignee(target.id, payload)
      .pipe(finalize(() => this.boardUpdatingId.set(null)))
      .subscribe({
        next: (updated) => {
          this.selectedRmaId.set(updated.id);
          this.pendingAssignmentRmaSignal.set(null);
          this.loadKanban();
        },
        error: (error) => {
          this.assignmentModalError.set(
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
  sla: 'all',
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
      (filters.sla === 'all' || slaStatus(rma.sla, now) === filters.sla) &&
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
  };
}

function fromPersistedFilters(filters: KanbanViewFilters): KanbanFilterValues {
  return {
    sla: 'all',
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
