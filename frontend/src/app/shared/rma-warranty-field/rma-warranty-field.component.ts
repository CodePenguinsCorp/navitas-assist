import { Component, ElementRef, EventEmitter, Injector, Output, afterNextRender, computed, inject, input, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { finalize } from 'rxjs';
import { RmaItemResponse, RmaResponse, WarrantyOverrideStatus, WarrantyStatus } from '../../core/models';
import { CLOSED_RMA_STATUSES } from '../../core/mock-data';
import { RmaService } from '../../core/services/rma.service';
import { extractHttpErrorMessage } from '../../core/utils/catalog-ui';
import { formatDateTime, warrantyClass, warrantyLabel } from '../../core/utils/rma-ui';
import { CustomSelectComponent, CustomSelectOption } from '../form-controls/custom-select/custom-select.component';

@Component({
  selector: 'app-rma-warranty-field',
  imports: [ReactiveFormsModule, CustomSelectComponent],
  templateUrl: './rma-warranty-field.component.html',
  styleUrl: './rma-warranty-field.component.css'
})
export class RmaWarrantyFieldComponent {
  readonly rma = input.required<RmaResponse>();
  readonly item = input.required<RmaItemResponse>();
  readonly canEdit = input(false);
  readonly disabled = input(false);
  @Output() readonly saved = new EventEmitter<RmaResponse>();
  @Output() readonly busyChange = new EventEmitter<boolean>();
  private readonly service = inject(RmaService);
  private readonly injector = inject(Injector);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  protected readonly editing = signal(false);
  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly invalid = signal(false);
  protected readonly locked = computed(() => this.disabled() || CLOSED_RMA_STATUSES.includes(this.rma().status) || this.item().id === null);
  protected readonly form = new FormGroup({
    override: new FormControl<WarrantyOverrideStatus | null>(null),
    reason: new FormControl('', { nonNullable: true })
  });
  protected readonly selected = signal<WarrantyOverrideStatus | null>(null);
  protected readonly options: CustomSelectOption<WarrantyOverrideStatus | null>[] = [
    { value: null, label: 'Automático' },
    { value: WarrantyStatus.IN_WARRANTY, label: 'Em garantia' },
    { value: WarrantyStatus.OUT_OF_WARRANTY, label: 'Fora de garantia' }
  ];
  protected readonly reasons = ['Sem NF', 'Cortesia', 'Mau uso', 'Cliente estratégico'];
  protected readonly warrantyClass = warrantyClass;
  protected readonly warrantyLabel = warrantyLabel;
  protected readonly dateTimeLabel = formatDateTime;
  protected readonly tooltipId = `warranty-tip-${nextWarrantyId++}`;
  protected readonly errorId = `${this.tooltipId}-error`;

  protected edit(): void {
    if (!this.canEdit() || this.locked() || this.busy()) return;
    const override = this.item().warrantyOverride;
    this.form.reset({ override: override?.status ?? null, reason: override?.reason ?? '' });
    this.selected.set(override?.status ?? null);
    this.error.set(null); this.invalid.set(false); this.editing.set(true);
    this.focusAfterRender('.custom-select__trigger');
  }

  protected selectOverride(): void {
    this.selected.set(this.form.controls.override.value);
    this.invalid.set(false); this.error.set(null);
  }

  protected chooseReason(reason: string): void {
    if (this.busy() || this.locked()) return;
    this.form.controls.reason.setValue(reason); this.invalid.set(false);
    this.host.nativeElement.querySelector('textarea')?.focus();
  }

  protected cancel(event?: Event): void {
    event?.preventDefault(); event?.stopPropagation();
    if (!this.busy()) this.close();
  }

  protected save(): void {
    if (this.busy() || this.locked() || !this.canEdit()) return;
    const itemId = this.item().id;
    if (itemId === null) return;
    const override = this.form.controls.override.value;
    const reason = override ? this.form.controls.reason.value.trim() : null;
    if (override && (!reason || reason.length > 255)) {
      this.invalid.set(true); this.error.set(null);
      this.host.nativeElement.querySelector('textarea')?.focus();
      return;
    }
    this.error.set(null); this.invalid.set(false); this.busy.set(true);
    this.form.disable(); this.busyChange.emit(true);
    this.service.updateWarranty(this.rma().id, itemId, { override, reason })
      .pipe(finalize(() => { this.busy.set(false); this.form.enable(); this.busyChange.emit(false); }))
      .subscribe({
        next: (rma) => { this.close(); this.saved.emit(rma); },
        error: (error) => this.error.set(extractHttpErrorMessage(error, 'Não foi possível salvar a garantia.'))
      });
  }

  private close(): void {
    this.editing.set(false); this.error.set(null); this.invalid.set(false);
    this.focusAfterRender('.warranty-field__trigger');
  }

  private focusAfterRender(selector: string): void {
    afterNextRender(() => this.host.nativeElement.querySelector<HTMLElement>(selector)?.focus(), { injector: this.injector });
  }
}

let nextWarrantyId = 0;
