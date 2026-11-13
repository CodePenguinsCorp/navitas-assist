import { IconComponent } from '../../shared/icon/icon.component';
import { Component, DestroyRef, ElementRef, Injector, afterNextRender, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Observable, Subscription, finalize, forkJoin } from 'rxjs';
import {
  ManualPartMovementType,
  PartMovementResponse,
  PartReplenishmentResponse,
  PartRequest,
  PartReservationResponse,
  PartResponse
} from '../../core/models';
import { PermissionService } from '../../core/services/permission.service';
import { PartService } from '../../core/services/part.service';
import { extractHttpErrorMessage, includesQuery, normalizeOptionalText } from '../../core/utils/catalog-ui';
import { formatBusinessDateTime } from '../../core/utils/date';
import {
  MANUAL_MOVEMENT_TYPES,
  PART_MOVEMENT_LABELS,
  canReverseMovement,
  formatCurrency,
  formatQuantity,
  formatSignedQuantity
} from '../../core/utils/part-ui';
import { CustomSelectComponent, CustomSelectOption } from '../../shared/form-controls/custom-select/custom-select.component';
import { ModalFocusDirective } from '../../shared/modal-focus/modal-focus.directive';
import { PageHeaderComponent } from '../../shared/page-header/page-header.component';
import { ResultCountComponent } from '../../shared/result-count/result-count.component';
import { RowActionComponent } from '../../shared/row-action/row-action.component';

type PartsTab = 'stock' | 'replenishment';
type PartFormControlName = 'code' | 'name' | 'unit' | 'location' | 'minimumStock' | 'unitCost';

const PART_LIMITS = {
  code: 60,
  name: 120,
  unit: 20,
  location: 120,
  reason: 255
} as const;

const MOVEMENT_TYPE_OPTIONS: ReadonlyArray<CustomSelectOption<ManualPartMovementType>> = MANUAL_MOVEMENT_TYPES.map((type) => ({ value: type, label: PART_MOVEMENT_LABELS[type] }));

@Component({
  selector: 'app-parts',
  imports: [IconComponent, ReactiveFormsModule, CustomSelectComponent, ModalFocusDirective, PageHeaderComponent, ResultCountComponent, RowActionComponent],
  templateUrl: './parts.component.html',
  styles: [`
    :host {
      display: block;
    }

    .stock-cell {
      min-width: 110px;
    }

    .stock-cell .meter {
      margin-top: 0.35rem;
      max-width: 120px;
    }

    .movement-context {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(min(100%, 10rem), 1fr));
      gap: var(--space-3);
      margin: 0;
    }

    .movement-context dt { color: var(--muted); }
    .movement-context dd { margin: 0; overflow-wrap: anywhere; }
    .movement-preview { grid-column: 1 / -1; }
    .movement-preview p { margin: var(--space-2) 0; }

    .movement-reversal {
      display: grid;
      gap: var(--space-3);
      padding: var(--space-3);
    }

    .movement-reversal p { margin: 0; }
    .movement-reversal .form-actions { flex-wrap: wrap; }
  `]
})
export class PartsComponent {
  /** Available stock against twice the minimum: half the bar means "at the minimum". */
  protected stockPercent(part: { available: number; minimumStock: number }): number {
    const reference = Math.max(part.minimumStock * 2, part.available, 1);
    return Math.round((Math.max(part.available, 0) / reference) * 100);
  }

