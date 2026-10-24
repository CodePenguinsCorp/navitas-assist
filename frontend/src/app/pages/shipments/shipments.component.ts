import { Component, computed, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Observable, finalize } from 'rxjs';
import {
  ShipmentDetailResponse,
  ShipmentEventSource,
  ShipmentFieldsRequest,
  ShipmentResponse,
  ShipmentStatus,
  ShipmentType
} from '../../core/models';
import { AuthService } from '../../core/services/auth.service';
import { RmaService } from '../../core/services/rma.service';
import { ShipmentService } from '../../core/services/shipment.service';
import { extractHttpErrorMessage, includesQuery, normalizeOptionalText } from '../../core/utils/catalog-ui';
import { formatBusinessDateTime } from '../../core/utils/date';
import {
  SHIPMENT_EVENT_SOURCE_LABELS,
  SHIPMENT_STATUS_LABELS,
  SHIPMENT_TYPE_LABELS,
  formatCurrency,
  normalizeCost,
  shipmentStatusClass
} from '../../core/utils/shipment-ui';
import { CustomSelectComponent, CustomSelectOption } from '../../shared/form-controls/custom-select/custom-select.component';

type ShipmentFormControlName = 'rmaId' | 'originName' | 'destinationName' | 'volumes' | 'carrier' | 'cost' | 'justification';

const COST_PATTERN = /^\d{1,10}([.,]\d{1,2})?$/;
const ATTENTION_STATUSES: ShipmentStatus[] = ['EXCEPTION', 'DELIVERY_ATTEMPT'];

@Component({
  selector: 'app-shipments',
  imports: [ReactiveFormsModule, CustomSelectComponent],
  templateUrl: './shipments.component.html',
  styles: [`
    :host {
      display: block;
    }

    .shipment-actions {
      display: flex;
      gap: 0.45rem;
    }

    .shipment-details {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
      gap: 0.75rem;
      margin-bottom: 1rem;
    }

    .shipment-details span {
      display: block;
      font-size: 0.8rem;
      color: var(--muted);
    }

    .shipment-events {
      display: grid;
      gap: 0.75rem;
      margin: 0 0 1.25rem;
      padding: 0;
      list-style: none;
    }

    .shipment-events li {
      padding: 0.75rem 0.9rem;
      border: 1px solid var(--line);
      border-radius: 12px;
    }

    .shipment-events p {
      margin: 0.25rem 0 0;
      color: var(--muted);
    }

    .modal-feedback {
      margin-bottom: 1rem;
    }
  `]
})
export class ShipmentsComponent {
  private readonly formBuilder = inject(FormBuilder);
  private readonly shipmentService = inject(ShipmentService);
  private readonly rmaService = inject(RmaService);
  private readonly authService = inject(AuthService);

  protected readonly loading = signal(true);
  protected readonly submitting = signal(false);
  protected readonly syncing = signal(false);
  protected readonly errorMessage = signal('');
  protected readonly modalErrorMessage = signal('');
  protected readonly successMessage = signal('');
  protected readonly searchTerm = signal('');
  protected readonly statusFilter = signal<ShipmentStatus | null>(null);
  protected readonly formOpen = signal(false);
  protected readonly canManage = computed(() => this.authService.hasAnyRole(['ADMIN', 'SERVICE_DESK']));

  private readonly shipmentsSignal = signal<ShipmentResponse[]>([]);
  private readonly rmaOptionsSignal = signal<ReadonlyArray<CustomSelectOption<number | null>>>([]);
  private readonly editingShipmentSignal = signal<ShipmentResponse | null>(null);
  private readonly detailSignal = signal<ShipmentDetailResponse | null>(null);

  protected readonly shipments = this.shipmentsSignal.asReadonly();
  protected readonly rmaOptions = this.rmaOptionsSignal.asReadonly();
  protected readonly editingShipment = this.editingShipmentSignal.asReadonly();
  protected readonly detail = this.detailSignal.asReadonly();

  protected readonly typeOptions: ReadonlyArray<CustomSelectOption<ShipmentType>> = (Object.keys(SHIPMENT_TYPE_LABELS) as ShipmentType[]).map((type) => ({ value: type, label: SHIPMENT_TYPE_LABELS[type] }));
  protected readonly statusOptions: ReadonlyArray<CustomSelectOption<ShipmentStatus>> = (Object.keys(SHIPMENT_STATUS_LABELS) as ShipmentStatus[]).map((status) => ({ value: status, label: SHIPMENT_STATUS_LABELS[status] }));
  protected readonly statusFilterOptions: ReadonlyArray<CustomSelectOption<ShipmentStatus | null>> = [{ value: null, label: 'Todas' }, ...this.statusOptions];

