import { Component, DestroyRef, computed, effect, inject, input, signal, untracked } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { AbstractControl, FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Subscription, finalize } from 'rxjs';
import { CLOSED_RMA_STATUSES } from '../../core/mock-data';
import { InterventionType, RmaRepairResponse, RmaStatus } from '../../core/models';
import { PermissionService } from '../../core/services/permission.service';
import { RmaRepairService } from '../../core/services/rma-repair.service';
import { extractHttpErrorMessage } from '../../core/utils/catalog-ui';
import { formatDateOnly, todayInputValue } from '../../core/utils/date';
import { CustomSelectComponent } from '../form-controls/custom-select/custom-select.component';
import { DatePickerComponent } from '../form-controls/date-picker/date-picker.component';

export const INTERVENTION_LABELS: Record<InterventionType, string> = {
  RESOLDERING: 'Ressolda', CLEANING: 'Limpeza', REPROGRAMMING: 'Regravação', FIRMWARE_UPDATE: 'Atualização de firmware', HARNESS_REPLACEMENT: 'Troca de chicote', OTHER: 'Outra'
};

@Component({
  selector: 'app-rma-repair-panel',
  imports: [ReactiveFormsModule, CustomSelectComponent, DatePickerComponent],
  templateUrl: './rma-repair-panel.component.html'
})
export class RmaRepairPanelComponent {
  readonly rmaId = input.required<number>();
  readonly rmaStatus = input.required<RmaStatus>();
  private readonly service = inject(RmaRepairService);
  private readonly permissions = inject(PermissionService);
  private readonly fb = inject(FormBuilder);
  private readonly destroyRef = inject(DestroyRef);
  private request?: Subscription;
  protected readonly repair = signal<RmaRepairResponse | null>(null);
  protected readonly loading = signal(false);
  protected readonly saving = signal(false);
  protected readonly error = signal('');
  protected readonly success = signal('');
  protected readonly canWrite = computed(() => this.permissions.hasPermission('rma.diagnosticar') && !CLOSED_RMA_STATUSES.includes(this.rmaStatus()));
  protected readonly labels = INTERVENTION_LABELS;
  protected readonly options = Object.entries(INTERVENTION_LABELS).map(([value, label]) => ({ value, label }));
  protected readonly date = formatDateOnly;
  protected readonly today = todayInputValue;
  protected readonly hours = (value: number) => value.toLocaleString('pt-BR', { maximumFractionDigits: 3 });
  protected readonly form = this.fb.nonNullable.group({
    type: this.fb.nonNullable.control<InterventionType>('RESOLDERING', Validators.required),
    description: ['', [Validators.required, Validators.pattern(/\S/), Validators.maxLength(1000)]],
    performedOn: [todayInputValue(), [Validators.required, (control: AbstractControl) => control.value > todayInputValue() ? { future: true } : null]],
    hours: [0, [Validators.required, Validators.min(0.001), Validators.max(999999.999), Validators.pattern(/^\d+(\.\d{1,3})?$/)]]
  });

  constructor() {
    effect(() => {
      const id = this.rmaId();
      untracked(() => { this.form.reset(); this.success.set(''); this.repair.set(null); this.load(id); });
    });
  }

  protected load(id = this.rmaId()): void {
    this.request?.unsubscribe();
    this.loading.set(true); this.error.set('');
    this.request = this.service.getRepair(id).pipe(takeUntilDestroyed(this.destroyRef), finalize(() => this.loading.set(false))).subscribe({
      next: repair => { if (id === this.rmaId()) this.repair.set(repair); },
      error: error => { if (id === this.rmaId()) this.error.set(extractHttpErrorMessage(error, 'Não foi possível carregar as intervenções.')); }
    });
  }

  protected save(): void {
    if (!this.canWrite() || this.saving()) return;
    if (this.form.invalid) { this.form.markAllAsTouched(); return; }
    const id = this.rmaId(); const value = this.form.getRawValue();
    this.saving.set(true); this.error.set(''); this.success.set('');
    this.service.addIntervention(id, { ...value, description: value.description.trim() }).pipe(takeUntilDestroyed(this.destroyRef), finalize(() => this.saving.set(false))).subscribe({
      next: () => { if (id !== this.rmaId()) return; this.form.reset(); this.success.set('Intervenção registrada.'); this.load(id); },
      error: error => { if (id === this.rmaId()) this.error.set(extractHttpErrorMessage(error, 'Não foi possível registrar a intervenção.')); }
    });
  }
}
