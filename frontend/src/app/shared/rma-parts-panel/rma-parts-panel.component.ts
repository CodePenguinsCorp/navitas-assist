import { allowsFraction, quantityError, quantityValidator } from '../../core/utils/quantity-rules';
import { IconComponent } from '../icon/icon.component';
import { viewChildren, Component, ElementRef, EventEmitter, Injector, Output, DestroyRef, afterNextRender, computed, effect, inject, input, signal, untracked } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { AbstractControl, FormControl, FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Subscription, finalize } from 'rxjs';
import { CLOSED_RMA_STATUSES } from '../../core/mock-data';
import { ExternalComponentResponse, PartUsageResponse, PartOptionResponse, RmaPartsResponse, RmaStatus } from '../../core/models';
import { RmaRepairService } from '../../core/services/rma-repair.service';
import { ToastService } from '../../core/services/toast.service';
import { PermissionService } from '../../core/services/permission.service';
import { PartService } from '../../core/services/part.service';
import { extractHttpErrorMessage, normalizeOptionalText } from '../../core/utils/catalog-ui';
import { formatBusinessDateTime } from '../../core/utils/date';
import { PART_USAGE_STATUS_LABELS, formatCurrency, formatQuantity, usageStatusClass } from '../../core/utils/part-ui';
import { NgTemplateOutlet } from '@angular/common';
import { CollapsibleSectionComponent } from '../collapsible-section/collapsible-section.component';
import { ModalFocusDirective } from '../modal-focus/modal-focus.directive';
import { RowActionComponent } from '../row-action/row-action.component';
import { CustomSelectComponent, CustomSelectOption } from '../form-controls/custom-select/custom-select.component';
import { SuggestInputComponent } from '../form-controls/suggest-input/suggest-input.component';
import { SuggestionService } from '../../core/services/suggestion.service';
import { lazySuggestions } from '../../core/utils/suggestions';
import { PART_UNIT_SUGGESTIONS } from '../../core/mock-data';

@Component({
  selector: 'app-rma-parts-panel',
  imports: [IconComponent, NgTemplateOutlet, RowActionComponent, ReactiveFormsModule, CustomSelectComponent, CollapsibleSectionComponent, ModalFocusDirective, SuggestInputComponent],
  templateUrl: './rma-parts-panel.component.html',
  styleUrl: './rma-parts-panel.component.css'
})
export class RmaPartsPanelComponent {
  readonly sections = viewChildren(CollapsibleSectionComponent);
  private readonly formBuilder = inject(FormBuilder);
  private readonly partService = inject(PartService);
  private readonly suggestionService = inject(SuggestionService);
  protected readonly unitSuggestions = lazySuggestions(PART_UNIT_SUGGESTIONS, () => this.suggestionService.partUnits());
  private readonly permissions = inject(PermissionService);
  private readonly repairService = inject(RmaRepairService);
  private readonly toasts = inject(ToastService);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly injector = inject(Injector);
  protected readonly usageOpen = signal(false);

