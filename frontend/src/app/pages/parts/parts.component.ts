import { Component, computed, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Observable, finalize, forkJoin } from 'rxjs';
import {
  ManualPartMovementType,
  PartMovementResponse,
  PartReplenishmentResponse,
  PartRequest,
  PartReservationResponse,
  PartResponse
} from '../../core/models';
import { AuthService } from '../../core/services/auth.service';
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
  imports: [ReactiveFormsModule, CustomSelectComponent],
  templateUrl: './parts.component.html',
  styles: [`
    :host {
      display: block;
    }

    .part-actions {
      display: flex;
      flex-wrap: wrap;
      gap: 0.45rem;
    }

    .part-tabs {
      display: flex;
      gap: 0.5rem;
      margin-bottom: 1rem;
    }

    .part-tabs .is-active {
      background: var(--brand-blue-deep);
      color: #ffffff;
    }

    .modal-feedback {
      margin-bottom: 1rem;
    }

    .movement-reversal {
      display: flex;
      gap: 0.45rem;
      align-items: center;
    }

    .movement-reversal input {
      min-width: 12rem;
    }
  `]
})
export class PartsComponent {
  private readonly formBuilder = inject(FormBuilder);
  private readonly partService = inject(PartService);
  private readonly authService = inject(AuthService);

  protected readonly loading = signal(true);
  protected readonly submitting = signal(false);
  protected readonly errorMessage = signal('');
  protected readonly modalErrorMessage = signal('');
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
  protected readonly reversingMovementId = signal<number | null>(null);

  protected readonly canManage = computed(() => this.authService.hasAnyRole(['ADMIN', 'SERVICE_DESK']));

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
    this.formOpen.set(false);
    this.movementPart.set(null);
    this.historyPart.set(null);
    this.reversingMovementId.set(null);
    this.modalErrorMessage.set('');
  }

  protected savePart(): void {
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
    this.clearMessages();
  }

  protected saveMovement(): void {
    const part = this.movementPart();
    const raw = this.movementForm.getRawValue();
    const reason = normalizeOptionalText(raw.reason);

    if (!part || this.movementForm.invalid || !raw.quantity) {
      this.modalErrorMessage.set('Informe uma quantidade diferente de zero.');
      return;
    }
    if (raw.type !== 'ADJUSTMENT' && raw.quantity < 0) {
      this.modalErrorMessage.set('Entradas e saídas usam quantidade positiva.');
      return;
    }
    if (raw.type === 'ADJUSTMENT' && !reason) {
      this.modalErrorMessage.set('Informe o motivo do ajuste.');
      return;
    }

    this.submit(this.partService.registerMovement(part.id, { type: raw.type, quantity: raw.quantity, reason }), (movement) => `${PART_MOVEMENT_LABELS[movement.type]} registrada para ${movement.partName}.`);
  }

  protected openHistory(part: PartResponse): void {
    this.historyPart.set(part);
    this.history.set([]);
    this.clearMessages();
    this.loadHistory(part.id);
  }

  protected startReversal(movement: PartMovementResponse): void {
    this.reversingMovementId.set(movement.id);
    this.reversalReason.reset('');
    this.modalErrorMessage.set('');
  }

  protected confirmReversal(movement: PartMovementResponse): void {
    const reason = normalizeOptionalText(this.reversalReason.value);
    if (!reason) {
      this.modalErrorMessage.set('Informe o motivo do estorno.');
      return;
    }

    this.submitting.set(true);
    this.modalErrorMessage.set('');
    this.partService.reverseMovement(movement.id, reason).pipe(
      finalize(() => this.submitting.set(false))
    ).subscribe({
      next: () => {
        this.reversingMovementId.set(null);
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
        this.closeModals();
        this.load();
      },
      error: (error) => this.modalErrorMessage.set(extractHttpErrorMessage(error, 'Não foi possível salvar agora.'))
    });
  }

  private loadHistory(partId: number): void {
    this.historyLoading.set(true);
    this.partService.listMovements(partId).pipe(
      finalize(() => this.historyLoading.set(false))
    ).subscribe({
      next: (movements) => this.history.set(movements),
      error: (error) => this.modalErrorMessage.set(extractHttpErrorMessage(error, 'Não foi possível carregar o histórico.'))
    });
  }

  private load(): void {
    this.loading.set(true);
    this.errorMessage.set('');

    forkJoin({ parts: this.partService.list(), replenishment: this.partService.listReplenishment(), pending: this.partService.listPending() }).pipe(
      finalize(() => this.loading.set(false))
    ).subscribe({
      next: ({ parts, replenishment, pending }) => {
        this.parts.set(parts);
        this.replenishment.set(replenishment);
        this.pending.set(pending);
      },
      error: (error) => this.errorMessage.set(extractHttpErrorMessage(error, 'Não foi possível carregar o estoque de peças.'))
    });
  }

  private clearMessages(): void {
    this.errorMessage.set('');
    this.modalErrorMessage.set('');
    this.successMessage.set('');
  }
}