  protected readonly filteredShipments = computed(() =>
    this.shipmentsSignal().filter((shipment) => includesQuery(this.searchTerm(), shipment.rmaCode, shipment.carrier, shipment.serviceName, shipment.trackingCode, shipment.originName, shipment.destinationName))
  );
  protected readonly attentionCount = computed(() => this.shipmentsSignal().filter((shipment) => ATTENTION_STATUSES.includes(shipment.status)).length);
  protected readonly openCount = computed(() => this.shipmentsSignal().filter((shipment) => shipment.closedAt === null).length);

  protected readonly form = this.formBuilder.nonNullable.group({
    rmaId: [null as number | null],
    type: ['PICKUP' as ShipmentType, [Validators.required]],
    originName: ['', [Validators.required, Validators.maxLength(120)]],
    originAddress: ['', [Validators.maxLength(500)]],
    destinationName: ['', [Validators.required, Validators.maxLength(120)]],
    destinationAddress: ['', [Validators.maxLength(500)]],
    volumes: [1, [Validators.required, Validators.min(1), Validators.max(999)]],
    carrier: ['', [Validators.required, Validators.maxLength(120)]],
    serviceName: ['', [Validators.maxLength(120)]],
    trackingCode: ['', [Validators.maxLength(120)]],
    labelReference: ['', [Validators.maxLength(255)]],
    cost: ['', [Validators.pattern(COST_PATTERN)]],
    justification: ['', [Validators.maxLength(500)]]
  });

  protected readonly eventForm = this.formBuilder.nonNullable.group({
    status: ['IN_TRANSIT' as ShipmentStatus, [Validators.required]],
    description: ['', [Validators.maxLength(500)]],
    proofReference: ['', [Validators.maxLength(255)]],
    justification: ['', [Validators.required, Validators.maxLength(500)]]
  });

  constructor() {
    this.loadShipments();
  }

  protected updateSearch(value: string): void {
    this.searchTerm.set(value);
  }

  protected updateStatusFilter(value: ShipmentStatus | null): void {
    this.statusFilter.set(value);
    this.loadShipments();
  }

  protected openCreateForm(): void {
    this.editingShipmentSignal.set(null);
    this.form.reset({ rmaId: null, type: 'PICKUP', originName: '', originAddress: '', destinationName: '', destinationAddress: '', volumes: 1,
      carrier: '', serviceName: '', trackingCode: '', labelReference: '', cost: '', justification: '' });
    this.formOpen.set(true);
    this.clearMessages();
    if (this.rmaOptionsSignal().length === 0) {
      this.rmaService.list().subscribe({
        next: (rmas) => this.rmaOptionsSignal.set(rmas.map((rma) => ({ value: rma.id, label: `${rma.code} · ${rma.clientName}` }))),
        error: (error) => this.modalErrorMessage.set(extractHttpErrorMessage(error, 'Não foi possível carregar os RMAs.'))
      });
    }
  }

  protected openEditForm(shipment: ShipmentResponse): void {
    this.editingShipmentSignal.set(shipment);
    this.form.reset({ rmaId: shipment.rmaId, type: shipment.type, originName: shipment.originName, originAddress: shipment.originAddress ?? '',
      destinationName: shipment.destinationName, destinationAddress: shipment.destinationAddress ?? '', volumes: shipment.volumes, carrier: shipment.carrier,
      serviceName: shipment.serviceName ?? '', trackingCode: shipment.trackingCode ?? '', labelReference: shipment.labelReference ?? '',
      cost: shipment.cost === null ? '' : shipment.cost.toFixed(2), justification: '' });
    this.formOpen.set(true);
    this.clearMessages();
  }

  protected closeForm(): void {
    this.formOpen.set(false);
    this.modalErrorMessage.set('');
  }

  protected saveShipment(): void {
    const editing = this.editingShipmentSignal();
    const raw = this.form.getRawValue();
    const justification = normalizeOptionalText(raw.justification);
    if (this.form.invalid || (!editing && raw.rmaId === null) || (editing && !justification)) {
      this.form.markAllAsTouched();
      this.modalErrorMessage.set(editing ? 'Revise os campos e informe a justificativa da alteração.' : 'Revise os campos destacados e selecione o RMA.');
      return;
    }

    const fields = buildShipmentFields(raw);
    const request$: Observable<ShipmentDetailResponse> = editing
      ? this.shipmentService.update(editing.id, { ...fields, justification: justification as string })
      : this.shipmentService.create({ ...fields, rmaId: raw.rmaId as number });

    this.submitting.set(true);
    this.clearMessages();
    request$.pipe(finalize(() => this.submitting.set(false))).subscribe({
      next: (detail) => {
        this.successMessage.set(editing ? `Remessa do ${detail.shipment.rmaCode} atualizada.` : `Remessa do ${detail.shipment.rmaCode} registrada.`);
        this.closeForm();
        this.loadShipments();
      },
      error: (error) => this.modalErrorMessage.set(extractHttpErrorMessage(error, 'Não foi possível salvar a remessa agora.'))
    });
  }

