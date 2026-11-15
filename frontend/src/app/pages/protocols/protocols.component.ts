import { IconComponent } from '../../shared/icon/icon.component';
import { SuggestInputComponent } from '../../shared/form-controls/suggest-input/suggest-input.component';
import { Component, DestroyRef, ElementRef, Injector, afterNextRender, computed, inject, signal, viewChild } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { AbstractControl, FormArray, FormBuilder, FormGroup, ReactiveFormsModule, ValidationErrors, Validators } from '@angular/forms';
import { Observable, finalize } from 'rxjs';
import { RMA_STATUS_LABELS } from '../../core/mock-data';
import { ProtocolItemType, ProtocolTemplateItemResponse, ProtocolTemplateRequest, ProtocolTemplateResponse, RmaStatus } from '../../core/models';
import { CatalogService } from '../../core/services/catalog.service';
import { PermissionService } from '../../core/services/permission.service';
import { ProtocolService } from '../../core/services/protocol.service';
import { extractHttpErrorMessage, includesQuery, normalizeOptionalText } from '../../core/utils/catalog-ui';
import { formatBusinessDateTime } from '../../core/utils/date';
import { PROTOCOL_ITEM_TYPE_LABELS, normalizeDecimal } from '../../core/utils/protocol-ui';
import { CustomSelectComponent, CustomSelectOption } from '../../shared/form-controls/custom-select/custom-select.component';
import { ModalFocusDirective } from '../../shared/modal-focus/modal-focus.directive';
import { PageHeaderComponent } from '../../shared/page-header/page-header.component';
import { ResultCountComponent } from '../../shared/result-count/result-count.component';
import { RowActionComponent } from '../../shared/row-action/row-action.component';

/** Limite de itens do contrato (ProtocolTemplateRequest). */
const MAX_ITEMS = 100;
const DECIMAL_PATTERN = /^-?\d{1,13}([.,]\d{1,6})?$/;

@Component({
  selector: 'app-protocols',
  imports: [IconComponent, RowActionComponent, ReactiveFormsModule, CustomSelectComponent, ModalFocusDirective, PageHeaderComponent, ResultCountComponent, SuggestInputComponent],
  templateUrl: './protocols.component.html',
  styles: [`
    :host {
      display: block;
    }

    .item-editor {
      grid-template-columns: repeat(4, minmax(0, 1fr));
      gap: var(--space-4) var(--space-3);
      margin: 0;
    }

    .item-editor__title,
    .item-editor__measurement,
    .item-editor__flags {
      grid-column: 1 / -1;
    }

    .item-editor__half {
      grid-column: span 2;
    }

    .item-editor__title input {
      font-size: var(--font-size-lg);
      font-weight: var(--font-weight-semibold);
    }

    .item-editor__hint {
      color: var(--muted);
      font-size: var(--font-size-sm);
    }

    .item-editor__measurement {
      display: grid;
      grid-template-columns: repeat(4, minmax(0, 1fr));
      gap: var(--space-2) var(--space-3);
      min-width: 0;
      margin: 0;
      padding: 0;
      border: 0;
    }

    .item-editor__measurement legend {
      grid-column: 1 / -1;
      padding: 0;
      margin-bottom: var(--space-1);
      color: var(--muted);
      font-size: var(--font-size-sm);
      font-weight: var(--font-weight-semibold);
      letter-spacing: 0.04em;
      text-transform: uppercase;
    }

    .item-editor__flags {
      display: flex;
      flex-wrap: wrap;
      gap: var(--space-1) var(--space-5);
    }

    .item-row__title--empty {
      color: var(--muted);
      font-weight: var(--font-weight-regular, 400);
    }

    @media (max-width: 600px) {
      .item-editor__half {
        grid-column: 1 / -1;
      }

      .item-editor__measurement {
        grid-template-columns: repeat(2, minmax(0, 1fr));
      }
    }

    .protocol-items {
      display: grid;
      gap: var(--space-2);
      min-width: 0;
    }


    .protocol-items__add {
      justify-self: start;
      margin-top: var(--space-1);
    }

    .form-section__hint {
      grid-column: 1 / -1;
      margin: 0;
      color: var(--muted);
      font-size: var(--font-size-md);
      line-height: 1.35;
    }
  `]
})
export class ProtocolsComponent {
  private readonly formBuilder = inject(FormBuilder);
  private readonly protocolService = inject(ProtocolService);
  private readonly permissions = inject(PermissionService);
  private readonly catalogService = inject(CatalogService);
  private readonly injector = inject(Injector);
  private readonly destroyRef = inject(DestroyRef);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  protected readonly canManage = computed(() => this.permissions.hasPermission('protocolos.catalogo'));
  protected readonly createButtonElement = viewChild<ElementRef<HTMLButtonElement>>('createButton');
  protected readonly deletingTemplateId = signal<number | null>(null);
  protected readonly deleteModalErrorMessage = signal('');
  private readonly deletingTemplateSignal = signal<ProtocolTemplateResponse | null>(null);
  protected readonly deletingTemplate = this.deletingTemplateSignal.asReadonly();

