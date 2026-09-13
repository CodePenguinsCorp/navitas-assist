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
  WarrantyStatus
} from '../../core/models';
import { AuthService } from '../../core/services/auth.service';
import { CatalogService } from '../../core/services/catalog.service';
import { RmaService } from '../../core/services/rma.service';
import { extractHttpErrorMessage } from '../../core/utils/catalog-ui';
import {
  compareRmasForQueue,
  failureCauseLabel,
  failureTypeLabel,
  formatDate,
  formatDateTime,
  normalizeText,
  ownerLabel,
  priorityChipClass,
  priorityLabel,
  statusLabel,
  todayInputValue,
  trackableLabel,
  warrantyLabel,
  warrantyTextClass
} from '../../core/utils/rma-ui';
import {
  CustomSelectComponent,
  CustomSelectOption
} from '../../shared/form-controls/custom-select/custom-select.component';
import { DatePickerComponent } from '../../shared/form-controls/date-picker/date-picker.component';

type SearchStatusValue = RmaStatus | '';
type FailureTypeValue = FailureType | '';
type FailureCauseValue = FailureCause | '';
type WarrantyOverrideValue = WarrantyStatus | '';
type ModalView = 'create' | 'details' | 'diagnosis';

@Component({
  selector: 'app-rmas',
  imports: [ReactiveFormsModule, CustomSelectComponent, DatePickerComponent],
  templateUrl: './rmas.component.html',
  styles: [`
    :host {
      display: block;
    }

    .rma-table-row {
      cursor: pointer;
      transition: background 160ms ease;
    }

    .rma-table-row:hover,
    .rma-table-row:focus-visible {
      background: var(--surface-alt);
      outline: none;
    }

    .rma-table-row:focus-visible {
      box-shadow: inset 0 0 0 2px rgba(46, 168, 212, 0.34);
    }

    .rma-table-code {
      color: var(--brand-blue-deep);
    }

    .rma-open-hint {
      color: var(--brand-blue);
      font-weight: 700;
    }

    .rma-detail-copy {
      color: var(--muted);
      line-height: 1.55;
    }

    .purchase-date-unknown {
      min-height: 42px;
      align-self: center;
    }
  `]
})
export class RmasComponent {
  private readonly formBuilder = inject(FormBuilder);
  private readonly authService = inject(AuthService);
  private readonly catalogService = inject(CatalogService);
  private readonly rmaService = inject(RmaService);

  protected readonly loading = signal(true);
  protected readonly createSubmitting = signal(false);
  protected readonly dateErrors = signal({ manufacturedAt: '', purchaseDate: '', entryDate: '' });
  protected readonly diagnosisSubmitting = signal(false);
  protected readonly historyLoading = signal(false);

  protected readonly pageError = signal('');
  protected readonly pageMessage = signal('');
  protected readonly historyError = signal('');
  protected readonly historyMessage = signal('');
  protected readonly activeModal = signal<ModalView | null>(null);

  private readonly rmasSignal = signal<RmaResponse[]>([]);
  private readonly historySignal = signal<RmaResponse[]>([]);
  private readonly clientsSignal = signal<ClientResponse[]>([]);
  private readonly productsSignal = signal<ProductResponse[]>([]);
  private readonly selectedRmaSignal = signal<RmaResponse | null>(null);

  protected readonly rmas = computed(() =>
    [...this.rmasSignal()].sort(compareRmasForQueue)
  );
  protected readonly historyResults = this.historySignal.asReadonly();
  protected readonly selectedRma = this.selectedRmaSignal.asReadonly();

  protected readonly totalRmas = computed(() => this.rmasSignal().length);
  protected readonly ongoingRmas = computed(() =>
    this.rmasSignal().filter((rma) => !TERMINAL_RMA_STATUSES.has(rma.status)).length
  );
  protected readonly highPriorityRmas = computed(() =>
    this.rmasSignal().filter((rma) => rma.priority === 'HIGH').length
  );

  protected readonly statusLabel = statusLabel;
  protected readonly priorityLabel = priorityLabel;
  protected readonly priorityClass = priorityChipClass;
  protected readonly warrantyLabel = warrantyLabel;
  protected readonly warrantyTextClass = warrantyTextClass;
  protected readonly failureTypeLabel = failureTypeLabel;
  protected readonly failureCauseLabel = failureCauseLabel;
  protected readonly dateLabel = formatDate;
  protected readonly dateTimeLabel = formatDateTime;
  protected readonly trackableLabel = trackableLabel;
  protected readonly ownerLabel = ownerLabel;
  protected get todayDate(): string {
    return todayInputValue();
  }

  protected get entryMinDate(): string {
    const manufacturedAt = this.createForm.controls.manufacturedAt.value;
    const purchaseDate = this.createForm.controls.purchaseDateUnknown.value
      ? '' : this.createForm.controls.purchaseDate.value;
    return manufacturedAt > purchaseDate ? manufacturedAt : purchaseDate;
  }

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

