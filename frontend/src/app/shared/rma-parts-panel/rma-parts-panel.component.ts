import { allowsFraction, quantityError, quantityValidator } from '../../core/utils/quantity-rules';
import { IconComponent } from '../icon/icon.component';
import { viewChildren, Component, ElementRef, EventEmitter, Injector, Output, DestroyRef, afterNextRender, computed, effect, inject, input, signal, untracked } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { AbstractControl, FormControl, FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Subscription, finalize } from 'rxjs';
import { CLOSED_RMA_STATUSES } from '../../core/mock-data';
import { ExternalComponentResponse, PartConsumptionRequest, PartReservationResponse, PartOptionResponse, RmaPartsResponse, RmaStatus } from '../../core/models';
import { RmaRepairService } from '../../core/services/rma-repair.service';
import { ToastService } from '../../core/services/toast.service';
import { PermissionService } from '../../core/services/permission.service';
import { PartReservationAction, PartService } from '../../core/services/part.service';
import { extractHttpErrorMessage, normalizeOptionalText } from '../../core/utils/catalog-ui';
import { formatBusinessDateTime } from '../../core/utils/date';
import { PART_RESERVATION_STATUS_LABELS, formatCurrency, formatQuantity, reservationStatusClass } from '../../core/utils/part-ui';
import { NgTemplateOutlet } from '@angular/common';
import { CollapsibleSectionComponent } from '../collapsible-section/collapsible-section.component';
import { ModalFocusDirective } from '../modal-focus/modal-focus.directive';
import { RowActionComponent } from '../row-action/row-action.component';
import { CustomSelectComponent, CustomSelectOption } from '../form-controls/custom-select/custom-select.component';
import { SuggestInputComponent } from '../form-controls/suggest-input/suggest-input.component';
import { SuggestionService } from '../../core/services/suggestion.service';
import { lazySuggestions } from '../../core/utils/suggestions';
import { PART_UNIT_SUGGESTIONS } from '../../core/mock-data';