  private readonly formBuilder = inject(FormBuilder);
  private readonly partService = inject(PartService);
  private readonly permissions = inject(PermissionService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly injector = inject(Injector);
  private loadRequest?: Subscription;
  private historyRequest?: Subscription;

  protected readonly loading = signal(true);
  protected readonly loadFailed = signal(false);
  protected readonly hasLoaded = signal(false);
  protected readonly loadErrorMessage = signal('');
  protected readonly submitting = signal(false);
  protected readonly modalErrorMessage = signal('');
  protected readonly movementFieldErrors = signal({ quantity: '', reason: '' });
  protected readonly successMessage = signal('');
  protected readonly searchTerm = signal('');
  protected readonly activeTab = signal<PartsTab>('stock');
  protected readonly limits = PART_LIMITS;
  protected readonly movementTypeOptions = MOVEMENT_TYPE_OPTIONS;
  protected readonly movementLabels = PART_MOVEMENT_LABELS;
  protected readonly quantity = formatQuantity;
  protected readonly signedQuantity = formatSignedQuantity;
  protected readonly currency = formatCurrency;
  protected readonly dateTime = formatBusinessDateTime;
  protected readonly canReverse = canReverseMovement;

  protected readonly parts = signal<PartResponse[]>([]);
  protected readonly replenishment = signal<PartReplenishmentResponse[]>([]);
  protected readonly pending = signal<PartReservationResponse[]>([]);
  protected readonly editingPart = signal<PartResponse | null>(null);
  protected readonly formOpen = signal(false);
  protected readonly movementPart = signal<PartResponse | null>(null);
  protected readonly historyPart = signal<PartResponse | null>(null);
  protected readonly history = signal<PartMovementResponse[]>([]);
  protected readonly historyLoading = signal(false);
  protected readonly historyLoadFailed = signal(false);
  protected readonly historyHasLoaded = signal(false);
  protected readonly historyLoadErrorMessage = signal('');
  protected readonly reversingMovementId = signal<number | null>(null);

  protected readonly canManage = computed(() => this.permissions.hasPermission('pecas.movimentar'));

  protected readonly filteredParts = computed(() =>
    this.parts().filter((part) => includesQuery(this.searchTerm(), part.code, part.name, part.location))
  );
  protected readonly belowMinimumCount = computed(() => this.parts().filter((part) => part.active && part.belowMinimum).length);
  protected readonly stockValue = computed(() => this.parts().reduce((sum, part) => sum + part.onHand * part.unitCost, 0));

  protected readonly form = this.formBuilder.nonNullable.group({
    code: ['', [Validators.required, Validators.maxLength(PART_LIMITS.code)]],
    name: ['', [Validators.required, Validators.maxLength(PART_LIMITS.name)]],
    unit: ['un', [Validators.required, Validators.maxLength(PART_LIMITS.unit)]],
    location: ['', [Validators.maxLength(PART_LIMITS.location)]],
    minimumStock: [0, [Validators.required, Validators.min(0)]],
    unitCost: [0, [Validators.required, Validators.min(0)]],
    active: [true]
  });

  protected readonly movementForm = this.formBuilder.nonNullable.group({
    type: this.formBuilder.nonNullable.control<ManualPartMovementType>('ENTRY'),
    quantity: [1, [Validators.required]],
    reason: ['', [Validators.maxLength(PART_LIMITS.reason)]]
  });

  protected readonly reversalReason = this.formBuilder.nonNullable.control('', [Validators.required, Validators.maxLength(PART_LIMITS.reason)]);

  constructor() {
    this.load();
  }

  protected updateSearch(value: string): void {
    this.searchTerm.set(value);
  }

  protected clearSearch(): void {
    this.searchTerm.set('');
  }

  protected retryLoad(): void {
    if (!this.loading()) this.load();
  }

  protected selectTab(tab: PartsTab): void {
    this.activeTab.set(tab);
  }

  protected openCreateModal(): void {
    this.editingPart.set(null);
    this.form.reset({ code: '', name: '', unit: 'un', location: '', minimumStock: 0, unitCost: 0, active: true });
    this.formOpen.set(true);
    this.clearMessages();
  }

  protected openEditModal(part: PartResponse): void {
    this.editingPart.set(part);
    this.form.reset({
      code: part.code,
      name: part.name,
      unit: part.unit,
      location: part.location ?? '',
      minimumStock: part.minimumStock,
      unitCost: part.unitCost,
      active: part.active
    });
    this.formOpen.set(true);
    this.clearMessages();
  }

  protected closeModals(): void {
    if (this.submitting()) return;
    this.resetModals();
  }

  protected savePart(): void {
    if (this.submitting()) return;
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      this.modalErrorMessage.set('Revise os campos destacados antes de salvar a peça.');
      return;
    }

    const raw = this.form.getRawValue();
    const payload: PartRequest = {
      code: raw.code.trim(),
      name: raw.name.trim(),
      unit: raw.unit.trim(),
      location: normalizeOptionalText(raw.location),
      minimumStock: raw.minimumStock,
      unitCost: raw.unitCost,
      active: raw.active
    };
    const current = this.editingPart();
    const request$: Observable<PartResponse> = current ? this.partService.update(current.id, payload) : this.partService.create(payload);

    this.submit(request$, (part) => current ? `Peça ${part.name} atualizada com sucesso.` : `Peça ${part.name} cadastrada com sucesso.`);
  }