  protected readonly statusFilterOptions = STATUS_FILTER_OPTIONS;
  protected readonly prioritySelectOptions = PRIORITY_SELECT_OPTIONS;
  protected readonly warrantyOverrideSelectOptions = WARRANTY_OVERRIDE_OPTIONS;
  protected readonly failureTypeSelectOptions = FAILURE_TYPE_SELECT_OPTIONS;
  protected readonly failureCauseSelectOptions = FAILURE_CAUSE_SELECT_OPTIONS;

  protected readonly canOpenRma = computed(() =>
    this.authService.hasAnyRole(['ADMIN', 'SERVICE_DESK'])
  );

  protected readonly canRegisterDiagnosis = computed(() =>
    this.authService.hasAnyRole(['ADMIN', 'TECHNICIAN'])
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
    reportedFailure: ['', [Validators.required, Validators.maxLength(1000)]],
    receivedAccessories: ['', [Validators.maxLength(500)]],
    physicalCondition: ['', [Validators.maxLength(500)]],
    priority: ['MEDIUM' as RmaPriority, [Validators.required]],
    warrantyStatusOverride: ['' as WarrantyOverrideValue],
    warrantyJustification: ['', [Validators.maxLength(1000)]],
    repairSummary: ['', [Validators.maxLength(600)]],
    replacedPartsSummary: ['', [Validators.maxLength(600)]],
    testSummary: ['', [Validators.maxLength(800)]]
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
    this.createForm.valueChanges.subscribe(() => {
      if (this.createForm.controls.purchaseDateUnknown.value && this.createForm.controls.purchaseDate.value) {
        this.createForm.controls.purchaseDate.setValue('');
        return;
      }
      this.dateErrors.set(this.validateCreateDates());
    });
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

  protected openCreateModal(): void {
    if (!this.canOpenRma()) {
      this.pageError.set('Seu perfil não pode abrir novos RMAs.');
      return;
    }

    this.pageError.set('');
    this.pageMessage.set('');
    this.activeModal.set('create');
  }

  protected openDetailsModal(rma: RmaResponse): void {
    this.selectRma(rma);
    this.pageMessage.set('');
    this.activeModal.set('details');
  }

  protected openDetailsFromKeyboard(event: Event, rma: RmaResponse): void {
    event.preventDefault();
    this.openDetailsModal(rma);
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
        this.historyError.set(extractHttpErrorMessage(error, 'Não foi possível consultar o histórico agora.'));
      }
    });
  }

  protected selectRma(rma: RmaResponse): void {
    this.selectedRmaSignal.set(rma);
    this.primeDetailForms(rma);
    this.pageError.set('');
  }

  protected selectHistoryItem(rma: RmaResponse): void {
    this.openDetailsModal(rma);
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
    const dateErrors = this.validateCreateDates();
    this.dateErrors.set(dateErrors);
    if (Object.values(dateErrors).some(Boolean)) {
      this.pageError.set('Corrija as datas indicadas no formulário.');
      this.pageMessage.set('');
      return;
    }
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
        this.pageError.set(extractHttpErrorMessage(error, 'Não foi possível abrir o RMA agora.'));
      }
    });
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
        this.pageError.set(extractHttpErrorMessage(error, 'Não foi possível salvar o diagnóstico agora.'));
      }
    });
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
        this.pageError.set(extractHttpErrorMessage(error, 'Não foi possível carregar a central de RMAs.'));
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
        this.pageError.set(extractHttpErrorMessage(error, 'Não foi possível carregar os RMAs agora.'));
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

  private validateCreateDates(): { manufacturedAt: string; purchaseDate: string; entryDate: string } {
    const { manufacturedAt, purchaseDate, purchaseDateUnknown, entryDate } = this.createForm.getRawValue();
    const knownPurchaseDate = purchaseDateUnknown ? '' : purchaseDate;
    return {
      manufacturedAt: manufacturedAt && manufacturedAt > this.todayDate
        ? 'A fabricação não pode ser posterior a hoje.' : '',
      purchaseDate: knownPurchaseDate && knownPurchaseDate > this.todayDate
        ? 'A compra não pode ser posterior a hoje.'
        : knownPurchaseDate && manufacturedAt && knownPurchaseDate < manufacturedAt
          ? 'A compra não pode ser anterior à fabricação.' : '',
      entryDate: entryDate && manufacturedAt && entryDate < manufacturedAt
        ? 'A entrada não pode ser anterior à fabricação.'
        : knownPurchaseDate && entryDate && entryDate < knownPurchaseDate
          ? 'A entrada não pode ser anterior à compra.' : ''
    };
  }

  private buildFilters(): { query?: string; status?: RmaStatus } {
    const raw = this.filtersForm.getRawValue();
    const query = normalizeText(raw.query);

    return {
      query: query ?? undefined,
      status: raw.status || undefined
    };
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

const TERMINAL_RMA_STATUSES = new Set<RmaStatus>(['COMPLETED', 'RETURNED', 'IRREPARABLE']);

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