  protected readonly loading = signal(true);
  protected readonly submitting = signal(false);
  protected readonly errorMessage = signal('');
  protected readonly modalErrorMessage = signal('');
  protected readonly successMessage = signal('');
  protected readonly searchTerm = signal('');
  protected readonly modalOpen = signal(false);
  /** Last list query failed; independent of form messages. */
  protected readonly loadFailed = signal(false);
  /** At least one list query succeeded. */
  protected readonly loaded = signal(false);
  /** An invalid submit happened in the open form; enables the product/category message. */
  protected readonly submitAttempted = signal(false);
  /** Itens abertos no editor. Cada seta abre e fecha o próprio item; zero itens abertos é válido. */
  protected readonly expandedItems = signal<ReadonlySet<FormGroup>>(new Set());

  protected readonly productOptionsLoading = signal(false);
  protected readonly productOptionsError = signal('');

  private readonly templatesSignal = signal<ProtocolTemplateResponse[]>([]);
  private readonly productOptionsSignal = signal<ReadonlyArray<CustomSelectOption<number | null>>>([{ value: null, label: 'Por categoria' }]);
  private readonly editingTemplateSignal = signal<ProtocolTemplateResponse | null>(null);

  protected readonly templates = this.templatesSignal.asReadonly();
  /** Categorias já usadas nos protocolos, em ordem alfabética, como sugestão no formulário. */
  protected readonly categorySuggestions = computed(() =>
    [...new Set(this.templatesSignal().map((template) => template.category?.trim()).filter((category): category is string => Boolean(category)))]
      .sort((a, b) => a.localeCompare(b, 'pt-BR')));
  protected readonly productOptions = this.productOptionsSignal.asReadonly();
  protected readonly editingTemplate = this.editingTemplateSignal.asReadonly();
  protected readonly maxItems = MAX_ITEMS;
  protected readonly statusOptions = Object.keys(RMA_STATUS_LABELS) as RmaStatus[];
  protected readonly typeOptions: ReadonlyArray<CustomSelectOption<ProtocolItemType>> = (Object.keys(PROTOCOL_ITEM_TYPE_LABELS) as ProtocolItemType[]).map((type) => ({ value: type, label: PROTOCOL_ITEM_TYPE_LABELS[type] }));

  protected readonly filteredTemplates = computed(() =>
    this.templatesSignal().filter((template) => includesQuery(this.searchTerm(), template.name, template.productName, template.category))
  );

  protected readonly form = this.formBuilder.nonNullable.group({
    name: ['', [Validators.required, Validators.maxLength(120)]],
    productId: [null as number | null],
    category: ['', [Validators.maxLength(80)]],
    active: [true],
    blockedStatuses: [[] as RmaStatus[]],
    items: this.formBuilder.array<FormGroup>([])
  });

  constructor() {
    this.loadTemplates();
    this.loadProductOptions();
  }

  protected retryProductOptions(): void {
    if (!this.productOptionsLoading()) this.loadProductOptions();
  }