const ACTION_MESSAGES: Record<PartReservationAction, string> = {
  allocate: 'Reserva efetivada.',
  consume: 'Peça aplicada.',
  cancel: 'Reserva cancelada.'
};

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
  protected readonly reserveOpen = signal(false);

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
  protected readonly busyReservationId = signal<number | null>(null);
  protected readonly errorMessage = signal('');
  protected readonly parts = signal<RmaPartsResponse | null>(null);
  protected readonly catalog = signal<PartOptionResponse[]>([]);

  protected readonly statusLabels = PART_RESERVATION_STATUS_LABELS;
  protected readonly statusClass = reservationStatusClass;
  protected readonly quantity = formatQuantity;
  protected readonly currency = formatCurrency;
  protected readonly dateTime = formatBusinessDateTime;

  protected readonly canReserve = computed(() => this.permissions.hasPermission('pecas.reservar'));
  protected readonly isClosed = computed(() => CLOSED_RMA_STATUSES.includes(this.rmaStatus()));
  protected readonly canCreateReservation = computed(() => this.canReserve() && !this.isClosed());

  protected readonly reservations = computed(() => this.parts()?.reservations ?? []);
  protected readonly activeCount = computed(() => this.reservations().filter((reservation) => reservation.status === 'ACTIVE').length);
  protected readonly consumedCount = computed(() => this.reservations().filter((reservation) => reservation.status === 'CONSUMED').length);

  protected readonly canSeeCosts = computed(() => this.permissions.hasPermission('pecas.ver'));
  protected readonly stats = computed(() => {
    const parts = this.parts();
    if (!parts || this.reservations().length === 0) return [];
    const rows = [
      { label: 'Ativas', value: String(this.activeCount()), show: this.activeCount() > 0 },
      { label: 'Aplicadas', value: String(this.consumedCount()), show: this.consumedCount() > 0 },
      { label: 'Pendentes', value: String(parts.pendingCount), show: parts.pendingCount > 0 },
      { label: 'Custo aplicado', value: formatCurrency(parts.consumedCost ?? 0), show: this.canSeeCosts() && (parts.consumedCost ?? 0) > 0 },
      { label: 'Custo reservado', value: formatCurrency(parts.reservedCost ?? 0), show: this.canSeeCosts() && (parts.reservedCost ?? 0) > 0 }
    ];
    return rows.filter(row => row.show);
  });

  protected readonly partOptions = computed<ReadonlyArray<CustomSelectOption<number>>>(() =>
    this.catalog()
      .filter((part) => part.active)
      .map((part) => ({ value: part.id, label: `${part.code} - ${part.name} (disponível: ${formatQuantity(part.available, part.unit)})` }))
  );

  protected readonly componentStats = computed(() => {
    const active = this.replacedComponents().filter((component) => !component.voidedAt);
    if (active.length === 0) return [];
    const external = active.filter((component) => component.external).length;
    return [{ label: 'Componentes', value: String(active.length) }, { label: 'Externos', value: String(external) }, { label: 'Do estoque', value: String(active.length - external) }];
  });

  protected readonly consuming = signal<PartReservationResponse | null>(null);
  protected readonly cancelling = signal<PartReservationResponse | null>(null);
  protected readonly externalOpen = signal(false);
  protected readonly externalSaving = signal(false);
  protected readonly externalComponents = signal<ExternalComponentResponse[]>([]);
  protected readonly externalError = signal('');
  protected readonly replacedComponents = computed(() => [
    ...(this.parts()?.replacedComponents ?? this.reservations().filter(r => r.status === 'CONSUMED')).map(r => ({ ...r, key: `stock-${r.id}`, description: r.partName, code: r.partCode, source: 'Do estoque', external: false as const, voidedAt: null, voidReason: null, voidedBy: null })),
    ...this.externalComponents().map(c => ({ ...c, key: `external-${c.id}`, source: 'Externo', external: true as const }))
  ]);
  protected readonly consumptionForm = this.formBuilder.nonNullable.group({
    replacementReason: ['', [Validators.required, Validators.pattern(/\S/), Validators.maxLength(1000)]],
    componentBatch: ['', Validators.maxLength(120)]
  });
  protected readonly externalForm = this.formBuilder.nonNullable.group({
    code: ['', Validators.maxLength(60)],
    description: ['', [Validators.required, Validators.pattern(/\S/), Validators.maxLength(120)]],
    quantity: [1, [Validators.required, Validators.min(0.001), Validators.max(999999999.999), Validators.pattern(/^\d+(\.\d{1,3})?$/)]],
    unit: ['un', Validators.maxLength(20)],
    componentBatch: ['', Validators.maxLength(120)],
    replacementReason: ['', [Validators.required, Validators.pattern(/\S/), Validators.maxLength(1000)]]
  });

  protected readonly reserveForm = this.formBuilder.group({
    partId: this.formBuilder.control<number | null>(null, Validators.required),
    quantity: this.formBuilder.nonNullable.control(1, [Validators.required, Validators.min(0.001), Validators.max(999999999.999), Validators.pattern(/^\d+(\.\d{1,3})?$/)]),
    note: this.formBuilder.nonNullable.control('', Validators.maxLength(255))
  });

  protected readonly allowsFraction = allowsFraction;
  protected readonly quantityError = quantityError;

  constructor() {
    const reserveQuantity = this.reserveForm.controls.quantity;
    reserveQuantity.addValidators(quantityValidator(() => this.selectedPart()?.unit));
    this.reserveForm.controls.partId.valueChanges.pipe(takeUntilDestroyed()).subscribe(() => reserveQuantity.updateValueAndValidity());
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
    const partId = this.reserveForm.controls.partId.value;
    return partId === null ? null : this.catalog().find((part) => part.id === partId) ?? null;
  }

  protected toggleReserve(): void {
    if (this.reserveOpen()) { this.closeReserve(true); return; }
    this.reserveOpen.set(true);
    afterNextRender(() => this.host.nativeElement.querySelector<HTMLElement>('#reserve-form .custom-select__trigger, #reserve-form input')?.focus(), { injector: this.injector });
  }

  protected closeReserve(restoreFocus: boolean): void {
    this.reserveOpen.set(false); this.reserveForm.reset({ partId: null, quantity: 1, note: '' });
    if (restoreFocus) afterNextRender(() => this.host.nativeElement.querySelector<HTMLElement>('#reserve-trigger')?.focus(), { injector: this.injector });
  }

  protected retryLoad(): void {
    if (!this.loading()) this.load(this.rmaId());
  }

  protected retryCatalog(): void {
    if (!this.catalogLoading()) this.loadCatalog();
  }

  protected reserve(): void {
    if (!this.catalogHasLoaded() || this.catalogLoadFailed()) return;
    if (this.submitting()) return;
    if (this.reserveForm.invalid) {
      this.reserveForm.markAllAsTouched();
      return;
    }

    const rmaId = this.rmaId();
    const raw = this.reserveForm.getRawValue();
    this.submitting.set(true);
    this.clearMessages();

    this.partService.reserve(rmaId, { partId: raw.partId!, quantity: raw.quantity, note: normalizeOptionalText(raw.note) }).pipe(
      takeUntilDestroyed(this.destroyRef),
      finalize(() => this.submitting.set(false))
    ).subscribe({
      next: (reservation) => {
        this.toasts.show(reservation.status === 'PENDING'
          ? { message: 'Reserva pendente de reposição.', tone: 'info', durationMs: 8000 }
          : { message: 'Peça reservada.', tone: 'success' });
        if (this.rmaId() !== rmaId) return;
        this.closeReserve(true);
        this.load(rmaId);
      },
      error: (error) => {
        if (this.rmaId() !== rmaId) return;
        this.errorMessage.set(extractHttpErrorMessage(error, 'Não foi possível reservar a peça agora.'));
      }
    });
  }

  protected startCancellation(reservation: PartReservationResponse): void {
    if (!this.canReserve() || this.busyReservationId() !== null) return;
    this.cancelling.set(reservation); this.consuming.set(null);
  }

  protected closeCancellation(): void {
    if (this.busyReservationId() !== null) return;
    const id = this.cancelling()?.id;
    this.cancelling.set(null);
    afterNextRender(() => this.host.nativeElement.querySelector<HTMLElement>(`#reservation-cancel-${id}`)?.focus(), { injector: this.injector });
  }

  protected startConsumption(reservation: PartReservationResponse): void {
    if (!this.canCreateReservation()) return;
    const error = quantityError(reservation.quantity, reservation.unit);
    if (error) { this.errorMessage.set(error); return; }
    this.cancelling.set(null);
    this.consuming.set(reservation); this.consumptionForm.reset();
  }

  protected confirmConsumption(): void {
    if (!this.canCreateReservation() || !this.consuming()) return;
    if (this.consumptionForm.invalid) { this.consumptionForm.markAllAsTouched(); return; }
    const value = this.consumptionForm.getRawValue();
    this.runAction(this.consuming()!, 'consume', { replacementReason: value.replacementReason.trim(), componentBatch: normalizeOptionalText(value.componentBatch) });
  }

  protected saveExternal(): void {
    if (!this.canCreateReservation() || this.externalSaving()) return;
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
    if (!this.canCreateReservation() || this.externalSaving() || item.voidedAt) return;
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

  protected readonly reservationTone = (status: PartReservationResponse['status']): string =>
    ({ ACTIVE: 'tone-sky', PENDING: 'tone-warning', CONSUMED: 'tone-success' } as Record<string, string>)[status] ?? 'tone-slate';
  private focusFirstExternalField(): void {
    afterNextRender(() => this.host.nativeElement.querySelector<HTMLElement>('#external-form input, #external-form textarea')?.focus(), { injector: this.injector });
  }

  protected cancelExternal(): void { this.editingExternal.set(null); this.externalOpen.set(false); this.externalForm.reset(); }

  protected startVoidExternal(item: ExternalComponentResponse): void {
    if (!this.canCreateReservation() || this.externalSaving() || item.voidedAt) return;
    this.cancelExternal(); this.voidingExternal.set(item); this.voidReason.reset();
  }

  protected confirmVoidExternal(): void {
    const item = this.voidingExternal();
    if (!item || !this.canCreateReservation() || this.externalSaving()) return;
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

  protected runAction(reservation: PartReservationResponse, action: PartReservationAction, consumption?: PartConsumptionRequest): void {
    if (this.busyReservationId() !== null) {
      return;
    }

    const error = action === 'cancel' ? null : quantityError(reservation.quantity, reservation.unit);
    if (error) { this.errorMessage.set(error); return; }
    const rmaId = this.rmaId();
    this.busyReservationId.set(reservation.id);
    this.clearMessages();

    (consumption ? this.partService.updateReservation(rmaId, reservation.id, action, consumption) : this.partService.updateReservation(rmaId, reservation.id, action)).pipe(
      takeUntilDestroyed(this.destroyRef),
      finalize(() => this.busyReservationId.set(null))
    ).subscribe({
      next: () => {
        this.toasts.show({ message: ACTION_MESSAGES[action], tone: 'success' });
        if (this.rmaId() !== rmaId) return;
        this.consuming.set(null);
        this.cancelling.set(null);
        if (action === 'consume') this.changed.emit();
        this.load(rmaId);
      },
      error: (error) => {
        if (this.rmaId() !== rmaId) return;
        this.errorMessage.set(extractHttpErrorMessage(error, 'Não foi possível atualizar a reserva agora.'));
      }
    });
  }

  private resetContext(): void {
    this.cancelling.set(null);
    this.loadRequest?.unsubscribe();
    this.catalogRequest?.unsubscribe();
    this.externalRequest?.unsubscribe();
    this.editingExternal.set(null); this.voidingExternal.set(null); this.voidReason.reset();
    this.consuming.set(null); this.reserveOpen.set(false); this.externalOpen.set(false); this.externalComponents.set([]); this.externalError.set(''); this.externalForm.reset();
    this.parts.set(null);
    this.hasLoaded.set(false);
    this.loadFailed.set(false);
    this.loadErrorMessage.set('');
    this.catalog.set([]);
    this.catalogHasLoaded.set(false);
    this.catalogLoadFailed.set(false);
    this.catalogLoadErrorMessage.set('');
    this.reserveForm.reset({ partId: null, quantity: 1, note: '' });
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
    if (!this.canCreateReservation()) return;
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
        this.reserveForm.controls.partId.setValue(null);
        this.catalogLoadFailed.set(true);
        this.catalogLoadErrorMessage.set(extractHttpErrorMessage(error, 'Não foi possível carregar as opções de peças.'));
      }
    });
  }

  private clearMessages(): void {
    this.errorMessage.set('');
  }
}