  protected openMovementModal(part: PartResponse): void {
    this.movementPart.set(part);
    this.movementForm.reset({ type: 'ENTRY', quantity: 1, reason: '' });
    this.movementFieldErrors.set({ quantity: '', reason: '' });
    this.clearMessages();
  }

  protected movementPreview(): { onHandBefore: number; onHandAfter: number; reserved: number; availableBefore: number; availableAfter: number } | null {
    const part = this.movementPart();
    const { type, quantity } = this.movementForm.getRawValue();
    if (!part || !Number.isFinite(quantity) || !quantity || (type !== 'ADJUSTMENT' && quantity < 0)) return null;
    const change = type === 'EXIT' ? -quantity : quantity;
    return { onHandBefore: part.onHand, onHandAfter: part.onHand + change, reserved: part.reserved, availableBefore: part.available, availableAfter: part.available + change };
  }

  protected saveMovement(): void {
    if (this.submitting()) return;
    this.movementFieldErrors.set({ quantity: '', reason: '' });
    this.modalErrorMessage.set('');
    const part = this.movementPart();
    const raw = this.movementForm.getRawValue();
    const reason = normalizeOptionalText(raw.reason);

    if (!part) return;
    this.movementForm.markAllAsTouched();
    if (this.movementForm.controls.quantity.invalid || !raw.quantity || !Number.isFinite(raw.quantity)) {
      this.movementFieldErrors.set({ quantity: 'Informe uma quantidade diferente de zero.', reason: '' });
      return;
    }
    if (raw.type !== 'ADJUSTMENT' && raw.quantity < 0) {
      this.movementFieldErrors.set({ quantity: 'Entradas e saídas usam quantidade positiva.', reason: '' });
      return;
    }
    if (raw.type === 'ADJUSTMENT' && !reason) {
      this.movementFieldErrors.set({ quantity: '', reason: 'Informe o motivo do ajuste.' });
      return;
    }
    if (this.movementForm.controls.reason.invalid) {
      this.movementFieldErrors.set({ quantity: '', reason: 'Use até 255 caracteres.' });
      return;
    }

    this.submit(this.partService.registerMovement(part.id, { type: raw.type, quantity: raw.quantity, reason }), (movement) => `${PART_MOVEMENT_LABELS[movement.type]} registrada para ${movement.partName}.`);
  }

  protected openHistory(part: PartResponse): void {
    if (this.submitting()) return;
    this.historyPart.set(part);
    this.history.set([]);
    this.historyHasLoaded.set(false);
    this.historyLoadFailed.set(false);
    this.historyLoadErrorMessage.set('');
    this.cancelReversal();
    this.clearMessages();
    this.loadHistory(part.id);
  }

  protected retryHistory(): void {
    const part = this.historyPart();
    if (part && !this.historyLoading()) this.loadHistory(part.id);
  }

  protected startReversal(movement: PartMovementResponse): void {
    if (this.submitting()) return;
    this.reversingMovementId.set(movement.id);
    this.reversalReason.reset('');
    this.modalErrorMessage.set('');
    this.focusAfterRender(`#reversal-reason-${movement.id}`);
  }

  protected cancelReversal(): void {
    if (this.submitting()) return;
    const movementId = this.reversingMovementId();
    if (movementId !== null) this.focusAfterRender(`[data-reverse="${movementId}"]`);
    this.reversingMovementId.set(null);
    this.reversalReason.reset('');
    this.modalErrorMessage.set('');
  }

