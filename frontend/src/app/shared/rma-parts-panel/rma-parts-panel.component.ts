import { Component, computed, effect, inject, input, signal, untracked } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { finalize } from 'rxjs';
import { CLOSED_RMA_STATUSES } from '../../core/mock-data';
import { PartReservationResponse, PartResponse, RmaPartsResponse, RmaStatus } from '../../core/models';
import { AuthService } from '../../core/services/auth.service';
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
      gap: 0.45rem;
      margin: 0.5rem 0 0.75rem;
    }

    .parts-list {
      display: grid;
      gap: 0.6rem;
    }

    .parts-item {
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto;
      gap: 0.35rem 0.75rem;
      padding: 0.7rem 0.85rem;
      border: 1px solid var(--line);
      border-radius: 12px;
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

    .parts-reserve {
      display: grid;
      grid-template-columns: minmax(0, 2fr) minmax(0, 1fr) minmax(0, 2fr) auto;
      gap: 0.6rem;
      align-items: end;
      margin-top: 0.85rem;
    }

    .parts-history {
      margin-top: 0.75rem;
    }

    .parts-history li {
      color: var(--muted);
      font-size: 0.85rem;
    }

    @media (max-width: 720px) {
      .parts-reserve,
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
  private readonly authService = inject(AuthService);

  readonly rmaId = input.required<number>();
  readonly rmaStatus = input.required<RmaStatus>();

  protected readonly loading = signal(false);
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

  protected readonly canReserve = computed(() => this.authService.hasAnyRole(['ADMIN', 'TECHNICIAN']));
  protected readonly isClosed = computed(() => CLOSED_RMA_STATUSES.includes(this.rmaStatus()));
  protected readonly canCreateReservation = computed(() => this.canReserve() && !this.isClosed());

  protected readonly reservations = computed(() => this.parts()?.reservations ?? []);
  protected readonly activeCount = computed(() => this.reservations().filter((reservation) => reservation.status === 'ACTIVE').length);
  protected readonly consumedCount = computed(() => this.reservations().filter((reservation) => reservation.status === 'CONSUMED').length);

  protected readonly partOptions = computed<ReadonlyArray<CustomSelectOption<number>>>(() =>
    this.catalog()
      .filter((part) => part.active)
      .map((part) => ({ value: part.id, label: `${part.code} | ${part.name} — disponível: ${formatQuantity(part.available, part.unit)}` }))
  );

  protected readonly reserveForm = this.formBuilder.group({
    partId: this.formBuilder.control<number | null>(null, Validators.required),
    quantity: this.formBuilder.nonNullable.control(1, [Validators.required, Validators.min(0.001)]),
    note: this.formBuilder.nonNullable.control('', Validators.maxLength(255))
  });

  constructor() {
    effect(() => {
      const rmaId = this.rmaId();
      untracked(() => this.load(rmaId));
    });
  }

  protected reserve(): void {
    if (this.reserveForm.invalid || this.submitting()) {
      this.reserveForm.markAllAsTouched();
      this.errorMessage.set('Selecione a peça e informe uma quantidade válida.');
      return;
    }

    const raw = this.reserveForm.getRawValue();
    this.submitting.set(true);
    this.clearMessages();

    this.partService.reserve(this.rmaId(), { partId: raw.partId!, quantity: raw.quantity, note: normalizeOptionalText(raw.note) }).pipe(
      finalize(() => this.submitting.set(false))
    ).subscribe({
      next: (reservation) => {
        this.successMessage.set(reservation.status === 'PENDING'
          ? `Saldo insuficiente: ${reservation.partName} ficou pendente de reposição.`
          : `${reservation.partName} reservada para o RMA.`);
        this.reserveForm.reset({ partId: null, quantity: 1, note: '' });
        this.load(this.rmaId());
      },
      error: (error) => this.errorMessage.set(extractHttpErrorMessage(error, 'Não foi possível reservar a peça agora.'))
    });
  }

  protected runAction(reservation: PartReservationResponse, action: PartReservationAction): void {
    if (this.busyReservationId() !== null) {
      return;
    }

    this.busyReservationId.set(reservation.id);
    this.clearMessages();

    this.partService.updateReservation(this.rmaId(), reservation.id, action).pipe(
      finalize(() => this.busyReservationId.set(null))
    ).subscribe({
      next: () => {
        this.successMessage.set(ACTION_MESSAGES[action]);
        this.load(this.rmaId());
      },
      error: (error) => this.errorMessage.set(extractHttpErrorMessage(error, 'Não foi possível atualizar a reserva agora.'))
    });
  }

  private load(rmaId: number): void {
    this.loading.set(true);

    this.partService.getRmaParts(rmaId).pipe(
      finalize(() => this.loading.set(false))
    ).subscribe({
      next: (parts) => this.parts.set(parts),
      error: (error) => this.errorMessage.set(extractHttpErrorMessage(error, 'Não foi possível carregar as peças do RMA.'))
    });

    if (this.canCreateReservation()) {
      this.partService.list().subscribe({ next: (catalog) => this.catalog.set(catalog), error: () => this.catalog.set([]) });
    }
  }

  private clearMessages(): void {
    this.errorMessage.set('');
    this.successMessage.set('');
  }
}
