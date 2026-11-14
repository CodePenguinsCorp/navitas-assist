import { NgTemplateOutlet } from '@angular/common';
import { Component, ElementRef, viewChild, EventEmitter, Injector, Output, DestroyRef, afterNextRender, computed, effect, inject, input, signal, untracked } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { AbstractControl, FormControl, FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Subscription, finalize } from 'rxjs';
import { CLOSED_RMA_STATUSES } from '../../core/mock-data';
import { InterventionResponse, InterventionType, RmaRepairResponse, RmaStatus } from '../../core/models';
import { PermissionService } from '../../core/services/permission.service';
import { RmaRepairService } from '../../core/services/rma-repair.service';
import { extractHttpErrorMessage } from '../../core/utils/catalog-ui';
import { formatDateOnly, todayInputValue } from '../../core/utils/date';
import { CustomSelectComponent } from '../form-controls/custom-select/custom-select.component';
import { RowActionComponent } from '../row-action/row-action.component';
import { IconComponent } from '../icon/icon.component';
import { CollapsibleSectionComponent } from '../collapsible-section/collapsible-section.component';
import { DatePickerComponent } from '../form-controls/date-picker/date-picker.component';

export const INTERVENTION_LABELS: Record<InterventionType, string> = {
  RESOLDERING: 'Ressolda', CLEANING: 'Limpeza', REPROGRAMMING: 'Regravação', FIRMWARE_UPDATE: 'Atualização de firmware', HARNESS_REPLACEMENT: 'Troca de chicote', OTHER: 'Outra'
};

@Component({
  selector: 'app-rma-repair-panel',
  imports: [NgTemplateOutlet, RowActionComponent, ReactiveFormsModule, CustomSelectComponent, DatePickerComponent, IconComponent, CollapsibleSectionComponent],
  templateUrl: './rma-repair-panel.component.html'
})
export class RmaRepairPanelComponent {
  @Output() readonly changed = new EventEmitter<void>();
  protected readonly formOpen = signal(false);
  private readonly fold = viewChild(CollapsibleSectionComponent);
  protected readonly expanded = signal<ReadonlySet<number>>(new Set());
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly injector = inject(Injector);
  protected readonly editing = signal<InterventionResponse | null>(null);
  protected readonly voiding = signal<InterventionResponse | null>(null);
  protected readonly voidReason = new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.pattern(/\S/), Validators.maxLength(1000)] });
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
  protected readonly totalHours = computed(() => this.repair()?.totalServiceHours ?? 0);
  protected readonly labels = INTERVENTION_LABELS;
  protected readonly options = Object.entries(INTERVENTION_LABELS).map(([value, label]) => ({ value, label }));
  protected readonly date = formatDateOnly;
  protected readonly today = todayInputValue;
  protected readonly hours = (value: number) => value.toLocaleString('pt-BR', { maximumFractionDigits: 3 });
  protected readonly form = this.fb.nonNullable.group({
    type: this.fb.nonNullable.control<InterventionType>('RESOLDERING', Validators.required),
    description: ['', [Validators.required, Validators.pattern(/\S/), Validators.maxLength(1000)]],
    performedOn: [todayInputValue(), [Validators.required, (control: AbstractControl) => control.value > todayInputValue() ? { future: true } : null]],
    hours: this.fb.control<number | null>(null, [Validators.required, Validators.min(0.001), Validators.max(999999.999), Validators.pattern(/^\d+(\.\d{1,3})?$/)])
  });

  constructor() {
    effect(() => {
      const id = this.rmaId();
      untracked(() => { this.form.reset(); this.formOpen.set(false); this.expanded.set(new Set()); this.editing.set(null); this.voiding.set(null); this.voidReason.reset(); this.success.set(''); this.repair.set(null); this.load(id); });
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
    const payload = { ...value, hours: value.hours as number, description: value.description.trim() };
    const editing = this.editing();
    (editing ? this.service.updateIntervention(id, editing.id, payload) : this.service.addIntervention(id, payload)).pipe(takeUntilDestroyed(this.destroyRef), finalize(() => this.saving.set(false))).subscribe({
      next: () => { if (id !== this.rmaId()) return; this.closeForm(false); this.success.set('Intervenção salva.'); this.load(id); this.changed.emit(); },
      error: error => { if (id === this.rmaId()) this.error.set(extractHttpErrorMessage(error, 'Não foi possível registrar a intervenção.')); }
    });
  }
  protected edit(item: InterventionResponse): void {
    if (!this.canWrite() || this.saving() || item.voidedAt) return;
    this.voiding.set(null); this.editing.set(item);
    this.form.reset({ type: item.type, description: item.description, performedOn: item.performedOn, hours: item.hours });
    this.focusFirstField();
  }

  protected cancelEdit(): void { this.editing.set(null); this.form.reset(); }

  protected hasError(control: AbstractControl): boolean { return control.invalid && (control.touched || control.dirty); }

  protected toggleForm(): void {
    if (this.editing()) { this.closeForm(true); return; }
    if (this.formOpen()) { this.closeForm(true); return; }
    this.fold()?.setOpen(true); this.formOpen.set(true); this.focusFirstField();
  }

  protected closeForm(restoreFocus: boolean): void {
    this.cancelEdit(); this.formOpen.set(false);
    if (restoreFocus) afterNextRender(() => this.host.nativeElement.querySelector<HTMLElement>('.repair-trigger')?.focus(), { injector: this.injector });
  }

  protected toggleExpanded(id: number): void {
    const next = new Set(this.expanded()); if (!next.delete(id)) next.add(id); this.expanded.set(next);
  }

  private focusFirstField(): void {
    afterNextRender(() => this.host.nativeElement.querySelector<HTMLElement>('.repair-form .custom-select__trigger, .repair-form input, .repair-form textarea')?.focus(), { injector: this.injector });
  }

  protected startVoid(item: InterventionResponse): void {
    if (!this.canWrite() || this.saving() || item.voidedAt) return;
    this.cancelEdit(); this.voiding.set(item); this.voidReason.reset();
  }

  protected confirmVoid(): void {
    const item = this.voiding();
    if (!item || !this.canWrite() || this.saving()) return;
    if (this.voidReason.invalid) { this.voidReason.markAsTouched(); return; }
    const id = this.rmaId(); this.saving.set(true); this.error.set('');
    this.service.voidIntervention(id, item.id, this.voidReason.value.trim()).pipe(takeUntilDestroyed(this.destroyRef), finalize(() => this.saving.set(false))).subscribe({
      next: () => { if (id !== this.rmaId()) return; this.voiding.set(null); this.load(id); this.changed.emit(); },
      error: error => { if (id === this.rmaId()) this.error.set(extractHttpErrorMessage(error, 'Não foi possível anular a intervenção.')); }
    });
  }
}
