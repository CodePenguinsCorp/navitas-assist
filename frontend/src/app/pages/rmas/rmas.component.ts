import { IconComponent } from '../../shared/icon/icon.component';
import { NgComponentOutlet } from '@angular/common';
import { Component, ElementRef, Injector, Type, afterNextRender, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { AbstractControl, FormBuilder, ReactiveFormsModule, ValidationErrors, Validators } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { Subject, catchError, finalize, forkJoin, map, of, switchMap } from 'rxjs';
import {
  FAILURE_CAUSE_LABELS,
  FAILURE_CAUSE_OPTIONS,
  FAILURE_TYPE_LABELS,
  FAILURE_TYPE_OPTIONS,
  RMA_PRIORITY_LABELS,
  RMA_STATUS_FLOW,
  RMA_STATUS_LABELS
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
  RmaSummaryResponse,
  RmaStatus
} from '../../core/models';
import { AuthService } from '../../core/services/auth.service';
import { PermissionService } from '../../core/services/permission.service';
import { CatalogService } from '../../core/services/catalog.service';
import { RmaService } from '../../core/services/rma.service';
import { extractHttpErrorMessage } from '../../core/utils/catalog-ui';
import { PagedList } from '../../core/utils/paged-list';
import { todayInputValue } from '../../core/utils/date';
import { ClockService } from '../../core/services/clock.service';
import {
  NO_DIAGNOSIS_LABEL,
  blockedLabel,
  diagnosisFacts,
  historyEntryTitle,
  invoiceFact,
  purchaseFact,
  receiptFacts,
  repairFacts,
  rmaHistory,
  rmaItemFacts,
  sectionLabel,
  stageFact
} from '../../core/utils/rma-detail';
import {
  failureCauseLabel,
  failureTypeLabel,
  formatDate,
  formatDateTime,
  normalizeText,
  ownerLabel,
  priorityChipClass,
  priorityLabel,
  productSummary,
  initialsOf,
  itemCountLabel,
  rmaItemTrackableLabel,
  statusLabel,
  trackableLabel,
  warrantyLabel,
  warrantyClass
} from '../../core/utils/rma-ui';
import {
  CustomSelectComponent,
  CustomSelectOption
} from '../../shared/form-controls/custom-select/custom-select.component';
import { DatePickerComponent } from '../../shared/form-controls/date-picker/date-picker.component';
import { ModalFocusDirective } from '../../shared/modal-focus/modal-focus.directive';
import { PageHeaderComponent } from '../../shared/page-header/page-header.component';
import { PaginationComponent } from '../../shared/pagination/pagination.component';
import { RmaBlocksSectionComponent } from '../../shared/rma-blocks-section/rma-blocks-section.component';
import { RmaPartsPanelComponent } from '../../shared/rma-parts-panel/rma-parts-panel.component';
import { RmaDueDateFieldComponent } from '../../shared/rma-due-date-field/rma-due-date-field.component';
import { RmaStageTimesComponent } from '../../shared/rma-stage-times/rma-stage-times.component';
import { RowActionComponent } from '../../shared/row-action/row-action.component';

type SearchStatusValue = RmaStatus | '';
type FailureTypeValue = FailureType | '';
type FailureCauseValue = FailureCause | '';
type ModalView = 'create' | 'details' | 'diagnosis';
type DetailTab = 'products' | 'diagnosis' | 'parts' | 'protocols' | 'blocks' | 'history';

interface CreateDateErrors {
  manufacturedAt: string[];
  purchaseDate: string;
  entryDate: string;
  dueDate: string;
}

/** Filters confirmed by "Buscar"/"Limpar"; the list and the summary only read these. */
export interface RmaListFilters {
  query?: string;
  status?: RmaStatus;
}

@Component({
  selector: 'app-rmas',
  imports: [IconComponent, ReactiveFormsModule, CustomSelectComponent, DatePickerComponent, ModalFocusDirective, NgComponentOutlet, RmaPartsPanelComponent, PaginationComponent, RmaBlocksSectionComponent, PageHeaderComponent, RowActionComponent, RmaDueDateFieldComponent, RmaStageTimesComponent],
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
      box-shadow: inset 0 0 0 2px color-mix(in srgb, var(--brand-sky) 34%, transparent);
    }

    .rma-table-code {
      color: var(--brand-blue-deep);
      white-space: nowrap;
    }

    /* The form only groups the controls; its children are items of the shared toolbar. */
    .rma-filters {
      display: contents;
    }

    .rma-filters__actions {
      display: flex;
      align-items: center;
      gap: var(--space-3);
    }

    .rma-items-editor,
    .rma-details {
      display: grid;
      align-content: start;
      /* Rows keep their content height; the fixed-height modal scrolls instead of squeezing the tabs. */
      grid-auto-rows: max-content;
    }

    .rma-details {
      gap: var(--space-5);
      padding: var(--space-5) var(--space-4) var(--space-5) var(--space-5);
    }

    .rma-details__header {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: var(--space-4);
    }

    .rma-details__identity {
      display: grid;
      gap: var(--space-1);
      min-width: 0;
    }

    .rma-details__code {
      font-size: var(--font-size-sm);
      font-weight: 600;
      color: var(--muted);
    }

    .rma-details__identity h3 {
      margin: 0;
      font-size: 1.4rem;
      line-height: 1.25;
      color: var(--brand-blue-deep);
      overflow-wrap: anywhere;
    }

    .rma-details__note {
      margin: 0;
      color: var(--muted);
    }

    .rma-details__chips {
      display: flex;
      flex-wrap: wrap;
      gap: var(--space-2);
      margin-top: var(--space-1);
    }

    .rma-details__header-actions {
      display: flex;
      align-items: center;
      gap: var(--space-3);
      flex-shrink: 0;
    }

    .rma-items-editor,
    .rma-diagnosis__context {
      padding: var(--space-3) var(--space-4);
      border: 1px solid var(--line);
      border-radius: var(--radius-md);
      background: var(--surface-alt);
    }

    .rma-items-editor {
      gap: var(--space-3);
    }

    .rma-details__panel {
      min-height: 360px;
    }

    .rma-details__section + .rma-details__section {
      margin-top: var(--space-5);
    }

    .rma-details__section h4 {
      margin: 0 0 var(--space-2);
      font-size: 0.95rem;
    }

    .rma-details__section p {
      margin: 0;
    }

    .rma-details__pairs {
      grid-template-columns: repeat(3, minmax(0, 1fr));
    }

    .rma-items-detail {
      display: grid;
      gap: var(--space-3);
      margin-top: var(--space-3);
    }

    .rma-item-editor {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: var(--space-3);
      padding: var(--space-4);
      border: 1px solid var(--line);
      border-radius: var(--radius-md);
      background: var(--surface);
    }

    .rma-item-editor__error {
      grid-column: 1 / -1;
      margin: 0;
    }

    /* Aligns the row action with the controls: same top offset as a label, same height as a control. */
    .rma-item-editor__action {
      display: flex;
      align-items: center;
      min-height: var(--control-height);
      margin-top: calc(1lh + var(--space-2));
    }

    /* Grid layout comes from the shared .detail-tile. */
    .rma-item-detail {
      gap: var(--space-3);
    }

    .rma-item-detail__header {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: var(--space-3);
    }

    .rma-item-detail__header > div {
      display: grid;
      gap: 2px;
      min-width: 0;
    }

    .rma-item-detail__sku {
      font-size: var(--font-size-xs);
      font-weight: 600;
      color: var(--muted);
    }

    .rma-item-warranties {
      display: grid;
      justify-items: start;
      gap: var(--space-2);
    }


    .rma-create-form > * {
      grid-column: 1 / -1;
    }

    .rma-create-form textarea {
      min-height: 84px;
    }

    .rma-create-form__receipt {
      grid-template-columns: repeat(6, minmax(0, 1fr));
    }

    .rma-create-form__receipt > .col-2 {
      grid-column: span 2;
    }

    .rma-create-form__receipt > .col-3 {
      grid-column: span 3;
    }

    /* Purchase date, "Compra desconhecida" and its consequence stacked in one group;
       .modal-panel .field-group would otherwise impose three rows. */
    .rma-purchase {
      grid-template-rows: auto;
    }

    .rma-create-form__done {
      display: grid;
      gap: var(--space-3);
      padding-top: var(--space-4);
      border-top: 1px solid var(--line);
    }

    .rma-create-form__done > summary {
      width: fit-content;
      cursor: pointer;
      font-weight: var(--font-weight-semibold);
    }

    .rma-item-editor--row {
      grid-template-columns: minmax(0, 1.6fr) repeat(3, minmax(0, 1fr)) auto;
    }

    /* Read-only context the technician compares with the found failure. */
    .rma-diagnosis__context {
      margin-bottom: var(--space-4);
    }

    @media (max-width: 900px) {
      .rma-create-form__receipt {
        grid-template-columns: repeat(2, minmax(0, 1fr));
      }

      .rma-create-form__receipt > .col-2,
      .rma-create-form__receipt > .col-3 {
        grid-column: span 1;
      }

      .rma-item-editor--row {
        grid-template-columns: repeat(2, minmax(0, 1fr));
      }

      .rma-item-editor__action {
        margin-top: 0;
      }

      .rma-details__pairs {
        grid-template-columns: repeat(2, minmax(0, 1fr));
      }
    }

    @media (max-width: 720px) {
      .rma-create-form__receipt,
      .rma-item-editor,
      .rma-item-editor--row {
        grid-template-columns: 1fr;
      }

      /* Identity and Fechar share the first row; the diagnosis action takes its own row below. */
      .rma-details__header {
        display: grid;
        grid-template-columns: minmax(0, 1fr) auto;
      }

      .rma-details__header-actions {
        display: contents;
      }

      .rma-details__header-actions .modal-close {
        grid-column: 2;
        grid-row: 1;
      }

      .rma-details__header-actions .button-primary {
        grid-column: 1 / -1;
        grid-row: 2;
        justify-self: start;
      }
    }
  `]
})
export class RmasComponent {
  protected readonly protocolsComponent = signal<Type<unknown> | null>(null);
  private readonly formBuilder = inject(FormBuilder);
  private readonly authService = inject(AuthService);
  private readonly permissions = inject(PermissionService);
  private readonly catalogService = inject(CatalogService);
  private readonly rmaService = inject(RmaService);
  private readonly route = inject(ActivatedRoute);
  private readonly host: ElementRef<HTMLElement> = inject(ElementRef);
  private readonly injector = inject(Injector);

  protected readonly createSubmitting = signal(false);
  /** Creation feedback shown inside the dialog (validation and service errors). */
  protected readonly createErrorMessage = signal('');
  protected readonly createSubmitAttempted = signal(false);
  /**
   * "Atendimento já realizado" group. Collapsing only hides the presentation:
   * its controls stay in the DOM and in createForm.
   */
  protected readonly retroactiveOpen = signal(false);
  protected readonly dateErrors = signal<CreateDateErrors>({ manufacturedAt: [], purchaseDate: '', entryDate: '', dueDate: '' });
  protected readonly diagnosisSubmitting = signal(false);
  /** Diagnosis feedback shown inside the dialog (validation and service errors). */
  protected readonly diagnosisErrorMessage = signal('');
  protected readonly diagnosisSubmitAttempted = signal(false);

  protected readonly pageError = signal('');
  protected readonly pageMessage = signal('');
  protected readonly activeModal = signal<ModalView | null>(null);
  protected readonly detailTab = signal<DetailTab>('products');
  protected readonly detailTabs: ReadonlyArray<{ id: DetailTab; label: string }> = [
    { id: 'products', label: 'Produtos' },
    { id: 'diagnosis', label: 'Diagnóstico' },
    { id: 'parts', label: 'Peças' },
    { id: 'protocols', label: 'Protocolos' },
    { id: 'blocks', label: 'Impedimentos' },
    { id: 'history', label: 'Histórico' }
  ];

  /** Last filter confirmed by "Buscar" or "Limpar"; paging, size, refresh and retry reuse it. */
  private readonly appliedFilters = signal<RmaListFilters>({});
  /**
   * Each load of list and summary together (Buscar, Limpar, retry, refresh) opens a new generation,
   * so a repeated filter or A → B → A never reuses an older list or mixes it with a newer summary.
   */
  private readonly generation = signal(0);
  /** Generation of the list request in flight; copied to resultGeneration when it responds. */
  private requestedGeneration = 0;
  /** Whether the list request in flight has no filter, so its total is the whole registry. */
  private requestedUnfiltered = true;
  /** Total of RMAs without filter, from the last unfiltered list; null until one succeeds. */
  private readonly overallTotal = signal<number | null>(null);
  /** Generation of the list result on screen. */
  private readonly resultGeneration = signal(-1);
  /** Last list query failed; independent of the cached page and of page messages. */
  protected readonly loadFailed = signal(false);
  protected readonly listErrorMessage = signal('');

  private readonly rmaList = new PagedList<RmaResponse>(
    (pageQuery) => {
      const filters = this.appliedFilters();
      this.requestedGeneration = this.generation();
      this.requestedUnfiltered = !filters.query && !filters.status;
      return this.rmaService.list({ ...pageQuery, query: filters.query, status: filters.status });
    },
    (error) => {
      this.loadFailed.set(true);
      this.listErrorMessage.set(extractHttpErrorMessage(error, 'Não foi possível carregar os RMAs.'));
    },
    (rmas) => {
      this.resultGeneration.set(this.requestedGeneration);
      this.loadFailed.set(false);
      if (this.requestedUnfiltered) this.overallTotal.set(this.rmaList.totalElements());
      this.syncSelection(rmas);
    }
  );
  private readonly clientsSignal = signal<ClientResponse[]>([]);
  private readonly productsSignal = signal<ProductResponse[]>([]);
  private readonly selectedRmaSignal = signal<RmaResponse | null>(null);

  protected readonly rmas = this.rmaList.items;
  protected readonly loading = this.rmaList.loading;
  protected readonly page = this.rmaList.page;
  protected readonly pageSize = this.rmaList.size;
  protected readonly totalElements = this.rmaList.totalElements;
  protected readonly totalPages = this.rmaList.totalPages;
  protected readonly selectedRma = this.selectedRmaSignal.asReadonly();

  protected readonly hasActiveFilters = computed(() =>
    Boolean(this.appliedFilters().query || this.appliedFilters().status)
  );
  protected readonly hasLoaded = computed(() => this.rmaList.result() !== null);
  /** The list on screen answers the current generation and the last query did not fail. */
  protected readonly hasCurrentResult = computed(() =>
    this.rmaList.result() !== null && !this.loadFailed() && this.resultGeneration() === this.generation()
  );

  private readonly summaryRequests = new Subject<{ generation: number; filters: RmaListFilters }>();
  private readonly summarySignal = signal<{ generation: number; value: RmaSummaryResponse } | null>(null);
  protected readonly summary = this.summarySignal.asReadonly();
  /** Indicators only for the generation of the list on screen; never zeros or another load's values. */
  protected readonly visibleSummary = computed(() => {
    const summary = this.summarySignal();
    return summary && this.hasCurrentResult() && summary.generation === this.resultGeneration()
      ? summary.value : null;
  });
  /**
   * First indicator: "Y RMAs" without filter, "X de Y RMAs" with one (Y = whole registry), with the
   * singular of the last number. Hidden before the first success and after a failure.
   */
  protected readonly totalSummary = computed(() => {
    if (!this.hasCurrentResult()) return null;
    const count = this.totalElements();
    const overall = this.hasActiveFilters() ? this.overallTotal() : null;
    return { count, overall, label: (overall ?? count) === 1 ? 'RMA' : 'RMAs' };
  });

  protected readonly statusLabel = statusLabel;
  protected readonly priorityLabel = priorityLabel;
  protected readonly priorityClass = priorityChipClass;
  protected readonly warrantyLabel = warrantyLabel;
  protected readonly warrantyClass = warrantyClass;
  protected readonly failureTypeLabel = failureTypeLabel;
  protected readonly failureCauseLabel = failureCauseLabel;
  protected readonly dateLabel = formatDate;
  protected readonly dateTimeLabel = formatDateTime;
  protected readonly trackableLabel = trackableLabel;
  protected readonly ownerLabel = ownerLabel;
  protected readonly productSummary = productSummary;
  protected readonly itemCountLabel = itemCountLabel;
  protected readonly itemTrackableLabel = rmaItemTrackableLabel;
  protected readonly initials = initialsOf;
  protected readonly clock = inject(ClockService);
  protected readonly blockedLabel = blockedLabel;
  protected readonly sectionLabel = sectionLabel;
  protected readonly invoiceFact = invoiceFact;
  protected readonly purchaseFact = purchaseFact;
  protected readonly rmaItemFacts = rmaItemFacts;
  protected readonly receiptFacts = receiptFacts;
  protected readonly diagnosisFacts = diagnosisFacts;
  protected readonly repairFacts = repairFacts;
  protected readonly rmaHistory = rmaHistory;
  protected readonly historyEntryTitle = historyEntryTitle;
  protected readonly stageFact = stageFact;
  protected readonly noDiagnosisLabel = NO_DIAGNOSIS_LABEL;

  protected get todayDate(): string {
    return todayInputValue();
  }

  protected get purchaseMinDate(): string {
    return this.latestManufacturedDate();
  }

  protected get entryMinDate(): string {
    const purchaseDate = this.createForm.controls.purchaseDateUnknown.value
      ? '' : this.createForm.controls.purchaseDate.value;
    return [this.latestManufacturedDate(), purchaseDate].filter(Boolean).sort().at(-1) ?? '';
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
      label: `${product.sku} · ${product.name}`
    }))
  ]);

  protected readonly statusFilterOptions = STATUS_FILTER_OPTIONS;
  protected readonly prioritySelectOptions = PRIORITY_SELECT_OPTIONS;
  protected readonly failureTypeSelectOptions = FAILURE_TYPE_SELECT_OPTIONS;
  protected readonly failureCauseSelectOptions = FAILURE_CAUSE_SELECT_OPTIONS;

  protected readonly canOpenRma = computed(() => this.permissions.hasPermission('rma.abrir'));

  protected readonly canRegisterDiagnosis = computed(() => this.permissions.hasPermission('rma.diagnosticar'));

  /** `rma.editar`: general data, including the due date. */
  protected readonly canEditRma = computed(() => this.permissions.hasPermission('rma.editar'));

  protected readonly filtersForm = this.formBuilder.nonNullable.group({
    query: [''],
    status: ['' as SearchStatusValue]
  });

  protected readonly createForm = this.formBuilder.nonNullable.group({
    clientId: [0, [Validators.required, Validators.min(1)]],
    items: this.formBuilder.array([this.createRmaItemForm()]),
    purchaseDate: [''],
    purchaseDateUnknown: [false],
    entryDate: [todayInputValue(), [Validators.required]],
    dueDate: [''],
    invoiceNumber: [''],
    reportedFailure: ['', [Validators.required, Validators.maxLength(1000)]],
    receivedAccessories: ['', [Validators.maxLength(500)]],
    physicalCondition: ['', [Validators.maxLength(500)]],
    priority: ['MEDIUM' as RmaPriority, [Validators.required]],
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
    this.summaryRequests.pipe(
      switchMap(({ generation, filters }) => {
        this.summarySignal.set(null);
        return this.rmaService.getSummary(filters).pipe(
          map((value) => ({ generation, value })),
          catchError(() => of(null))
        );
      }),
      takeUntilDestroyed()
    ).subscribe((summary) => this.summarySignal.set(summary));
    this.seedOperatorDefaults();
    this.loadWorkspace();
    this.openRequestedRma();
  }

  protected get createItems() {
    return this.createForm.controls.items;
  }

  protected addCreateItem(): void {
    this.createItems.push(this.createRmaItemForm());
  }

  protected removeCreateItem(index: number): void {
    if (this.createItems.length > 1) {
      this.createItems.removeAt(index);
    }
  }

  protected submitFilters(): void {
    this.appliedFilters.set(this.buildFilters());
    this.pageMessage.set('');
    this.pageError.set('');
    this.loadListAndSummary(true);
  }

  protected goToPage(page: number): void {
    this.pageError.set('');
    this.rmaList.goToPage(page);
  }

  protected changePageSize(size: number): void {
    this.pageError.set('');
    this.rmaList.changeSize(size);
  }

  protected clearFilters(): void {
    this.filtersForm.setValue({
      query: '',
      status: ''
    });
    this.appliedFilters.set({});
    this.pageMessage.set('');
    this.pageError.set('');
    this.loadListAndSummary(true);
  }

  protected retryLoad(): void {
    this.loadListAndSummary();
  }

  protected openCreateModal(): void {
    if (!this.canOpenRma()) {
      this.pageError.set('Seu perfil não pode abrir novos RMAs.');
      return;
    }

    this.pageError.set('');
    this.pageMessage.set('');
    this.createErrorMessage.set('');
    this.createSubmitAttempted.set(false);
    this.activeModal.set('create');
  }

  protected showCreateError(control: AbstractControl): boolean {
    return control.invalid && (control.touched || this.createSubmitAttempted());
  }

  /** aria-describedby value from the ids of the messages currently shown, or no attribute. */
  protected describedBy(...ids: Array<string | false>): string | null {
    return ids.filter(Boolean).join(' ') || null;
  }

  protected openDetailsModal(rma: RmaResponse): void {
    void import('../../shared/rma-protocols/rma-protocols.component').then((module) => this.protocolsComponent.set(module.RmaProtocolsComponent));
    this.selectRma(rma);
    this.pageMessage.set('');
    this.detailTab.set('products');
    this.activeModal.set('details');
  }

  /** Same tab contract as notifications: arrows wrap, Home/End jump to the ends; selection follows focus. */
  protected onDetailTabKeydown(event: KeyboardEvent): void {
    const ids = this.detailTabs.map((tab) => tab.id);
    const current = ids.indexOf(this.detailTab());
    let next: number;
    switch (event.key) {
      case 'ArrowRight': next = (current + 1) % ids.length; break;
      case 'ArrowLeft': next = (current - 1 + ids.length) % ids.length; break;
      case 'Home': next = 0; break;
      case 'End': next = ids.length - 1; break;
      default: return;
    }
    event.preventDefault();
    this.detailTab.set(ids[next]);
    this.host.nativeElement.querySelector<HTMLElement>(`#rma-tab-${ids[next]}`)?.focus();
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
    this.diagnosisErrorMessage.set('');
    this.diagnosisSubmitAttempted.set(false);
    this.activeModal.set('diagnosis');
  }

  protected showDiagnosisError(control: AbstractControl): boolean {
    return control.invalid && (control.touched || this.diagnosisSubmitAttempted());
  }

  protected closeModal(): void {
    if (this.createSubmitting() || this.diagnosisSubmitting()) return;
    this.resetModal();
  }

  protected selectRma(rma: RmaResponse): void {
    this.selectedRmaSignal.set(rma);
    this.primeDetailForms(rma);
    this.pageError.set('');
  }

  protected createRma(): void {
    if (!this.canOpenRma()) {
      this.pageError.set('Seu perfil não pode abrir novos RMAs.');
      return;
    }

    this.createErrorMessage.set('');

    if (this.createForm.invalid) {
      this.createForm.markAllAsTouched();
      this.createSubmitAttempted.set(true);
      this.createErrorMessage.set('Preencha os campos obrigatórios.');
      this.pageMessage.set('');
      this.revealInvalidRetroactiveField();
      return;
    }

    const raw = this.createForm.getRawValue();
    const dateErrors = this.validateCreateDates();
    this.dateErrors.set(dateErrors);
    if (dateErrors.manufacturedAt.some(Boolean) || dateErrors.purchaseDate || dateErrors.entryDate || dateErrors.dueDate) {
      this.createErrorMessage.set('Corrija as datas indicadas no formulário.');
      this.pageMessage.set('');
      return;
    }
    const payload: CreateRmaRequest = {
      clientId: raw.clientId,
      items: raw.items.map((item) => ({
        productId: item.productId,
        batchNumber: normalizeText(item.batchNumber),
        serialNumber: normalizeText(item.serialNumber),
        manufacturedAt: normalizeText(item.manufacturedAt)
      })),
      purchaseDate: raw.purchaseDateUnknown ? null : normalizeText(raw.purchaseDate),
      purchaseDateUnknown: raw.purchaseDateUnknown,
      entryDate: raw.entryDate,
      invoiceNumber: normalizeText(raw.invoiceNumber),
      reportedFailure: raw.reportedFailure.trim(),
      receivedAccessories: normalizeText(raw.receivedAccessories),
      physicalCondition: normalizeText(raw.physicalCondition),
      priority: raw.priority,
      repairSummary: normalizeText(raw.repairSummary),
      replacedPartsSummary: normalizeText(raw.replacedPartsSummary),
      testSummary: normalizeText(raw.testSummary),
      dueDate: normalizeText(raw.dueDate)
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
        this.createSubmitAttempted.set(false);
        this.filtersForm.setValue({ query: '', status: '' });
        this.appliedFilters.set({});
        this.resetModal();
        this.pageMessage.set(`RMA ${rma.code} criado com sucesso.`);
        this.refreshRmas();
      },
      error: (error) => {
        this.createErrorMessage.set(extractHttpErrorMessage(error, 'Não foi possível abrir o RMA agora.'));
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

    this.diagnosisErrorMessage.set('');

    if (this.diagnosisForm.invalid) {
      this.diagnosisForm.markAllAsTouched();
      this.diagnosisSubmitAttempted.set(true);
      this.diagnosisErrorMessage.set('Preencha os campos obrigatórios do diagnóstico.');
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
        this.diagnosisSubmitAttempted.set(false);
        this.resetModal();
        this.pageMessage.set(`Diagnóstico do ${updated.code} salvo com sucesso.`);
        this.refreshRmas();
      },
      error: (error) => {
        this.diagnosisErrorMessage.set(extractHttpErrorMessage(error, 'Não foi possível salvar o diagnóstico agora.'));
      }
    });
  }

  /** A save made inside the detail (impediment, due date) refreshes the detail and the list. */
  protected detailRmaSaved(updated: RmaResponse): void {
    this.selectedRmaSignal.set(updated);
    this.refreshRmas();
  }

  /** Opens the collapsed retroactive group and focuses its first invalid field, if any. */
  private revealInvalidRetroactiveField(): void {
    const invalid = RETROACTIVE_CONTROLS.find((name) => this.createForm.controls[name].invalid);
    if (!invalid) return;

    this.retroactiveOpen.set(true);
    afterNextRender(() => {
      this.host.nativeElement.querySelector<HTMLElement>(`#${invalid}`)?.focus();
    }, { injector: this.injector });
  }

  /** Opens the RMA referenced by an internal notification link (/rmas?rma=<id>). */
  private openRequestedRma(): void {
    const rmaId = Number(this.route.snapshot.queryParamMap.get('rma'));
    if (!Number.isInteger(rmaId) || rmaId <= 0) {
      return;
    }

    this.rmaService.getById(rmaId).subscribe({
      next: (rma) => this.openDetailsModal(rma),
      error: (error) => this.pageError.set(extractHttpErrorMessage(error, 'Não foi possível abrir o RMA da notificação.'))
    });
  }

  private resetModal(): void {
    this.activeModal.set(null);
  }

  private loadWorkspace(): void {
    this.pageError.set('');
    this.loadListAndSummary();

    forkJoin({
      clients: this.catalogService.listClientOptions(),
      products: this.catalogService.listProductOptions()
    }).subscribe({
      next: ({ clients, products }) => {
        this.clientsSignal.set(clients);
        this.productsSignal.set(products);
      },
      error: (error) => {
        this.pageError.set(extractHttpErrorMessage(error, 'Não foi possível carregar clientes e produtos.'));
      }
    });
  }

  private refreshRmas(): void {
    this.pageError.set('');
    this.loadListAndSummary();
  }

  /** Opens a new generation before requesting, so neither response can match an older load. */
  private loadListAndSummary(firstPage = false): void {
    this.generation.update((value) => value + 1);
    if (firstPage) this.rmaList.firstPage();
    else this.rmaList.reload();
    const { query, status } = this.appliedFilters();
    this.summaryRequests.next({ generation: this.generation(), filters: { query, status } });
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

    this.diagnosisForm.patchValue({
      technicianName: operatorName
    });
  }

  private resetCreateForm(): void {
    this.createItems.clear();
    this.createItems.push(this.createRmaItemForm());
    this.createForm.reset({
      clientId: 0,
      items: [{ productId: 0, batchNumber: '', serialNumber: '', manufacturedAt: '' }],
      purchaseDate: '',
      purchaseDateUnknown: false,
      entryDate: todayInputValue(),
      dueDate: '',
      invoiceNumber: '',
      reportedFailure: '',
      receivedAccessories: '',
      physicalCondition: '',
      priority: 'MEDIUM',
      repairSummary: '',
      replacedPartsSummary: '',
      testSummary: ''
    });
    this.dateErrors.set({ manufacturedAt: [], purchaseDate: '', entryDate: '', dueDate: '' });
    this.retroactiveOpen.set(false);
  }

  private validateCreateDates(): CreateDateErrors {
    const { items, purchaseDate, purchaseDateUnknown, entryDate, dueDate } = this.createForm.getRawValue();
    const manufacturedDates = items.map((item) => item.manufacturedAt).filter(Boolean);
    const latestManufacturedDate = manufacturedDates.sort().at(-1) ?? '';
    const knownPurchaseDate = purchaseDateUnknown ? '' : purchaseDate;

    return {
      manufacturedAt: items.map((item) => item.manufacturedAt && item.manufacturedAt > this.todayDate
        ? 'A fabricação não pode ser posterior a hoje.' : ''),
      purchaseDate: knownPurchaseDate && knownPurchaseDate > this.todayDate
        ? 'A compra não pode ser posterior a hoje.'
        : knownPurchaseDate && latestManufacturedDate && knownPurchaseDate < latestManufacturedDate
          ? 'A compra não pode ser anterior à fabricação.' : '',
      entryDate: knownPurchaseDate && entryDate && entryDate < knownPurchaseDate
        ? 'A entrada não pode ser anterior à compra.'
        : latestManufacturedDate && entryDate && entryDate < latestManufacturedDate
          ? 'A entrada não pode ser anterior à fabricação.' : '',
      dueDate: dueDate && entryDate && dueDate < entryDate ? 'A data limite não pode ser anterior à entrada.' : ''
    };
  }

  private latestManufacturedDate(): string {
    return this.createItems.controls
      .map((item) => item.controls.manufacturedAt.value)
      .filter(Boolean)
      .sort()
      .at(-1) ?? '';
  }

  private buildFilters(): RmaListFilters {
    const raw = this.filtersForm.getRawValue();
    const query = normalizeText(raw.query);

    return {
      query: query ?? undefined,
      status: raw.status || undefined
    };
  }

  private createRmaItemForm() {
    return this.formBuilder.nonNullable.group({
      productId: [0, [Validators.required, Validators.min(1)]],
      batchNumber: ['', [Validators.maxLength(60)]],
      serialNumber: ['', [Validators.maxLength(60)]],
      manufacturedAt: ['']
    }, { validators: atLeastOneItemIdentification });
  }

  private currentOperatorName(): string {
    const user = this.authService.currentUser();
    return user?.name ?? user?.username ?? '';
  }
}

function atLeastOneItemIdentification(control: AbstractControl): ValidationErrors | null {
  const batchNumber = control.get('batchNumber')?.value;
  const serialNumber = control.get('serialNumber')?.value;
  return batchNumber?.trim() || serialNumber?.trim() ? null : { identificationRequired: true };
}

/** Records of a service already performed, in the order of the "Atendimento já realizado" group. */
const RETROACTIVE_CONTROLS = ['repairSummary', 'replacedPartsSummary', 'testSummary'] as const;

const STATUS_FILTER_OPTIONS:ReadonlyArray<CustomSelectOption<SearchStatusValue>> = [
  { value: '', label: 'Todos' },
  ...RMA_STATUS_FLOW.map((status) => ({
    value: status,
    label: RMA_STATUS_LABELS[status]
  }))
];

const PRIORITY_SELECT_OPTIONS: ReadonlyArray<CustomSelectOption<RmaPriority>> = [
  { value: 'HIGH', label: RMA_PRIORITY_LABELS.HIGH },
  { value: 'MEDIUM', label: RMA_PRIORITY_LABELS.MEDIUM },
  { value: 'LOW', label: RMA_PRIORITY_LABELS.LOW }
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
