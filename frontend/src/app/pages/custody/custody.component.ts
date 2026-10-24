import { Component, computed, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { finalize } from 'rxjs';
import {
  AssignableUserResponse,
  CustodyFlag,
  CustodyMovementRequest,
  CustodyMovementResponse,
  CustodyMovementType,
  RmaCustodyResponse,
  RmaStatus,
  StorageLocationResponse
} from '../../core/models';
import { AuthService } from '../../core/services/auth.service';
import { CustodyService } from '../../core/services/custody.service';
import { extractHttpErrorMessage, includesQuery, normalizeOptionalText } from '../../core/utils/catalog-ui';
import { CUSTODY_FLAG_LABELS, CUSTODY_MOVEMENT_TYPE_LABELS, custodyFlagClass } from '../../core/utils/custody-ui';
import { formatBusinessDateTime } from '../../core/utils/date';
import { statusLabel } from '../../core/utils/rma-ui';
import { CustomSelectComponent, CustomSelectOption } from '../../shared/form-controls/custom-select/custom-select.component';

const FINISHED_STATUSES: RmaStatus[] = ['COMPLETED', 'RETURNED', 'IRREPARABLE'];
const REASON_LIMIT = 255;

@Component({
  selector: 'app-custody',
  imports: [ReactiveFormsModule, CustomSelectComponent],
  templateUrl: './custody.component.html',
  styles: [`
    :host {
      display: block;
    }

    .custody-actions {
      display: flex;
      gap: 0.45rem;
    }

    .custody-history {
      display: grid;
      gap: 0.75rem;
      margin: 0;
      padding: 0;
      list-style: none;
    }

    .custody-history li {
      padding: 0.75rem 0.9rem;
      border: 1px solid var(--line);
      border-radius: 12px;
    }

    .custody-history p {
      margin: 0.25rem 0 0;
      color: var(--muted);
    }

    .modal-feedback {
      margin-bottom: 1rem;
    }
  `]
})
export class CustodyComponent {
  private readonly formBuilder = inject(FormBuilder);
  private readonly custodyService = inject(CustodyService);
  private readonly authService = inject(AuthService);

  protected readonly loading = signal(true);
  protected readonly submitting = signal(false);
  protected readonly errorMessage = signal('');
  protected readonly modalErrorMessage = signal('');
  protected readonly successMessage = signal('');
  protected readonly searchTerm = signal('');
  protected readonly locationFilter = signal<number | null>(null);
  protected readonly flagFilter = signal<CustodyFlag | null>(null);
  protected readonly reasonLimit = REASON_LIMIT;
  protected readonly canMove = computed(() => this.authService.hasAnyRole(['ADMIN', 'SERVICE_DESK', 'TECHNICIAN']));

  private readonly entriesSignal = signal<RmaCustodyResponse[]>([]);
  private readonly locationsSignal = signal<StorageLocationResponse[]>([]);
  private readonly custodiansSignal = signal<AssignableUserResponse[]>([]);
  private readonly movingEntrySignal = signal<RmaCustodyResponse | null>(null);
  private readonly historyEntrySignal = signal<RmaCustodyResponse | null>(null);
  private readonly historySignal = signal<CustodyMovementResponse[]>([]);

  protected readonly entries = this.entriesSignal.asReadonly();
  protected readonly movingEntry = this.movingEntrySignal.asReadonly();
  protected readonly historyEntry = this.historyEntrySignal.asReadonly();
  protected readonly history = this.historySignal.asReadonly();

  protected readonly filteredEntries = computed(() =>
    this.entriesSignal().filter((entry) => includesQuery(this.searchTerm(), entry.rmaCode, entry.clientName, entry.productName, entry.locationName, entry.custodianName))
  );
  protected readonly missingCount = computed(() => this.entriesSignal().filter((entry) => entry.flag === 'MISSING').length);
  protected readonly staleCount = computed(() => this.entriesSignal().filter((entry) => entry.flag === 'STALE').length);

  protected readonly locationFilterOptions = computed<ReadonlyArray<CustomSelectOption<number | null>>>(() => [
    { value: null, label: 'Todos' },
    ...this.locationsSignal().map((location) => ({ value: location.id, label: `${location.code} · ${location.name}` }))
  ]);
  protected readonly flagFilterOptions: ReadonlyArray<CustomSelectOption<CustodyFlag | null>> = [
    { value: null, label: 'Todas' },
    ...(Object.keys(CUSTODY_FLAG_LABELS) as CustodyFlag[]).map((flag) => ({ value: flag, label: CUSTODY_FLAG_LABELS[flag] }))
  ];
  protected readonly destinationOptions = computed<ReadonlyArray<CustomSelectOption<number | null>>>(() =>
    this.locationsSignal()
      .filter((location) => location.active && location.id !== this.movingEntrySignal()?.locationId)
      .map((location) => ({ value: location.id, label: `${location.code} · ${location.name}` }))
  );
  protected readonly custodianOptions = computed<ReadonlyArray<CustomSelectOption<number | null>>>(() => [
    { value: null, label: 'Eu mesmo' },
    ...this.custodiansSignal().map((custodian) => ({ value: custodian.id, label: custodian.fullName }))
  ]);
  protected readonly movementTypeOptions = computed<ReadonlyArray<CustomSelectOption<CustodyMovementType>>>(() => {
    const entry = this.movingEntrySignal();
    if (!entry) {
      return [];
    }
    if (entry.locationId === null) {
      return [{ value: 'ENTRY', label: CUSTODY_MOVEMENT_TYPE_LABELS.ENTRY }];
    }

    const options: CustomSelectOption<CustodyMovementType>[] = [{ value: 'TRANSFER', label: CUSTODY_MOVEMENT_TYPE_LABELS.TRANSFER }];
    if (FINISHED_STATUSES.includes(entry.rmaStatus)) {
      options.push({ value: 'EXIT', label: CUSTODY_MOVEMENT_TYPE_LABELS.EXIT });
    }
    return options;
  });

  protected readonly form = this.formBuilder.nonNullable.group({
    type: ['ENTRY' as CustodyMovementType, [Validators.required]],
    toLocationId: [null as number | null],
    custodianId: [null as number | null],
    reason: ['', [Validators.maxLength(REASON_LIMIT)]]
  });

  constructor() {
    this.loadLocations();
    this.loadEntries();
    if (this.canMove()) {
      this.custodyService.listCustodians().subscribe({ next: (custodians) => this.custodiansSignal.set(custodians) });
    }
  }

  protected updateSearch(value: string): void {
    this.searchTerm.set(value);
  }

  protected updateLocationFilter(value: number | null): void {
    this.locationFilter.set(value);
    this.loadEntries();
  }

  protected updateFlagFilter(value: CustodyFlag | null): void {
    this.flagFilter.set(value);
    this.loadEntries();
  }

  protected openMoveModal(entry: RmaCustodyResponse): void {
    this.movingEntrySignal.set(entry);
    this.form.reset({ type: entry.locationId === null ? 'ENTRY' : 'TRANSFER', toLocationId: null, custodianId: null, reason: '' });
    this.clearMessages();
  }

  protected closeMoveModal(): void {
    this.movingEntrySignal.set(null);
    this.modalErrorMessage.set('');
  }

  protected isExit(): boolean {
    return this.form.controls.type.value === 'EXIT';
  }

  protected saveMovement(): void {
    const entry = this.movingEntrySignal();
    if (!entry) {
      return;
    }

    const raw = this.form.getRawValue();
    if (this.form.invalid || (raw.type !== 'EXIT' && raw.toLocationId === null)) {
      this.form.markAllAsTouched();
      this.modalErrorMessage.set('Selecione o local de destino antes de registrar a movimentação.');
      return;
    }

    const payload: CustodyMovementRequest = {
      type: raw.type,
      toLocationId: raw.type === 'EXIT' ? null : raw.toLocationId,
      custodianId: raw.type === 'EXIT' ? null : raw.custodianId,
      reason: normalizeOptionalText(raw.reason)
    };

    this.submitting.set(true);
    this.clearMessages();

    this.custodyService.move(entry.rmaId, payload).pipe(finalize(() => this.submitting.set(false))).subscribe({
      next: (detail) => {
        this.successMessage.set(`${CUSTODY_MOVEMENT_TYPE_LABELS[payload.type]} do ${detail.current.rmaCode} registrada com sucesso.`);
        this.closeMoveModal();
        this.loadEntries();
      },
      error: (error) => this.modalErrorMessage.set(extractHttpErrorMessage(error, 'Não foi possível registrar a movimentação agora.'))
    });
  }

  protected openHistory(entry: RmaCustodyResponse): void {
    this.historyEntrySignal.set(entry);
    this.historySignal.set([]);
    this.clearMessages();

    this.custodyService.getDetail(entry.rmaId).subscribe({
      next: (detail) => this.historySignal.set(detail.movements),
      error: (error) => this.modalErrorMessage.set(extractHttpErrorMessage(error, 'Não foi possível carregar o histórico.'))
    });
  }

  protected closeHistory(): void {
    this.historyEntrySignal.set(null);
    this.modalErrorMessage.set('');
  }

  protected flagLabel(flag: CustodyFlag): string {
    return CUSTODY_FLAG_LABELS[flag];
  }

  protected flagClass(flag: CustodyFlag): string {
    return custodyFlagClass(flag);
  }

  protected movementLabel(type: CustodyMovementType): string {
    return CUSTODY_MOVEMENT_TYPE_LABELS[type];
  }

  protected rmaStatusLabel(status: RmaStatus): string {
    return statusLabel(status);
  }

  protected dateTimeLabel(value: string | null): string {
    return formatBusinessDateTime(value, '—');
  }

  private loadEntries(): void {
    this.loading.set(true);
    this.errorMessage.set('');

    this.custodyService.search({ locationId: this.locationFilter(), flag: this.flagFilter() }).pipe(finalize(() => this.loading.set(false))).subscribe({
      next: (entries) => this.entriesSignal.set(entries),
      error: (error) => this.errorMessage.set(extractHttpErrorMessage(error, 'Não foi possível carregar a localização dos equipamentos.'))
    });
  }

  private loadLocations(): void {
    this.custodyService.listLocations().subscribe({
      next: (locations) => this.locationsSignal.set(locations),
      error: (error) => this.errorMessage.set(extractHttpErrorMessage(error, 'Não foi possível carregar os locais.'))
    });
  }

  private clearMessages(): void {
    this.errorMessage.set('');
    this.modalErrorMessage.set('');
    this.successMessage.set('');
  }
}