  protected openDetail(shipment: ShipmentResponse): void {
    this.clearMessages();
    this.eventForm.reset({ status: shipment.status, description: '', proofReference: '', justification: '' });
    this.shipmentService.getDetail(shipment.id).subscribe({
      next: (detail) => this.detailSignal.set(detail),
      error: (error) => this.errorMessage.set(extractHttpErrorMessage(error, 'Não foi possível carregar a remessa.'))
    });
  }

  protected closeDetail(): void {
    this.detailSignal.set(null);
    this.modalErrorMessage.set('');
  }

  protected saveManualEvent(): void {
    const detail = this.detailSignal();
    if (!detail) {
      return;
    }
    if (this.eventForm.invalid) {
      this.eventForm.markAllAsTouched();
      this.modalErrorMessage.set('Informe a justificativa da atualização manual.');
      return;
    }

    const raw = this.eventForm.getRawValue();
    this.submitting.set(true);
    this.modalErrorMessage.set('');
    this.shipmentService.addManualEvent(detail.shipment.id, {
      status: raw.status,
      description: normalizeOptionalText(raw.description),
      proofReference: normalizeOptionalText(raw.proofReference),
      occurredAt: null,
      justification: raw.justification.trim()
    }).pipe(finalize(() => this.submitting.set(false))).subscribe({
      next: (updated) => this.applyDetail(updated, 'Atualização manual registrada.'),
      error: (error) => this.modalErrorMessage.set(extractHttpErrorMessage(error, 'Não foi possível registrar a atualização.'))
    });
  }

  protected syncWithCarrier(): void {
    const detail = this.detailSignal();
    if (!detail) {
      return;
    }

    this.syncing.set(true);
    this.modalErrorMessage.set('');
    this.shipmentService.sync(detail.shipment.id).pipe(finalize(() => this.syncing.set(false))).subscribe({
      next: (updated) => this.applyDetail(updated, 'Rastreio sincronizado com a transportadora.'),
      error: (error) => this.modalErrorMessage.set(`${extractHttpErrorMessage(error, 'Transportadora indisponível.')} A atualização manual continua disponível.`)
    });
  }

  protected hasError(controlName: ShipmentFormControlName): boolean {
    const control = this.form.controls[controlName];
    return control.invalid && (control.dirty || control.touched);
  }

  protected typeLabel(type: ShipmentType): string {
    return SHIPMENT_TYPE_LABELS[type];
  }

  protected statusLabel(status: ShipmentStatus): string {
    return SHIPMENT_STATUS_LABELS[status];
  }

  protected statusClass(status: ShipmentStatus): string {
    return `mini-chip ${shipmentStatusClass(status)}`;
  }

  protected sourceLabel(source: ShipmentEventSource): string {
    return SHIPMENT_EVENT_SOURCE_LABELS[source];
  }

  protected costLabel(value: number | null): string {
    return formatCurrency(value);
  }

  protected dateTimeLabel(value: string | null): string {
    return formatBusinessDateTime(value, '—');
  }

  protected addressLabel(shipment: ShipmentResponse, address: string | null): string {
    if (shipment.addressRestricted) {
      return 'Restrito ao seu perfil';
    }
    if (shipment.addressesPurged) {
      return 'Removido pelo prazo de retenção';
    }
    return address ?? 'Não informado';
  }

  private applyDetail(updated: ShipmentDetailResponse, message: string): void {
    this.detailSignal.set(updated);
    this.shipmentsSignal.update((shipments) => shipments.map((shipment) => shipment.id === updated.shipment.id ? updated.shipment : shipment));
    this.eventForm.reset({ status: updated.shipment.status, description: '', proofReference: '', justification: '' });
    this.successMessage.set(message);
  }

  private loadShipments(): void {
    this.loading.set(true);
    this.errorMessage.set('');
    this.shipmentService.list({ status: this.statusFilter() }).pipe(finalize(() => this.loading.set(false))).subscribe({
      next: (shipments) => this.shipmentsSignal.set(shipments),
      error: (error) => this.errorMessage.set(extractHttpErrorMessage(error, 'Não foi possível carregar as remessas.'))
    });
  }

  private clearMessages(): void {
    this.errorMessage.set('');
    this.modalErrorMessage.set('');
    this.successMessage.set('');
  }
}

function buildShipmentFields(raw: ReturnType<ShipmentsComponent['form']['getRawValue']>): ShipmentFieldsRequest {
  return {
    type: raw.type,
    originName: raw.originName.trim(),
    originAddress: normalizeOptionalText(raw.originAddress),
    destinationName: raw.destinationName.trim(),
    destinationAddress: normalizeOptionalText(raw.destinationAddress),
    volumes: raw.volumes,
    carrier: raw.carrier.trim(),
    serviceName: normalizeOptionalText(raw.serviceName),
    trackingCode: normalizeOptionalText(raw.trackingCode),
    labelReference: normalizeOptionalText(raw.labelReference),
    cost: normalizeCost(raw.cost)
  };
}
