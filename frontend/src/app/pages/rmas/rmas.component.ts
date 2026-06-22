import { Component, computed, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { finalize, forkJoin } from 'rxjs';
import {
  FAILURE_CAUSE_LABELS,
  FAILURE_CAUSE_OPTIONS,
  FAILURE_TYPE_LABELS,
  FAILURE_TYPE_OPTIONS,
  RMA_PRIORITY_LABELS,
  RMA_STATUS_FLOW,
  RMA_STATUS_LABELS,
  WARRANTY_STATUS_LABELS
} from '../../core/mock-data';
import {
  ClientResponse,
  CreateRmaRequest,
  DiagnosisRequest,
  FailureCause,
  FailureType,
  ProductResponse,
  RmaPriority,
  RmaResponse,
  RmaStatus,
  RmaStatusHistoryResponse,
  RmaStatusUpdateRequest,
  WarrantyStatus
} from '../../core/models';
import { AuthService } from '../../core/services/auth.service';
import { CatalogService } from '../../core/services/catalog.service';
import { RmaService } from '../../core/services/rma.service';
import {
  CustomSelectComponent,
  CustomSelectOption
} from '../../shared/form-controls/custom-select/custom-select.component';
import { DatePickerComponent } from '../../shared/form-controls/date-picker/date-picker.component';

type SearchStatusValue = RmaStatus | '';
type FailureTypeValue = FailureType | '';
type FailureCauseValue = FailureCause | '';
type WarrantyOverrideValue = WarrantyStatus | '';
type ModalView = 'create' | 'status' | 'diagnosis';

interface RmaColumn {
  status: RmaStatus;
  label: string;
  items: RmaResponse[];
}

interface QueueRow {
  code: string;
  client: string;
  status: string;
  channel: string;
  priority: string;
  warranty: string;
}

@Component({
  selector: 'app-rmas',
  imports: [ReactiveFormsModule, CustomSelectComponent, DatePickerComponent],
  templateUrl: './rmas.component.html',
  styles: [':host { display: block; }']
})
export class RmasComponent {
  private readonly formBuilder = inject(FormBuilder);
  private readonly authService = inject(AuthService);
  private readonly catalogService = inject(CatalogService);
  private readonly rmaService = inject(RmaService);

  protected readonly loading = signal(true);
  protected readonly createSubmitting = signal(false);
  protected readonly statusSubmitting = signal(false);
  protected readonly diagnosisSubmitting = signal(false);
  protected readonly historyLoading = signal(false);
  protected readonly boardUpdatingId = signal<number | null>(null);

  protected readonly pageError = signal('');
  protected readonly pageMessage = signal('');
  protected readonly historyError = signal('');
  protected readonly historyMessage = signal('');
  protected readonly activeModal = signal<ModalView | null>(null);
  protected readonly draggedRmaId = signal<number | null>(null);
  protected readonly dragTargetStatus = signal<RmaStatus | null>(null);

  private readonly rmasSignal = signal<RmaResponse[]>([]);
  private readonly historySignal = signal<RmaResponse[]>([]);
  private readonly clientsSignal = signal<ClientResponse[]>([]);
  private readonly productsSignal = signal<ProductResponse[]>([]);
  private readonly selectedRmaSignal = signal<RmaResponse | null>(null);

  protected readonly rmas = this.rmasSignal.asReadonly();
  protected readonly historyResults = this.historySignal.asReadonly();
  protected readonly clients = this.clientsSignal.asReadonly();
  protected readonly products = this.productsSignal.asReadonly();
  protected readonly selectedRma = this.selectedRmaSignal.asReadonly();
  protected readonly clientSelectOptions = computed<ReadonlyArray<CustomSelectOption<number>>>(() => [
    { value: 0, label: 'Selecione' },
    ...this.clientsSignal().map((client) => ({
      value: client.id,
      label: client.legalName
    }))
  ]);
  protected readonly productSelectOptions = computed<ReadonlyArray<CustomSelectOption<number>>>(() => [
    { value: 0, label: 'Selecione' },
    ...this.productsSignal().map((product) => ({
      value: product.id,
      label: `${product.sku} | ${product.name}`
    }))
  ]);

  protected readonly statusOptions = RMA_STATUS_FLOW;
  protected readonly priorityOptions: RmaPriority[] = ['HIGH', 'MEDIUM', 'LOW'];
  protected readonly warrantyOverrideOptions: WarrantyStatus[] = [
    'IN_WARRANTY',
    'OUT_OF_WARRANTY',
    'PENDING'
  ];
  protected readonly failureTypeOptions = FAILURE_TYPE_OPTIONS;
  protected readonly failureCauseOptions = FAILURE_CAUSE_OPTIONS;
  protected readonly statusFilterOptions = STATUS_FILTER_OPTIONS;
  protected readonly prioritySelectOptions = PRIORITY_SELECT_OPTIONS;
  protected readonly warrantyOverrideSelectOptions = WARRANTY_OVERRIDE_OPTIONS;
  protected readonly statusSelectOptions = STATUS_SELECT_OPTIONS;
  protected readonly failureTypeSelectOptions = FAILURE_TYPE_SELECT_OPTIONS;
  protected readonly failureCauseSelectOptions = FAILURE_CAUSE_SELECT_OPTIONS;

  protected readonly canOpenRma = computed(() =>
    this.authService.hasAnyRole(['ADMIN', 'SERVICE_DESK'])
  );

  protected readonly canUpdateStatus = computed(() =>
    this.authService.hasAnyRole(['ADMIN', 'SERVICE_DESK', 'TECHNICIAN'])
  );

  protected readonly canRegisterDiagnosis = computed(() =>
    this.authService.hasAnyRole(['ADMIN', 'TECHNICIAN'])
  );

  protected readonly columns = computed<RmaColumn[]>(() =>
    RMA_STATUS_FLOW.map((status) => ({
      status,
      label: RMA_STATUS_LABELS[status],
      items: this.rmasSignal()
        .filter((rma) => rma.status === status)
        .sort(compareRmasForBoard)
    }))
  );

  protected readonly queue = computed<QueueRow[]>(() =>
    [...this.rmasSignal()]
      .sort(compareRmasForQueue)
      .slice(0, 6)
      .map((rma) => ({
        code: rma.code,
        client: rma.clientName,
        status: this.statusLabel(rma.status),
        channel: rma.receivedBy,
        priority: this.priorityLabel(rma.priority),
        warranty: this.warrantyLabel(rma.warrantyStatus, rma.warrantyOverridden)
      }))
  );

  protected readonly totalRmas = computed(() => this.rmasSignal().length);
  protected readonly overriddenWarrantyCount = computed(() =>
    this.rmasSignal().filter((rma) => rma.warrantyOverridden).length
  );

  protected readonly filtersForm = this.formBuilder.nonNullable.group({
    query: [''],
    status: ['' as SearchStatusValue]
  });

  protected readonly historyForm = this.formBuilder.nonNullable.group({
    batchNumber: [''],
    serialNumber: ['']
  });

  protected readonly createForm = this.formBuilder.nonNullable.group({
    clientId: [0, [Validators.required, Validators.min(1)]],
    productId: [0, [Validators.required, Validators.min(1)]],
    batchNumber: [''],
    serialNumber: [''],
    manufacturedAt: [''],
    purchaseDate: [''],
    purchaseDateUnknown: [false],
    entryDate: [todayInputValue(), [Validators.required]],
    invoiceNumber: [''],
    invoiceFileName: [''],
    receivedBy: ['', [Validators.required, Validators.maxLength(120)]],
    reportedFailure: ['', [Validators.required, Validators.maxLength(2000)]],
    receivedAccessories: [''],
    physicalCondition: [''],
    priority: ['MEDIUM' as RmaPriority, [Validators.required]],
    warrantyStatusOverride: ['' as WarrantyOverrideValue],
    warrantyJustification: [''],
    repairSummary: [''],
    replacedPartsSummary: [''],
    testSummary: ['']
  });

  protected readonly statusForm = this.formBuilder.nonNullable.group({
    status: ['RECEIVED' as RmaStatus, [Validators.required]],
    note: ['']
  });

  protected readonly diagnosisForm = this.formBuilder.nonNullable.group({
    foundFailure: ['', [Validators.required, Validators.maxLength(2000)]],
    failureType: ['' as FailureTypeValue],
    probableCause: ['' as FailureCauseValue],
    notes: [''],
    diagnosedAt: [todayInputValue(), [Validators.required]],
    technicianName: ['', [Validators.required, Validators.maxLength(120)]]
  });

  constructor() {
    this.seedOperatorDefaults();
    this.loadWorkspace();
  }

  protected submitFilters(): void {
    this.pageMessage.set('');
    this.refreshRmas();
  }

  protected clearFilters(): void {
    this.filtersForm.setValue({
      query: '',
      status: ''
    });
    this.pageMessage.set('');
    this.refreshRmas();
  }

  protected refresh(): void {
    this.refreshRmas();
  }

  protected openCreateModal(): void {
    if (!this.canOpenRma()) {
      this.pageError.set('Seu perfil não pode abrir novos RMAs.');
      return;
    }

    this.pageError.set('');
    this.pageMessage.set('');
    this.activeModal.set('create');
  }

  protected openStatusModal(): void {
    if (!this.selectedRmaSignal()) {
      this.pageError.set('Selecione um RMA para alterar o status.');
      return;
    }

    if (!this.canUpdateStatus()) {
      this.pageError.set('Seu perfil não pode alterar o status do RMA.');
      return;
    }

    this.pageError.set('');
    this.pageMessage.set('');
    this.activeModal.set('status');
  }

  protected openDiagnosisModal(): void {
    if (!this.selectedRmaSignal()) {
      this.pageError.set('Selecione um RMA para registrar diagnóstico.');
      return;
    }

    if (!this.canRegisterDiagnosis()) {
      this.pageError.set('Seu perfil não pode registrar diagnóstico técnico.');
      return;
    }

    this.pageError.set('');
    this.pageMessage.set('');
    this.activeModal.set('diagnosis');
  }

  protected closeModal(): void {
    this.activeModal.set(null);
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
    if (!this.canUpdateStatus() || this.boardUpdatingId() !== null || this.draggedRmaId() === null) {
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

    this.moveRmaToStatus(dragged, status);
  }

  protected searchHistory(): void {
    const { batchNumber, serialNumber } = this.historyForm.getRawValue();
    const normalizedBatch = normalizeText(batchNumber);
    const normalizedSerial = normalizeText(serialNumber);

    if (!normalizedBatch && !normalizedSerial) {
      this.historyError.set('Informe lote ou serial para consultar o histórico.');
      this.historyMessage.set('');
      this.historySignal.set([]);
      return;
    }

    this.historyLoading.set(true);
    this.historyError.set('');
    this.historyMessage.set('');

    this.rmaService.history({
      batchNumber: normalizedBatch ?? undefined,
      serialNumber: normalizedSerial ?? undefined
    }).pipe(
      finalize(() => this.historyLoading.set(false))
    ).subscribe({
      next: (results) => {
        this.historySignal.set(results);
        this.historyMessage.set(
          results.length > 0
            ? `${results.length} registro(s) encontrados.`
            : 'Nenhum histórico encontrado.'
        );
      },
      error: (error) => {
        this.historySignal.set([]);
        this.historyError.set(extractErrorMessage(error, 'Não foi possível consultar o histórico agora.'));
      }
    });
  }

  protected selectRma(rma: RmaResponse): void {
    this.selectedRmaSignal.set(rma);
    this.primeDetailForms(rma);
    this.pageError.set('');
  }

  protected selectHistoryItem(rma: RmaResponse): void {
    this.selectRma(rma);
    this.pageMessage.set(`RMA ${rma.code} carregado.`);
  }

  protected createRma(): void {
    if (!this.canOpenRma()) {
      this.pageError.set('Seu perfil não pode abrir novos RMAs.');
      return;
    }

    if (this.createForm.invalid) {
      this.createForm.markAllAsTouched();
      this.pageError.set('Preencha os campos obrigatórios.');
      this.pageMessage.set('');
      return;
    }

    const raw = this.createForm.getRawValue();
    const warrantyStatusOverride = raw.warrantyStatusOverride || null;
    const warrantyJustification = normalizeText(raw.warrantyJustification);

    if (warrantyStatusOverride && !warrantyJustification) {
      this.pageError.set('Informe a justificativa do override de garantia.');
      this.pageMessage.set('');
      return;
    }

    const payload: CreateRmaRequest = {
      clientId: raw.clientId,
      productId: raw.productId,
      batchNumber: normalizeText(raw.batchNumber),
      serialNumber: normalizeText(raw.serialNumber),
      manufacturedAt: normalizeText(raw.manufacturedAt),
      purchaseDate: raw.purchaseDateUnknown ? null : normalizeText(raw.purchaseDate),
      purchaseDateUnknown: raw.purchaseDateUnknown,
      entryDate: raw.entryDate,
      invoiceNumber: normalizeText(raw.invoiceNumber),
      invoiceFileName: normalizeText(raw.invoiceFileName),
      receivedBy: raw.receivedBy.trim(),
      reportedFailure: raw.reportedFailure.trim(),
      receivedAccessories: normalizeText(raw.receivedAccessories),
      physicalCondition: normalizeText(raw.physicalCondition),
      priority: raw.priority,
      warrantyStatusOverride,
      warrantyJustification,
      repairSummary: normalizeText(raw.repairSummary),
      replacedPartsSummary: normalizeText(raw.replacedPartsSummary),
      testSummary: normalizeText(raw.testSummary)
    };

    this.createSubmitting.set(true);
    this.pageError.set('');
    this.pageMessage.set('');

    this.rmaService.create(payload).pipe(
      finalize(() => this.createSubmitting.set(false))
    ).subscribe({
      next: (rma) => {
        this.selectedRmaSignal.set(rma);
        this.primeDetailForms(rma);
        this.resetCreateForm();
        this.filtersForm.setValue({ query: '', status: '' });
        this.closeModal();
        this.pageMessage.set(`RMA ${rma.code} criado com sucesso.`);
        this.refreshRmas();
      },
      error: (error) => {
        this.pageError.set(extractErrorMessage(error, 'Não foi possível abrir o RMA agora.'));
      }
    });
  }

  protected updateStatus(): void {
    const selected = this.selectedRmaSignal();
    if (!selected) {
      this.pageError.set('Selecione um RMA para atualizar o status.');
      return;
    }

    if (!this.canUpdateStatus()) {
      this.pageError.set('Seu perfil não pode alterar o status do RMA.');
      return;
    }

    if (this.statusForm.invalid) {
      this.statusForm.markAllAsTouched();
      this.pageError.set('Informe um status válido.');
      return;
    }

    const raw = this.statusForm.getRawValue();
    const payload: RmaStatusUpdateRequest = {
      status: raw.status,
      note: normalizeText(raw.note)
    };

    this.submitStatusUpdate(selected, payload, 'modal');
  }

  protected saveDiagnosis(): void {
    const selected = this.selectedRmaSignal();
    if (!selected) {
      this.pageError.set('Selecione um RMA para registrar diagnóstico.');
      return;
    }

    if (!this.canRegisterDiagnosis()) {
      this.pageError.set('Seu perfil não pode registrar diagnóstico técnico.');
      return;
    }

    if (this.diagnosisForm.invalid) {
      this.diagnosisForm.markAllAsTouched();
      this.pageError.set('Preencha os campos obrigatórios do diagnóstico.');
      return;
    }

    const raw = this.diagnosisForm.getRawValue();
    const payload: DiagnosisRequest = {
      foundFailure: raw.foundFailure.trim(),
      failureType: raw.failureType || null,
      probableCause: raw.probableCause || null,
      notes: normalizeText(raw.notes),
      diagnosedAt: raw.diagnosedAt,
      technicianName: raw.technicianName.trim()
    };

    this.diagnosisSubmitting.set(true);
    this.pageError.set('');
    this.pageMessage.set('');

    this.rmaService.upsertDiagnosis(selected.id, payload).pipe(
      finalize(() => this.diagnosisSubmitting.set(false))
    ).subscribe({
      next: (updated) => {
        this.selectedRmaSignal.set(updated);
        this.primeDetailForms(updated);
        this.closeModal();
        this.pageMessage.set(`Diagnóstico do ${updated.code} salvo com sucesso.`);
        this.refreshRmas();
      },
      error: (error) => {
        this.pageError.set(extractErrorMessage(error, 'Não foi possível salvar o diagnóstico agora.'));
      }
    });
  }

  protected isSelected(rma: RmaResponse): boolean {
    return this.selectedRmaSignal()?.id === rma.id;
  }

  protected isDragging(rma: RmaResponse): boolean {
    return this.draggedRmaId() === rma.id;
  }

  protected isDropTarget(status: RmaStatus): boolean {
    return this.dragTargetStatus() === status;
  }

  protected isStatusUpdating(rma: RmaResponse): boolean {
    return this.boardUpdatingId() === rma.id;
  }

  protected statusLabel(status: RmaStatus): string {
    return RMA_STATUS_LABELS[status];
  }

  protected priorityLabel(priority: RmaPriority): string {
    return RMA_PRIORITY_LABELS[priority];
  }

  protected priorityClass(priority: string): string {
    switch (priority) {
      case 'Alta':
        return 'priority-high';
      case 'Média':
        return 'priority-medium';
      default:
        return 'priority-low';
    }
  }

  protected warrantyClass(warrantyStatus: WarrantyStatus, warrantyOverridden = false): string {
    if (warrantyOverridden) {
      return 'warranty-alert';
    }

    switch (warrantyStatus) {
      case 'IN_WARRANTY':
        return 'warranty-ok';
      case 'OUT_OF_WARRANTY':
        return 'warranty-off';
      default:
        return 'warranty-alert';
    }
  }

  protected warrantyTextClass(label: string): string {
    switch (label) {
      case 'Em garantia':
        return 'warranty-ok';
      case 'Override manual':
      case 'Pendente':
        return 'warranty-alert';
      default:
        return 'warranty-off';
    }
  }

  protected warrantyLabel(warrantyStatus: WarrantyStatus, warrantyOverridden = false): string {
    if (warrantyOverridden) {
      return 'Override manual';
    }

    return WARRANTY_STATUS_LABELS[warrantyStatus];
  }

  protected failureTypeLabel(value: FailureType | null): string {
    return value ? FAILURE_TYPE_LABELS[value] : 'Não classificado';
  }

  protected failureCauseLabel(value: FailureCause | null): string {
    return value ? FAILURE_CAUSE_LABELS[value] : 'Não classificada';
  }

  protected dateLabel(value: string | null): string {
    if (!value) {
      return 'Não informado';
    }

    return new Intl.DateTimeFormat('pt-BR').format(new Date(value));
  }

  protected dateTimeLabel(value: string | null): string {
    if (!value) {
      return 'Não informado';
    }

    return new Intl.DateTimeFormat('pt-BR', {
      dateStyle: 'short',
      timeStyle: 'short'
    }).format(new Date(value));
  }

  protected trackableLabel(rma: RmaResponse): string {
    if (rma.serialNumber) {
      return `Serial ${rma.serialNumber}`;
    }

    if (rma.batchNumber) {
      return `Lote ${rma.batchNumber}`;
    }

    return 'Item sem identificação';
  }

  protected ownerLabel(rma: RmaResponse): string {
    if (rma.diagnosis?.technicianName?.trim()) {
      return rma.diagnosis.technicianName.trim();
    }

    const latestHistory = latestStatusUpdate(rma.statusHistory);
    if (latestHistory?.changedBy?.trim()) {
      return latestHistory.changedBy.trim();
    }

    return rma.receivedBy;
  }

  private moveRmaToStatus(rma: RmaResponse, status: RmaStatus): void {
    this.submitStatusUpdate(
      rma,
      {
        status,
        note: null
      },
      'board'
    );
  }

  private loadWorkspace(): void {
    this.loading.set(true);
    this.pageError.set('');

    forkJoin({
      clients: this.catalogService.listClients(),
      products: this.catalogService.listProducts(),
      rmas: this.rmaService.list(this.buildFilters())
    }).pipe(
      finalize(() => this.loading.set(false))
    ).subscribe({
      next: ({ clients, products, rmas }) => {
        this.clientsSignal.set(clients);
        this.productsSignal.set(products);
        this.rmasSignal.set(rmas);
        this.syncSelection(rmas);
      },
      error: (error) => {
        this.pageError.set(extractErrorMessage(error, 'Não foi possível carregar a central de RMAs.'));
      }
    });
  }

  private refreshRmas(): void {
    this.loading.set(true);
    this.pageError.set('');

    this.rmaService.list(this.buildFilters()).pipe(
      finalize(() => this.loading.set(false))
    ).subscribe({
      next: (rmas) => {
        this.rmasSignal.set(rmas);
        this.syncSelection(rmas);
      },
      error: (error) => {
        this.pageError.set(extractErrorMessage(error, 'Não foi possível carregar os RMAs agora.'));
      }
    });
  }

  private syncSelection(rmas: RmaResponse[]): void {
    const selected = this.selectedRmaSignal();

    if (selected) {
      const refreshed = rmas.find((item) => item.id === selected.id);
      if (refreshed) {
        this.selectedRmaSignal.set(refreshed);
        this.primeDetailForms(refreshed);
        return;
      }

      this.primeDetailForms(selected);
      return;
    }

    const firstRma = rmas[0] ?? null;
    this.selectedRmaSignal.set(firstRma);
    if (firstRma) {
      this.primeDetailForms(firstRma);
    }
  }

  private primeDetailForms(rma: RmaResponse): void {
    this.statusForm.setValue({
      status: rma.status,
      note: ''
    });

    this.diagnosisForm.setValue({
      foundFailure: rma.diagnosis?.foundFailure ?? '',
      failureType: (rma.diagnosis?.failureType ?? '') as FailureTypeValue,
      probableCause: (rma.diagnosis?.probableCause ?? '') as FailureCauseValue,
      notes: rma.diagnosis?.notes ?? '',
      diagnosedAt: rma.diagnosis?.diagnosedAt ?? todayInputValue(),
      technicianName: rma.diagnosis?.technicianName ?? this.currentOperatorName()
    });
  }

  private seedOperatorDefaults(): void {
    const operatorName = this.currentOperatorName();

    this.createForm.patchValue({
      receivedBy: operatorName
    });

    this.diagnosisForm.patchValue({
      technicianName: operatorName
    });
  }

  private resetCreateForm(): void {
    this.createForm.reset({
      clientId: 0,
      productId: 0,
      batchNumber: '',
      serialNumber: '',
      manufacturedAt: '',
      purchaseDate: '',
      purchaseDateUnknown: false,
      entryDate: todayInputValue(),
      invoiceNumber: '',
      invoiceFileName: '',
      receivedBy: this.currentOperatorName(),
      reportedFailure: '',
      receivedAccessories: '',
      physicalCondition: '',
      priority: 'MEDIUM',
      warrantyStatusOverride: '',
      warrantyJustification: '',
      repairSummary: '',
      replacedPartsSummary: '',
      testSummary: ''
    });
  }

  private buildFilters(): { query?: string; status?: RmaStatus } {
    const raw = this.filtersForm.getRawValue();
    const query = normalizeText(raw.query);

    return {
      query: query ?? undefined,
      status: raw.status || undefined
    };
  }

  private submitStatusUpdate(
    target: RmaResponse,
    payload: RmaStatusUpdateRequest,
    source: 'modal' | 'board'
  ): void {
    if (source === 'board') {
      this.boardUpdatingId.set(target.id);
    } else {
      this.statusSubmitting.set(true);
    }

    this.pageError.set('');
    this.pageMessage.set('');

    this.rmaService.updateStatus(target.id, payload).pipe(
      finalize(() => {
        if (source === 'board') {
          this.boardUpdatingId.set(null);
        } else {
          this.statusSubmitting.set(false);
        }

        this.clearBoardDragState();
      })
    ).subscribe({
      next: (updated) => {
        this.selectedRmaSignal.set(updated);
        this.primeDetailForms(updated);

        if (source === 'modal') {
          this.closeModal();
          this.pageMessage.set(`Status do ${updated.code} atualizado.`);
        } else {
          this.pageMessage.set(`${updated.code} movido para ${this.statusLabel(updated.status)}.`);
        }

        this.refreshRmas();
      },
      error: (error) => {
        this.pageError.set(extractErrorMessage(error, 'Não foi possível atualizar o status do RMA.'));
      }
    });
  }

  private clearBoardDragState(): void {
    this.draggedRmaId.set(null);
    this.dragTargetStatus.set(null);
  }

  private currentOperatorName(): string {
    const user = this.authService.currentUser();
    return user?.name ?? user?.username ?? '';
  }
}

const STATUS_FILTER_OPTIONS: ReadonlyArray<CustomSelectOption<SearchStatusValue>> = [
  { value: '', label: 'Todos' },
  ...RMA_STATUS_FLOW.map((status) => ({
    value: status,
    label: RMA_STATUS_LABELS[status]
  }))
];

const STATUS_SELECT_OPTIONS: ReadonlyArray<CustomSelectOption<RmaStatus>> = RMA_STATUS_FLOW.map((status) => ({
  value: status,
  label: RMA_STATUS_LABELS[status]
}));

const PRIORITY_SELECT_OPTIONS: ReadonlyArray<CustomSelectOption<RmaPriority>> = [
  { value: 'HIGH', label: RMA_PRIORITY_LABELS.HIGH },
  { value: 'MEDIUM', label: RMA_PRIORITY_LABELS.MEDIUM },
  { value: 'LOW', label: RMA_PRIORITY_LABELS.LOW }
];

const WARRANTY_OVERRIDE_OPTIONS: ReadonlyArray<CustomSelectOption<WarrantyOverrideValue>> = [
  { value: '', label: 'Cálculo automático' },
  { value: 'IN_WARRANTY', label: WARRANTY_STATUS_LABELS.IN_WARRANTY },
  { value: 'OUT_OF_WARRANTY', label: WARRANTY_STATUS_LABELS.OUT_OF_WARRANTY },
  { value: 'PENDING', label: WARRANTY_STATUS_LABELS.PENDING }
];

const FAILURE_TYPE_SELECT_OPTIONS: ReadonlyArray<CustomSelectOption<FailureTypeValue>> = [
  { value: '', label: 'Não classificado' },
  ...FAILURE_TYPE_OPTIONS.map((option) => ({
    value: option,
    label: FAILURE_TYPE_LABELS[option]
  }))
];

const FAILURE_CAUSE_SELECT_OPTIONS: ReadonlyArray<CustomSelectOption<FailureCauseValue>> = [
  { value: '', label: 'Não classificada' },
  ...FAILURE_CAUSE_OPTIONS.map((option) => ({
    value: option,
    label: FAILURE_CAUSE_LABELS[option]
  }))
];

function compareRmasForBoard(left: RmaResponse, right: RmaResponse): number {
  const priorityDiff = priorityWeight(right.priority) - priorityWeight(left.priority);
  if (priorityDiff !== 0) {
    return priorityDiff;
  }

  return compareDateStrings(right.updatedAt, left.updatedAt);
}

function compareRmasForQueue(left: RmaResponse, right: RmaResponse): number {
  const priorityDiff = priorityWeight(right.priority) - priorityWeight(left.priority);
  if (priorityDiff !== 0) {
    return priorityDiff;
  }

  return compareDateStrings(left.entryDate, right.entryDate);
}

function priorityWeight(priority: RmaPriority): number {
  switch (priority) {
    case 'HIGH':
      return 3;
    case 'MEDIUM':
      return 2;
    default:
      return 1;
  }
}

function compareDateStrings(left: string | null, right: string | null): number {
  return parseDateValue(left) - parseDateValue(right);
}

function parseDateValue(value: string | null): number {
  if (!value) {
    return 0;
  }

  return new Date(value).getTime();
}

function latestStatusUpdate(history: RmaStatusHistoryResponse[]): RmaStatusHistoryResponse | null {
  if (history.length === 0) {
    return null;
  }

  return [...history].sort((left, right) => compareDateStrings(right.changedAt, left.changedAt))[0] ?? null;
}

function normalizeText(value: string): string | null {
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function todayInputValue(): string {
  return new Date().toISOString().slice(0, 10);
}

function extractErrorMessage(error: unknown, fallback: string): string {
  if (typeof error === 'object' && error !== null) {
    const maybeHttpError = error as {
      error?: {
        message?: string;
        details?: string[];
      };
    };

    const message = maybeHttpError.error?.message?.trim();
    const details = maybeHttpError.error?.details?.filter(Boolean) ?? [];

    if (details.length > 0 && message) {
      return `${message}: ${details.join(' | ')}`;
    }

    if (message) {
      return message;
    }
  }

  return fallback;
}