  protected confirmReversal(movement: PartMovementResponse): void {
    if (this.submitting()) return;
    const reason = normalizeOptionalText(this.reversalReason.value);
    if (!reason) {
      this.modalErrorMessage.set('Informe o motivo do estorno.');
      return;
    }
    if (this.reversalReason.invalid) {
      this.modalErrorMessage.set('Use até 255 caracteres.');
      return;
    }

    this.submitting.set(true);
    this.modalErrorMessage.set('');
    this.partService.reverseMovement(movement.id, reason).pipe(
      takeUntilDestroyed(this.destroyRef),
      finalize(() => this.submitting.set(false))
    ).subscribe({
      next: () => {
        this.reversingMovementId.set(null);
        this.reversalReason.reset('');
        this.successMessage.set(`Movimento ${movement.id} estornado.`);
        this.loadHistory(movement.partId);
        this.load();
      },
      error: (error) => this.modalErrorMessage.set(extractHttpErrorMessage(error, 'Não foi possível estornar o movimento agora.'))
    });
  }

  protected hasError(controlName: PartFormControlName): boolean {
    const control = this.form.controls[controlName];
    return control.invalid && (control.dirty || control.touched);
  }

  private submit<T>(request$: Observable<T>, message: (result: T) => string): void {
    this.submitting.set(true);
    this.clearMessages();

    request$.pipe(
      finalize(() => this.submitting.set(false))
    ).subscribe({
      next: (result) => {
        this.successMessage.set(message(result));
        this.resetModals();
        this.load();
      },
      error: (error) => this.modalErrorMessage.set(extractHttpErrorMessage(error, 'Não foi possível salvar agora.'))
    });
  }

  private loadHistory(partId: number): void {
    if (this.historyPart()?.id !== partId) return;
    this.historyRequest?.unsubscribe();
    this.historyLoading.set(true);
    this.historyRequest = this.partService.listMovements(partId).pipe(
      takeUntilDestroyed(this.destroyRef),
      finalize(() => this.historyLoading.set(false))
    ).subscribe({
      next: (movements) => {
        if (this.historyPart()?.id !== partId) return;
        this.history.set(movements);
        this.historyHasLoaded.set(true);
        this.historyLoadFailed.set(false);
        this.historyLoadErrorMessage.set('');
      },
      error: (error) => {
        if (this.historyPart()?.id !== partId) return;
        this.history.set([]);
        this.historyLoadFailed.set(true);
        this.historyLoadErrorMessage.set(extractHttpErrorMessage(error, 'Não foi possível carregar o histórico.'));
      }
    });
  }

  private load(): void {
    this.loadRequest?.unsubscribe();
    this.loading.set(true);

    this.loadRequest = forkJoin({ parts: this.partService.list(), replenishment: this.partService.listReplenishment(), pending: this.partService.listPending() }).pipe(
      takeUntilDestroyed(this.destroyRef),
      finalize(() => this.loading.set(false))
    ).subscribe({
      next: ({ parts, replenishment, pending }) => {
        this.parts.set(parts);
        this.replenishment.set(replenishment);
        this.pending.set(pending);
        this.hasLoaded.set(true);
        this.loadFailed.set(false);
        this.loadErrorMessage.set('');
      },
      error: (error) => {
        this.loadFailed.set(true);
        this.loadErrorMessage.set(extractHttpErrorMessage(error, 'Não foi possível carregar as peças.'));
      }
    });
  }

  /** Keeps keyboard focus inside the history when the inline reversal opens or closes. */
  private focusAfterRender(selector: string): void {
    afterNextRender(() => this.host.nativeElement.querySelector<HTMLElement>(selector)?.focus(), { injector: this.injector });
  }

  private clearMessages(): void {
    this.modalErrorMessage.set('');
    this.successMessage.set('');
  }

  private resetModals(): void {
    this.historyRequest?.unsubscribe();
    this.formOpen.set(false);
    this.movementPart.set(null);
    this.historyPart.set(null);
    this.history.set([]);
    this.historyHasLoaded.set(false);
    this.historyLoadFailed.set(false);
    this.historyLoadErrorMessage.set('');
    this.reversingMovementId.set(null);
    this.reversalReason.reset('');
    this.modalErrorMessage.set('');
  }
}