  private loadProductOptions(): void {
    this.productOptionsLoading.set(true);
    this.productOptionsError.set('');
    this.catalogService.listProductOptions().pipe(takeUntilDestroyed(this.destroyRef), finalize(() => this.productOptionsLoading.set(false))).subscribe({
      next: (products) => this.productOptionsSignal.set([{ value: null, label: 'Por categoria' }, ...products.map((product) => ({ value: product.id, label: `${product.sku} · ${product.name}` }))]),
      error: (error) => this.productOptionsError.set(extractHttpErrorMessage(error, 'Não foi possível carregar os produtos.'))
    });
  }

  protected get items(): FormArray<FormGroup> {
    return this.form.controls.items;
  }

  protected updateSearch(value: string): void {
    this.searchTerm.set(value);
  }

  protected clearSearch(): void {
    this.searchTerm.set('');
  }

  protected retryLoad(): void {
    this.loadTemplates();
  }

  protected openCreateModal(): void {
    this.editingTemplateSignal.set(null);
    this.form.reset({ name: '', productId: null, category: '', active: true, blockedStatuses: [] });
    this.items.clear();
    this.expandedItems.set(new Set());
    this.addItem();
    this.submitAttempted.set(false);
    this.modalOpen.set(true);
    this.clearMessages();
  }

  protected openEditModal(template: ProtocolTemplateResponse): void {
    this.editingTemplateSignal.set(template);
    this.form.reset({ name: template.name, productId: template.productId, category: template.category ?? '', active: template.active, blockedStatuses: [...template.blockedStatuses] });
    this.items.clear();
    template.items.forEach((item) => this.items.push(this.itemGroup(item)));
    // Ao publicar nova versão, a lista começa recolhida e mostra só os resumos.
    this.expandedItems.set(new Set());
    this.submitAttempted.set(false);
    this.modalOpen.set(true);
    this.clearMessages();
  }

  protected deleteBlockedReason(template: ProtocolTemplateResponse): string | null {
    return template.inUse ? 'Este protocolo já foi usado em uma OS e não pode ser excluído. Desative-o.' : null;
  }

  protected openDeleteModal(template: ProtocolTemplateResponse): void {
    if (!this.canManage() || this.deleteBlockedReason(template)) return;
    this.deletingTemplateSignal.set(template);
    this.clearMessages();
  }

  protected closeDeleteModal(): void {
    if (this.deletingTemplateId() !== null) return;
    this.resetDeleteModal();
  }

  protected confirmDeleteTemplate(): void {
    if (!this.canManage()) return;
    const template = this.deletingTemplateSignal();
    if (!template || this.deletingTemplateId() !== null) return;

    this.deletingTemplateId.set(template.id);
    this.clearMessages();
    this.protocolService.deleteTemplate(template.id).pipe(
      finalize(() => this.deletingTemplateId.set(null))
    ).subscribe({
      next: () => {
        this.successMessage.set(`Protocolo ${template.name} excluído com sucesso.`);
        this.resetDeleteModal();
        this.loadTemplates();
      },
      error: (error) => this.deleteModalErrorMessage.set(extractHttpErrorMessage(error, 'Não foi possível excluir o protocolo agora.'))
    });
  }

  /** Cancel, close button and overlay: ignored while the request is in flight. */
  protected closeModal(): void {
    if (this.submitting()) {
      return;
    }
    this.resetModal();
  }

  protected hasError(control: AbstractControl): boolean {
    return control.invalid && (control.touched || control.dirty);
  }

  /** Method, not computed: the form is not a signal. */
  protected categoryMissing(): boolean {
    return this.submitAttempted()
      && this.form.controls.productId.value === null
      && !normalizeOptionalText(this.form.controls.category.value);
  }

  protected addItem(): void {
    if (this.submitting() || this.items.length >= MAX_ITEMS) return;
    const item = this.itemGroup();
    this.items.push(item);
    // O item novo abre já recolhendo os demais, para a lista continuar curta.
    this.expandedItems.set(new Set([item]));
  }

