import { Component, DestroyRef, computed, effect, inject, input, signal, untracked } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { AbstractControl, FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Subscription, finalize } from 'rxjs';
import { CLOSED_RMA_STATUSES } from '../../core/mock-data';
import { PartReservationResponse, PartResponse, RmaPartsResponse, RmaStatus } from '../../core/models';
import { PermissionService } from '../../core/services/permission.service';
import { PartReservationAction, PartService } from '../../core/services/part.service';
import { extractHttpErrorMessage, normalizeOptionalText } from '../../core/utils/catalog-ui';
import { formatBusinessDateTime } from '../../core/utils/date';
import { PART_MOVEMENT_LABELS, PART_RESERVATION_STATUS_LABELS, formatCurrency, formatQuantity, reservationStatusClass } from '../../core/utils/part-ui';
import { CustomSelectComponent, CustomSelectOption } from '../form-controls/custom-select/custom-select.component';

const ACTION_MESSAGES: Record<PartReservationAction, string> = {
  allocate: 'Reserva efetivada.',
  consume: 'Consumo registrado.',
  cancel: 'Reserva cancelada e disponibilidade devolvida.'
};

@Component({
  selector: 'app-rma-parts-panel',
  imports: [ReactiveFormsModule, CustomSelectComponent],
  templateUrl: './rma-parts-panel.component.html',
  styles: [`
    :host {
      display: block;
    }

    .parts-summary {
      display: flex;
      flex-wrap: wrap;
      gap: var(--space-2);
      margin: var(--space-2) 0 var(--space-3);
    }

    .parts-costs {
      margin-bottom: 0.75rem;
    }

    .parts-load-error {
      display: grid;
      justify-items: start;
      gap: var(--space-2);
      margin: var(--space-2) 0 var(--space-3);
      border: 1px solid var(--danger-line);
      border-radius: var(--radius-md);
    }

    .parts-item__body {
      display: grid;
      gap: 0.6rem;
      min-width: 0;
    }

    .parts-item__title {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 0.5rem;
    }

    .parts-item .meta-list {
      grid-template-columns: repeat(auto-fill, minmax(100px, 1fr));
    }

    .parts-list {
      display: grid;
      gap: 0.6rem;
    }

    .parts-item {
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto;
      gap: 0.35rem 0.75rem;
      padding: 0.85rem 0.9rem;
      border: 1px solid var(--line);
      border-radius: var(--radius-md);
      background: var(--surface-alt);
    }

    .parts-item small {
      color: var(--muted);
    }

    .parts-item__actions {
      display: flex;
      flex-wrap: wrap;
      gap: 0.4rem;
      justify-content: flex-end;
      align-items: start;
    }

    .parts-reserve-form {
      margin-top: var(--space-4);
    }

    .parts-history {
      margin-top: 0.75rem;
    }

    .parts-history li {
      color: var(--muted);
      font-size: 0.85rem;
    }

    @media (max-width: 720px) {
      .parts-item {
        grid-template-columns: 1fr;
      }

      .parts-item__actions {
        justify-content: flex-start;
      }
    }
  `]
})
export class RmaPartsPanelComponent {
  private readonly formBuilder = inject(FormBuilder);
  private readonly partService = inject(PartService);
  private readonly permissions = inject(PermissionService);

  readonly rmaId = input.required<number>();
  readonly rmaStatus = input.required<RmaStatus>();

  private readonly destroyRef = inject(DestroyRef);
  private loadRequest?: Subscription;
  private catalogRequest?: Subscription;

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
  protected readonly successMessage = signal('');
  protected readonly parts = signal<RmaPartsResponse | null>(null);
  protected readonly catalog = signal<PartResponse[]>([]);

  protected readonly statusLabels = PART_RESERVATION_STATUS_LABELS;
  protected readonly movementLabels = PART_MOVEMENT_LABELS;
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

  protected readonly partOptions = computed<ReadonlyArray<CustomSelectOption<number>>>(() =>
    this.catalog()
      .filter((part) => part.active)
      .map((part) => ({ value: part.id, label: `${part.code} · ${part.name} (disponível: ${formatQuantity(part.available, part.unit)})` }))
  );

  protected readonly reserveForm = this.formBuilder.group({
    partId: this.formBuilder.control<number | null>(null, Validators.required),
    quantity: this.formBuilder.nonNullable.control(1, [Validators.required, Validators.min(0.001)]),
    note: this.formBuilder.nonNullable.control('', Validators.maxLength(255))
  });

  constructor() {
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

  protected selectedPart(): PartResponse | null {
    const partId = this.reserveForm.controls.partId.value;
    return partId === null ? null : this.catalog().find((part) => part.id === partId) ?? null;
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
        if (this.rmaId() !== rmaId) return;
        this.successMessage.set(reservation.status === 'PENDING'
          ? `Saldo insuficiente: ${reservation.partName} ficou pendente de reposição.`
          : `${reservation.partName} reservada para o RMA.`);
        this.reserveForm.reset({ partId: null, quantity: 1, note: '' });
        this.load(rmaId);
      },
      error: (error) => {
        if (this.rmaId() !== rmaId) return;
        this.errorMessage.set(extractHttpErrorMessage(error, 'Não foi possível reservar a peça agora.'));
      }
    });
  }

  protected runAction(reservation: PartReservationResponse, action: PartReservationAction): void {
    if (this.busyReservationId() !== null) {
      return;
    }

    const rmaId = this.rmaId();
    this.busyReservationId.set(reservation.id);
    this.clearMessages();

    this.partService.updateReservation(rmaId, reservation.id, action).pipe(
      takeUntilDestroyed(this.destroyRef),
      finalize(() => this.busyReservationId.set(null))
    ).subscribe({
      next: () => {
        if (this.rmaId() !== rmaId) return;
        this.successMessage.set(ACTION_MESSAGES[action]);
        this.load(rmaId);
      },
      error: (error) => {
        if (this.rmaId() !== rmaId) return;
        this.errorMessage.set(extractHttpErrorMessage(error, 'Não foi possível atualizar a reserva agora.'));
      }
    });
  }

  private resetContext(): void {
    this.loadRequest?.unsubscribe();
    this.catalogRequest?.unsubscribe();
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
        this.loadErrorMessage.set(extractHttpErrorMessage(error, 'Não foi possível carregar as peças do RMA.'));
      }
    });

    this.loadCatalog();
  }

  private loadCatalog(): void {
    if (!this.canCreateReservation()) return;
    this.catalogRequest?.unsubscribe();
    this.catalogLoading.set(true);

    this.catalogRequest = this.partService.list().pipe(
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
    this.successMessage.set('');
  }
}