  @Output() readonly changed = new EventEmitter<void>();
  protected readonly editingExternal = signal<ExternalComponentResponse | null>(null);
  protected readonly voidingExternal = signal<ExternalComponentResponse | null>(null);
  protected readonly voidReason = new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.pattern(/\S/), Validators.maxLength(1000)] });
  readonly rmaId = input.required<number>();
  readonly rmaStatus = input.required<RmaStatus>();

  private readonly destroyRef = inject(DestroyRef);
  private loadRequest?: Subscription;
  private catalogRequest?: Subscription;
  private externalRequest?: Subscription;

  protected readonly loading = signal(false);
  protected readonly loadFailed = signal(false);
  protected readonly hasLoaded = signal(false);
  protected readonly loadErrorMessage = signal('');
  protected readonly catalogLoading = signal(false);
  protected readonly catalogLoadFailed = signal(false);
  protected readonly catalogHasLoaded = signal(false);
  protected readonly catalogLoadErrorMessage = signal('');
  protected readonly submitting = signal(false);
  protected readonly busyUsageId = signal<number | null>(null);
  protected readonly errorMessage = signal('');
  protected readonly parts = signal<RmaPartsResponse | null>(null);
  protected readonly catalog = signal<PartOptionResponse[]>([]);

  protected readonly statusLabels = PART_USAGE_STATUS_LABELS;
  protected readonly statusClass = usageStatusClass;
  protected readonly quantity = formatQuantity;
  protected readonly currency = formatCurrency;
  protected readonly dateTime = formatBusinessDateTime;

  protected readonly canUse = computed(() => this.permissions.hasPermission('pecas.usar'));
  protected readonly isClosed = computed(() => CLOSED_RMA_STATUSES.includes(this.rmaStatus()));
  protected readonly canCreateUsage = computed(() => this.canUse() && !this.isClosed());

  protected readonly usages = computed(() => this.parts()?.usages ?? []);
  protected readonly consumedCount = computed(() => this.usages().filter((usage) => usage.status === 'USED').length);

  protected readonly canSeeCosts = computed(() => this.permissions.hasPermission('pecas.ver'));
  protected readonly stats = computed(() => {
    const parts = this.parts();
    if (!parts || this.usages().length === 0) return [];
    const rows = [
      { label: 'Peças usadas', value: String(this.consumedCount()), show: true },
      { label: 'Custo das peças', value: formatCurrency(parts.usedCost ?? 0), show: this.canSeeCosts() }
    ];
    return rows.filter(row => row.show);
  });

  protected readonly partOptions = computed<ReadonlyArray<CustomSelectOption<number>>>(() =>
    this.catalog()
      .filter((part) => part.active)
      .map((part) => ({ value: part.id, label: `${part.code} - ${part.name} (em estoque: ${formatQuantity(part.onHand, part.unit)})` }))
  );

  protected readonly componentStats = computed(() => {
    const active = this.replacedComponents().filter((component) => !component.voidedAt);
    if (active.length === 0) return [];
    const external = active.filter((component) => component.external).length;
    return [{ label: 'Componentes', value: String(active.length) }, { label: 'Externos', value: String(external) }, { label: 'Do estoque', value: String(active.length - external) }];
  });

  protected readonly undoReason = new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.pattern(/\S/), Validators.maxLength(255)] });
  protected readonly undoing = signal<PartUsageResponse | null>(null);
  protected readonly externalOpen = signal(false);
  protected readonly externalSaving = signal(false);
  protected readonly externalComponents = signal<ExternalComponentResponse[]>([]);
  protected readonly externalError = signal('');
  protected readonly replacedComponents = computed(() => [
    ...(this.parts()?.replacedComponents ?? this.usages().filter(r => r.status === 'USED')).map(r => ({ ...r, key: `stock-${r.id}`, description: r.partName, code: r.partCode, source: 'Do estoque', external: false as const, voidedAt: null, voidReason: null, voidedBy: null })),
    ...this.externalComponents().map(c => ({ ...c, key: `external-${c.id}`, source: 'Externo', external: true as const }))
  ]);
  protected readonly externalForm = this.formBuilder.nonNullable.group({
    code: ['', Validators.maxLength(60)],
    description: ['', [Validators.required, Validators.pattern(/\S/), Validators.maxLength(120)]],
    quantity: [1, [Validators.required, Validators.min(0.001), Validators.max(999999999.999), Validators.pattern(/^\d+(\.\d{1,3})?$/)]],
    unit: ['un', Validators.maxLength(20)],
    componentBatch: ['', Validators.maxLength(120)],
    replacementReason: ['', [Validators.required, Validators.pattern(/\S/), Validators.maxLength(1000)]]
  });

  protected readonly usageForm = this.formBuilder.group({
    partId: this.formBuilder.control<number | null>(null, Validators.required),
    quantity: this.formBuilder.nonNullable.control(1, [Validators.required, Validators.min(0.001), Validators.max(999999999.999), Validators.pattern(/^\d+(\.\d{1,3})?$/)]),
    notes: this.formBuilder.nonNullable.control('', Validators.maxLength(255)),
    replacementReason: this.formBuilder.nonNullable.control('', [Validators.required, Validators.pattern(/\S/), Validators.maxLength(1000)]),
    componentBatch: this.formBuilder.nonNullable.control('', Validators.maxLength(120))
  });

  protected readonly allowsFraction = allowsFraction;
  protected readonly quantityError = quantityError;

  constructor() {
    const usageQuantity = this.usageForm.controls.quantity;
    usageQuantity.addValidators(quantityValidator(() => this.selectedPart()?.unit));
    this.usageForm.controls.partId.valueChanges.pipe(takeUntilDestroyed()).subscribe(() => usageQuantity.updateValueAndValidity());
    const externalQuantity = this.externalForm.controls.quantity;
    externalQuantity.addValidators(quantityValidator(() => this.externalForm.controls.unit.value));
    this.externalForm.controls.unit.valueChanges.pipe(takeUntilDestroyed()).subscribe(() => externalQuantity.updateValueAndValidity());
    effect(() => {
      const rmaId = this.rmaId();
      untracked(() => {
        this.resetContext();
        this.load(rmaId);
      });
    });
  }

  protected hasError(control: AbstractControl): boolean {
    return control.invalid && (control.dirty || control.touched);
  }

  protected selectedPart(): PartOptionResponse | null {
    const partId = this.usageForm.controls.partId.value;
    return partId === null ? null : this.catalog().find((part) => part.id === partId) ?? null;
  }

  protected toggleUsage(): void {
    if (this.usageOpen()) { this.closeUsage(true); return; }
    this.usageOpen.set(true);
    afterNextRender(() => this.host.nativeElement.querySelector<HTMLElement>('#usage-form .custom-select__trigger, #usage-form input')?.focus(), { injector: this.injector });
  }

  protected closeUsage(restoreFocus: boolean): void {
    this.usageOpen.set(false); this.usageForm.reset({ partId: null, quantity: 1, notes: '', replacementReason: '', componentBatch: '' });
    if (restoreFocus) afterNextRender(() => this.host.nativeElement.querySelector<HTMLElement>('#usage-trigger')?.focus(), { injector: this.injector });
  }

  protected retryLoad(): void {
    if (!this.loading()) this.load(this.rmaId());
  }

  protected retryCatalog(): void {
    if (!this.catalogLoading()) this.loadCatalog();
  }

  protected use(): void {
    if (!this.canCreateUsage()) return;
    if (!this.catalogHasLoaded() || this.catalogLoadFailed()) return;
    if (this.submitting()) return;
    if (this.usageForm.invalid) {
      this.usageForm.markAllAsTouched();
      return;
    }

    const rmaId = this.rmaId();
    const raw = this.usageForm.getRawValue();
    this.submitting.set(true);
    this.clearMessages();

    this.partService.use(rmaId, { partId: raw.partId!, quantity: raw.quantity, notes: normalizeOptionalText(raw.notes), replacementReason: raw.replacementReason.trim(), componentBatch: normalizeOptionalText(raw.componentBatch) }).pipe(
      takeUntilDestroyed(this.destroyRef),
      finalize(() => this.submitting.set(false))
    ).subscribe({
      next: (usage) => {
        this.toasts.show({ message: 'Peça usada.', tone: 'success' });
        if (this.rmaId() !== rmaId) return;
        this.closeUsage(true);
        this.changed.emit();
        this.load(rmaId);
      },
      error: (error) => {
        if (this.rmaId() !== rmaId) return;
        this.errorMessage.set(extractHttpErrorMessage(error, 'Não foi possível usar a peça agora.'));
      }
    });
  }

  protected startUndo(usage: PartUsageResponse): void {
    if (!this.canCreateUsage() || this.busyUsageId() !== null) return;
    this.clearMessages(); this.undoing.set(usage); this.undoReason.reset();
  }

  protected closeUndo(): void {
    if (this.busyUsageId() !== null) return;
    const id = this.undoing()?.id;
    this.undoing.set(null);
    afterNextRender(() => this.host.nativeElement.querySelector<HTMLElement>(`#usage-undo-${id}`)?.focus(), { injector: this.injector });
  }

  protected saveExternal(): void {
    if (!this.canCreateUsage() || this.externalSaving()) return;
    if (this.externalForm.invalid) { this.externalForm.markAllAsTouched(); return; }
    const id = this.rmaId(); const value = this.externalForm.getRawValue();
    this.externalSaving.set(true); this.clearMessages();
    const payload = { ...value, code: normalizeOptionalText(value.code), description: value.description.trim(), unit: value.unit.trim() || 'un', componentBatch: normalizeOptionalText(value.componentBatch), replacementReason: value.replacementReason.trim() };
    const editing = this.editingExternal();
    (editing ? this.repairService.updateExternalComponent(id, editing.id, payload) : this.repairService.addExternalComponent(id, payload))
      .pipe(takeUntilDestroyed(this.destroyRef), finalize(() => this.externalSaving.set(false))).subscribe({
        next: () => { this.toasts.show({ message: 'Componente salvo.', tone: 'success' }); if (id !== this.rmaId()) return; this.closeExternal(false); this.loadExternal(id); this.changed.emit(); },
        error: error => { if (id === this.rmaId()) this.errorMessage.set(extractHttpErrorMessage(error, 'Não foi possível registrar o componente.')); }
      });
  }

  protected editExternal(item: ExternalComponentResponse): void {
    if (!this.canCreateUsage() || this.externalSaving() || item.voidedAt) return;
    this.voidingExternal.set(null); this.editingExternal.set(item); this.externalOpen.set(true);
    this.externalForm.reset({ code: item.code ?? '', description: item.description, quantity: item.quantity, unit: item.unit, componentBatch: item.componentBatch ?? '', replacementReason: item.replacementReason });
    this.focusFirstExternalField();
  }

  protected toggleExternal(): void {
    if (this.editingExternal() || this.externalOpen()) { this.closeExternal(true); return; }
    this.externalOpen.set(true); this.focusFirstExternalField();
  }

  protected closeExternal(restoreFocus: boolean): void {
    this.cancelExternal();
    if (restoreFocus) afterNextRender(() => this.host.nativeElement.querySelector<HTMLElement>('#external-trigger')?.focus(), { injector: this.injector });
  }

  protected readonly usageTone = (status: PartUsageResponse['status']): string =>
    ({ USED: 'tone-success' } as Record<string, string>)[status] ?? 'tone-slate';
  private focusFirstExternalField(): void {
    afterNextRender(() => this.host.nativeElement.querySelector<HTMLElement>('#external-form input, #external-form textarea')?.focus(), { injector: this.injector });
  }

  protected cancelExternal(): void { this.editingExternal.set(null); this.externalOpen.set(false); this.externalForm.reset(); }

  protected startVoidExternal(item: ExternalComponentResponse): void {
    if (!this.canCreateUsage() || this.externalSaving() || item.voidedAt) return;
    this.cancelExternal(); this.voidingExternal.set(item); this.voidReason.reset();
  }

  protected confirmVoidExternal(): void {
    const item = this.voidingExternal();
    if (!item || !this.canCreateUsage() || this.externalSaving()) return;
    if (this.voidReason.invalid) { this.voidReason.markAsTouched(); return; }
    const id = this.rmaId(); this.externalSaving.set(true); this.clearMessages();
    this.repairService.voidExternalComponent(id, item.id, this.voidReason.value.trim()).pipe(takeUntilDestroyed(this.destroyRef), finalize(() => this.externalSaving.set(false))).subscribe({
      next: () => { this.toasts.show({ message: 'Componente anulado.', tone: 'success' }); if (id !== this.rmaId()) return; this.voidingExternal.set(null); this.loadExternal(id); this.changed.emit(); },
      error: error => { if (id === this.rmaId()) this.errorMessage.set(extractHttpErrorMessage(error, 'Não foi possível anular o componente.')); }
    });
  }

  protected loadExternal(id = this.rmaId()): void {
    this.externalRequest?.unsubscribe();
    this.externalError.set('');
    this.externalRequest = this.repairService.listExternalComponents(id).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: components => { if (id === this.rmaId()) this.externalComponents.set(components); },
      error: error => { if (id === this.rmaId()) this.externalError.set(extractHttpErrorMessage(error, 'Não foi possível carregar componentes externos.')); }
    });
  }

  protected confirmUndo(): void {
    const usage = this.undoing();
    if (!usage || !this.canCreateUsage() || this.busyUsageId() !== null) return;
    if (this.undoReason.invalid) { this.undoReason.markAsTouched(); return; }
    const rmaId = this.rmaId();
    this.busyUsageId.set(usage.id); this.clearMessages();
    this.partService.undoUse(rmaId, usage.id, this.undoReason.value.trim()).pipe(
      takeUntilDestroyed(this.destroyRef), finalize(() => this.busyUsageId.set(null))
    ).subscribe({
      next: () => {
        this.toasts.show({ message: 'Uso desfeito.', tone: 'success' });
        if (this.rmaId() !== rmaId) return;
        this.undoing.set(null); this.changed.emit(); this.load(rmaId);
      },
      error: error => { if (this.rmaId() === rmaId) this.errorMessage.set(extractHttpErrorMessage(error, 'Não foi possível desfazer o uso.')); }
    });
  }

  private resetContext(): void {
    this.undoing.set(null);
    this.loadRequest?.unsubscribe();
    this.catalogRequest?.unsubscribe();
    this.externalRequest?.unsubscribe();
    this.editingExternal.set(null); this.voidingExternal.set(null); this.voidReason.reset();
    this.usageOpen.set(false); this.externalOpen.set(false); this.externalComponents.set([]); this.externalError.set(''); this.externalForm.reset();
    this.parts.set(null);
    this.hasLoaded.set(false);
    this.loadFailed.set(false);
    this.loadErrorMessage.set('');
    this.catalog.set([]);
    this.catalogHasLoaded.set(false);
    this.catalogLoadFailed.set(false);
    this.catalogLoadErrorMessage.set('');
    this.usageForm.reset({ partId: null, quantity: 1, notes: '', replacementReason: '', componentBatch: '' });
    this.clearMessages();
  }

  private load(rmaId: number): void {
    this.loadRequest?.unsubscribe();
    this.loading.set(true);

    this.loadRequest = this.partService.getRmaParts(rmaId).pipe(
      takeUntilDestroyed(this.destroyRef),
      finalize(() => this.loading.set(false))
    ).subscribe({
      next: (parts) => {
        if (this.rmaId() !== rmaId) return;
        this.parts.set(parts);
        this.hasLoaded.set(true);
        this.loadFailed.set(false);
        this.loadErrorMessage.set('');
      },
      error: (error) => {
        if (this.rmaId() !== rmaId) return;
        this.parts.set(null);
        this.loadFailed.set(true);
        this.loadErrorMessage.set(extractHttpErrorMessage(error, 'Não foi possível carregar as peças da OS.'));
      }
    });

    this.loadCatalog();
    this.loadExternal(rmaId);
  }

  private loadCatalog(): void {
    if (!this.canCreateUsage()) return;
    this.catalogRequest?.unsubscribe();
    this.catalogLoading.set(true);

    this.catalogRequest = this.partService.listOptions().pipe(
      takeUntilDestroyed(this.destroyRef),
      finalize(() => this.catalogLoading.set(false))
    ).subscribe({
      next: (catalog) => {
        this.catalog.set(catalog);
        this.catalogHasLoaded.set(true);
        this.catalogLoadFailed.set(false);
        this.catalogLoadErrorMessage.set('');
      },
      error: (error) => {
        this.catalog.set([]);
        this.usageForm.controls.partId.setValue(null);
        this.catalogLoadFailed.set(true);
        this.catalogLoadErrorMessage.set(extractHttpErrorMessage(error, 'Não foi possível carregar as opções de peças.'));
      }
    });
  }

  private clearMessages(): void {
    this.errorMessage.set('');
  }
}