  protected removeItem(index: number): void {
    if (this.submitting() || this.items.length <= 1) return;
    const removed = this.items.at(index);
    this.items.removeAt(index);
    this.expandedItems.update((open) => { const next = new Set(open); next.delete(removed); return next; });
    // O foco vai para o item que ocupou a posição removida (ou o anterior, quando era o último).
    const neighbour = Math.min(index, this.items.length - 1);
    afterNextRender(() => {
      this.host.nativeElement.querySelector<HTMLButtonElement>(`#protocol-item-summary-${neighbour}`)?.focus();
    }, { injector: this.injector });
  }

  protected isExpanded(item: FormGroup): boolean {
    return this.expandedItems().has(item);
  }

  protected toggleItem(item: FormGroup): void {
    if (this.submitting()) return;
    this.expandedItems.update((open) => {
      const next = new Set(open);
      if (!next.delete(item)) next.add(item);
      return next;
    });
  }

  /** Mínimo maior que o máximo, só depois de tocar em um dos dois campos. */
  protected rangeError(item: FormGroup): boolean {
    const { minValue, maxValue } = item.controls;
    return item.hasError('range') && (minValue.touched || minValue.dirty || maxValue.touched || maxValue.dirty);
  }

  protected typeLabel(item: FormGroup): string {
    return PROTOCOL_ITEM_TYPE_LABELS[item.controls['type'].value as ProtocolItemType];
  }

  private revealFirstInvalidItem(): void {
    const invalid = this.items.controls.filter((item) => item.invalid);
    if (!invalid.length) return;
    const index = this.items.controls.indexOf(invalid[0]);
    this.expandedItems.update((open) => new Set([...open, ...invalid]));
    afterNextRender(() => {
      const editor = this.host.nativeElement.querySelector<HTMLElement>(`#protocol-item-editor-${index}`);
      const field = editor?.querySelector<HTMLElement>('input.ng-invalid, textarea.ng-invalid, input[aria-invalid="true"]')
        ?? editor?.querySelector<HTMLElement>('app-custom-select[formcontrolname="type"] button');
      field?.focus();
    }, { injector: this.injector });
  }

  protected toggleBlockedStatus(status: RmaStatus, checked: boolean): void {
    const current = this.form.controls.blockedStatuses.value;
    this.form.controls.blockedStatuses.setValue(checked ? [...current, status] : current.filter((value) => value !== status));
  }

  protected isMeasurement(index: number): boolean {
    return this.items.at(index).controls['type'].value === 'MEASUREMENT';
  }

  protected saveTemplate(): void {
    const raw = this.form.getRawValue();
    if (this.form.invalid || (raw.productId === null && !normalizeOptionalText(raw.category))) {
      this.form.markAllAsTouched();
      this.submitAttempted.set(true);
      this.modalErrorMessage.set('Revise os campos e informe o produto ou a categoria do protocolo.');
      this.revealFirstInvalidItem();
      return;
    }

    const payload = buildTemplatePayload(raw);
    const current = this.editingTemplateSignal();
    const request$: Observable<ProtocolTemplateResponse> = current ? this.protocolService.updateTemplate(current.id, payload) : this.protocolService.createTemplate(payload);

    this.submitting.set(true);
    this.clearMessages();
    request$.pipe(finalize(() => this.submitting.set(false))).subscribe({
      next: (template) => {
        this.successMessage.set(current ? `Protocolo ${template.name} publicado na versão ${template.currentVersion}.` : `Protocolo ${template.name} cadastrado.`);
        // submitting is still true here (finalize runs after next), so skip the guard.
        this.resetModal();
        this.loadTemplates();
      },
      error: (error) => this.modalErrorMessage.set(extractHttpErrorMessage(error, 'Não foi possível salvar o protocolo agora.'))
    });
  }

  protected scopeLabel(template: ProtocolTemplateResponse): string {
    return template.productName ?? `Categoria ${template.category}`;
  }

  protected statusLabel(status: RmaStatus): string {
    return RMA_STATUS_LABELS[status];
  }

  protected blockedLabel(template: ProtocolTemplateResponse): string {
    return template.blockedStatuses.length === 0 ? 'Nenhum' : template.blockedStatuses.map((status) => RMA_STATUS_LABELS[status]).join(', ');
  }

  protected updatedAtLabel(template: ProtocolTemplateResponse): string {
    return formatBusinessDateTime(template.updatedAt);
  }

