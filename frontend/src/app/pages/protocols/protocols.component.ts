import { Component, computed, inject, signal } from '@angular/core';
import { FormArray, FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Observable, finalize } from 'rxjs';
import { RMA_STATUS_LABELS } from '../../core/mock-data';
import { ProtocolItemType, ProtocolTemplateItemResponse, ProtocolTemplateRequest, ProtocolTemplateResponse, RmaStatus } from '../../core/models';
import { CatalogService } from '../../core/services/catalog.service';
import { ProtocolService } from '../../core/services/protocol.service';
import { extractHttpErrorMessage, includesQuery, normalizeOptionalText } from '../../core/utils/catalog-ui';
import { formatBusinessDateTime } from '../../core/utils/date';
import { PROTOCOL_ITEM_TYPE_LABELS, normalizeDecimal } from '../../core/utils/protocol-ui';
import { CustomSelectComponent, CustomSelectOption } from '../../shared/form-controls/custom-select/custom-select.component';

const DECIMAL_PATTERN = /^-?\d{1,13}([.,]\d{1,6})?$/;

@Component({
  selector: 'app-protocols',
  imports: [ReactiveFormsModule, CustomSelectComponent],
  templateUrl: './protocols.component.html',
  styles: [`
    :host {
      display: block;
    }

    .protocol-item-card {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
      gap: 0.75rem;
      padding: 0.9rem;
      border: 1px solid var(--line);
      border-radius: 12px;
    }

    .protocol-items {
      display: grid;
      gap: 0.75rem;
    }

    .checkbox-field {
      display: flex;
      align-items: center;
      gap: 0.5rem;
    }

    .status-options {
      display: flex;
      flex-wrap: wrap;
      gap: 0.75rem;
    }

    .modal-feedback {
      margin-bottom: 1rem;
    }
  `]
})
export class ProtocolsComponent {
  private readonly formBuilder = inject(FormBuilder);
  private readonly protocolService = inject(ProtocolService);
  private readonly catalogService = inject(CatalogService);

  protected readonly loading = signal(true);
  protected readonly submitting = signal(false);
  protected readonly errorMessage = signal('');
  protected readonly modalErrorMessage = signal('');
  protected readonly successMessage = signal('');
  protected readonly searchTerm = signal('');
  protected readonly modalOpen = signal(false);

  private readonly templatesSignal = signal<ProtocolTemplateResponse[]>([]);
  private readonly productOptionsSignal = signal<ReadonlyArray<CustomSelectOption<number | null>>>([{ value: null, label: 'Por categoria' }]);
  private readonly editingTemplateSignal = signal<ProtocolTemplateResponse | null>(null);

  protected readonly templates = this.templatesSignal.asReadonly();
  protected readonly productOptions = this.productOptionsSignal.asReadonly();
  protected readonly editingTemplate = this.editingTemplateSignal.asReadonly();
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
    this.catalogService.listProducts().subscribe({
      next: (products) => this.productOptionsSignal.set([{ value: null, label: 'Por categoria' }, ...products.map((product) => ({ value: product.id, label: `${product.sku} · ${product.name}` }))])
    });
  }

  protected get items(): FormArray<FormGroup> {
    return this.form.controls.items;
  }

  protected updateSearch(value: string): void {
    this.searchTerm.set(value);
  }

  protected openCreateModal(): void {
    this.editingTemplateSignal.set(null);
    this.form.reset({ name: '', productId: null, category: '', active: true, blockedStatuses: [] });
    this.items.clear();
    this.addItem();
    this.modalOpen.set(true);
    this.clearMessages();
  }

  protected openEditModal(template: ProtocolTemplateResponse): void {
    this.editingTemplateSignal.set(template);
    this.form.reset({ name: template.name, productId: template.productId, category: template.category ?? '', active: template.active, blockedStatuses: [...template.blockedStatuses] });
    this.items.clear();
    template.items.forEach((item) => this.items.push(this.itemGroup(item)));
    this.modalOpen.set(true);
    this.clearMessages();
  }

  protected closeModal(): void {
    this.modalOpen.set(false);
    this.modalErrorMessage.set('');
  }

  protected addItem(): void {
    this.items.push(this.itemGroup());
  }

  protected removeItem(index: number): void {
    if (this.items.length > 1) {
      this.items.removeAt(index);
    }
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
      this.modalErrorMessage.set('Revise os campos e informe o produto ou a categoria do protocolo.');
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
        this.closeModal();
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
    });
  }

  private loadTemplates(): void {
    this.loading.set(true);
    this.errorMessage.set('');
    this.protocolService.listTemplates().pipe(finalize(() => this.loading.set(false))).subscribe({
      next: (templates) => this.templatesSignal.set(templates),
      error: (error) => this.errorMessage.set(extractHttpErrorMessage(error, 'Não foi possível carregar os protocolos.'))
    });
  }

  private clearMessages(): void {
    this.errorMessage.set('');
    this.modalErrorMessage.set('');
    this.successMessage.set('');
  }
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
