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
  RmaPriority,
  RmaAssigneeUpdateRequest,
  RmaResponse,
  RmaStatus,
  RmaStatusUpdateRequest,
  WarrantyStatus,
} from '../../core/models';
import { AuthService } from '../../core/services/auth.service';
import { CatalogService } from '../../core/services/catalog.service';
import { RmaService } from '../../core/services/rma.service';
import { extractHttpErrorMessage } from '../../core/utils/catalog-ui';
import { businessDateInputValue } from '../../core/utils/date';
import { normalizeText } from '../../core/utils/rma-ui';
import {
  CustomSelectComponent,
  CustomSelectOption,
} from '../../shared/form-controls/custom-select/custom-select.component';
import { DatePickerComponent } from '../../shared/form-controls/date-picker/date-picker.component';
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

@Component({
  selector: 'app-kanban',
  imports: [
    ReactiveFormsModule,
    CustomSelectComponent,
    DatePickerComponent,
    RmaKanbanBoardComponent,
  ],
  templateUrl: './kanban.component.html',
  styleUrl: './kanban.component.css',
})
export class KanbanComponent {
  private readonly formBuilder = inject(FormBuilder);
  private readonly authService = inject(AuthService);
  private readonly catalogService = inject(CatalogService);
  private readonly rmaService = inject(RmaService);

  protected readonly loading = signal(true);
  protected readonly pageError = signal('');
  protected readonly statusModalError = signal('');
  protected readonly assignmentModalError = signal('');
  protected readonly boardUpdatingId = signal<number | null>(null);
  protected readonly draggedRmaId = signal<number | null>(null);
  protected readonly dragTargetStatus = signal<RmaStatus | null>(null);
  protected readonly selectedRmaId = signal<number | null>(null);

  private readonly rmasSignal = signal<RmaResponse[]>([]);
  private readonly assignableUsersSignal = signal<AssignableUserResponse[]>([]);
  private readonly pendingStatusRmaSignal = signal<RmaResponse | null>(null);
  private readonly pendingAssignmentRmaSignal = signal<RmaResponse | null>(null);

  protected readonly filtersForm = this.formBuilder.nonNullable.group({
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
    filterKanbanRmas(this.rmasSignal(), this.filters()),
  );
  protected readonly activeFilterCount = computed(() => countActiveFilters(this.filters()));
  protected readonly totalRmas = computed(() => this.rmasSignal().length);
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
    status: ['RECEIVED' as RmaStatus, [Validators.required]],
    note: [''],
  });

  protected readonly assignmentForm = this.formBuilder.group({
    assigneeId: [null as number | null],
  });

  constructor() {
    this.loadKanban();
  }

  protected selectRma(rma: RmaResponse): void {
    this.selectedRmaId.set(rma.id);
    this.pageError.set('');
  }

  protected clearFilters(): void {
    this.filtersForm.reset(DEFAULT_KANBAN_FILTERS);
  }

  protected openAssignmentModal(rma: RmaResponse): void {
    if (!this.canUpdateAssignee() || this.boardUpdatingId() !== null) {
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

  protected dropOnColumn(event: DragEvent, status: RmaStatus): void {
    event.preventDefault();

    if (!this.canUpdateStatus() || this.boardUpdatingId() !== null) {
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
      .pipe(finalize(() => this.boardUpdatingId.set(null)))
      .subscribe({
        next: (updated) => {
          this.selectedRmaId.set(updated.id);
          this.pendingStatusRmaSignal.set(null);
          this.loadKanban();
        },
        error: (error) => {
          this.statusModalError.set(
            extractHttpErrorMessage(error, 'Não foi possível atualizar o status do RMA.'),
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

function filterKanbanRmas(rmas: RmaResponse[], filters: KanbanFilterValues): RmaResponse[] {
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