  private itemGroup(item?: ProtocolTemplateItemResponse): FormGroup {
    return this.formBuilder.nonNullable.group({
      stepName: [item?.stepName ?? '', [Validators.required, Validators.maxLength(120)]],
      title: [item?.title ?? '', [Validators.required, Validators.maxLength(200)]],
      instructions: [item?.instructions ?? '', [Validators.maxLength(1000)]],
      type: [item?.type ?? ('CHECK' as ProtocolItemType)],
      required: [item?.required ?? true],
      unit: [item?.unit ?? '', [Validators.maxLength(20)]],
      decimalPlaces: [item?.decimalPlaces ?? 2, [Validators.min(0), Validators.max(6)]],
      minValue: [item?.minValue === null || item?.minValue === undefined ? '' : String(item.minValue), [Validators.pattern(DECIMAL_PATTERN)]],
      maxValue: [item?.maxValue === null || item?.maxValue === undefined ? '' : String(item.maxValue), [Validators.pattern(DECIMAL_PATTERN)]],
      expectedResult: [item?.expectedResult ?? '', [Validators.maxLength(500)]],
      evidenceRequired: [item?.evidenceRequired ?? false]
    }, { validators: [rangeValidator] });
  }

  private loadTemplates(): void {
    this.loading.set(true);
    this.errorMessage.set('');
    this.protocolService.listTemplates().pipe(finalize(() => this.loading.set(false))).subscribe({
      next: (templates) => {
        this.templatesSignal.set(templates);
        this.loaded.set(true);
        this.loadFailed.set(false);
      },
      error: (error) => {
        this.loadFailed.set(true);
        this.errorMessage.set(extractHttpErrorMessage(error, 'Não foi possível carregar os protocolos.'));
      }
    });
  }

  private resetModal(): void {
    this.modalOpen.set(false);
    this.expandedItems.set(new Set());
    this.modalErrorMessage.set('');
    this.submitAttempted.set(false);
  }

  private resetDeleteModal(): void {
    this.deletingTemplateSignal.set(null);
    this.deleteModalErrorMessage.set('');
  }

  private clearMessages(): void {
    this.errorMessage.set('');
    this.modalErrorMessage.set('');
    this.deleteModalErrorMessage.set('');
    this.successMessage.set('');
  }
}

/** Medição com mínimo maior que o máximo (o servidor também recusa). */
function rangeValidator(group: AbstractControl): ValidationErrors | null {
  if (group.get('type')?.value !== 'MEASUREMENT') return null;
  const min = parseLimit(group.get('minValue')?.value);
  const max = parseLimit(group.get('maxValue')?.value);
  return min !== null && max !== null && min > max ? { range: true } : null;
}

function parseLimit(value: unknown): number | null {
  const normalized = normalizeDecimal(String(value ?? ''));
  return normalized !== null && DECIMAL_PATTERN.test(normalized) ? Number(normalized) : null;
}

function buildTemplatePayload(raw: ReturnType<ProtocolsComponent['form']['getRawValue']>): ProtocolTemplateRequest {
  return {
    name: raw.name.trim(),
    productId: raw.productId,
    category: raw.productId === null ? normalizeOptionalText(raw.category) : null,
    active: raw.active,
    blockedStatuses: raw.blockedStatuses,
    items: raw.items.map((item) => {
      const measurement = item['type'] === 'MEASUREMENT';
      return {
        stepName: String(item['stepName']).trim(),
        title: String(item['title']).trim(),
        instructions: normalizeOptionalText(item['instructions']),
        type: item['type'],
        required: Boolean(item['required']),
        unit: measurement ? normalizeOptionalText(item['unit']) : null,
        decimalPlaces: measurement ? Number(item['decimalPlaces']) : null,
        minValue: measurement ? normalizeDecimal(String(item['minValue'])) : null,
        maxValue: measurement ? normalizeDecimal(String(item['maxValue'])) : null,
        expectedResult: normalizeOptionalText(item['expectedResult']),
        evidenceRequired: Boolean(item['evidenceRequired'])
      };
    })
  };
}
