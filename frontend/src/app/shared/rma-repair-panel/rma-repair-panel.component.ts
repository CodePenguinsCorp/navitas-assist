import { IconComponent } from '../icon/icon.component';
import { NumberStepperDirective } from '../number-stepper/number-stepper.directive';
import { TipDirective } from '../tip/tip.directive';
import { NgTemplateOutlet } from '@angular/common';
import { viewChildren, Component, ElementRef, viewChild, EventEmitter, Injector, Output, DestroyRef, afterNextRender, computed, effect, inject, input, signal, untracked } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { AbstractControl, FormControl, FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Subscription, finalize } from 'rxjs';
import { CLOSED_RMA_STATUSES, INTERVENTION_TYPE_MAX_LENGTH, INTERVENTION_TYPE_SUGGESTIONS } from '../../core/mock-data';
import { InterventionResponse, RmaRepairResponse, RmaStatus } from '../../core/models';
import { PermissionService } from '../../core/services/permission.service';
import { RmaRepairService } from '../../core/services/rma-repair.service';
import { SuggestionService } from '../../core/services/suggestion.service';
import { ToastService } from '../../core/services/toast.service';
import { extractHttpErrorMessage } from '../../core/utils/catalog-ui';
import { formatDateOnly, todayInputValue } from '../../core/utils/date';
import { lazySuggestions } from '../../core/utils/suggestions';
import { SuggestInputComponent } from '../form-controls/suggest-input/suggest-input.component';
import { RowActionComponent } from '../row-action/row-action.component';
import { CollapsibleSectionComponent } from '../collapsible-section/collapsible-section.component';
import { DatePickerComponent } from '../form-controls/date-picker/date-picker.component';

@Component({
  selector: 'app-rma-repair-panel',
  imports: [NumberStepperDirective, IconComponent, TipDirective, NgTemplateOutlet, RowActionComponent, ReactiveFormsModule, SuggestInputComponent, DatePickerComponent, CollapsibleSectionComponent],
  templateUrl: './rma-repair-panel.component.html'
})
export class RmaRepairPanelComponent {
  readonly sections = viewChildren(CollapsibleSectionComponent);
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
  private readonly toasts = inject(ToastService);
  private request?: Subscription;
  protected readonly repair = signal<RmaRepairResponse | null>(null);
  protected readonly loading = signal(false);
  protected readonly saving = signal(false);
  protected readonly error = signal('');
  protected readonly canWrite = computed(() => this.permissions.hasPermission('rma.diagnosticar') && !CLOSED_RMA_STATUSES.includes(this.rmaStatus()));
  protected readonly totalHours = computed(() => this.repair()?.totalServiceHours ?? 0);
  private readonly suggestionService = inject(SuggestionService);
  protected readonly typeSuggestions = lazySuggestions(INTERVENTION_TYPE_SUGGESTIONS, () => this.suggestionService.interventionTypes());
  protected readonly typeMaxLength = INTERVENTION_TYPE_MAX_LENGTH;
  protected readonly date = formatDateOnly;
  protected readonly today = todayInputValue;
  protected readonly hours = (value: number) => value.toLocaleString('pt-BR', { maximumFractionDigits: 3 });
  protected readonly stats = computed(() => {
    const active = (this.repair()?.interventions ?? []).filter((item) => !item.voidedAt);
    if (active.length === 0) return [];
    const last = active.reduce((max, item) => (item.performedOn > max ? item.performedOn : max), active[0].performedOn);
    const withHours = active.some((item) => item.hours != null);
    return [
      ...(withHours ? [{ label: 'Horas de serviço', value: `${this.hours(this.totalHours())} h` }] : []),
      { label: 'Registros', value: String(active.length) },
      { label: 'Último reparo', value: this.date(last) }
    ];
  });
  protected readonly form = this.fb.nonNullable.group({
    type: ['', [Validators.required, Validators.pattern(/\S/), Validators.maxLength(INTERVENTION_TYPE_MAX_LENGTH)]],
    description: ['', [Validators.required, Validators.pattern(/\S/), Validators.maxLength(1000)]],
    performedOn: [todayInputValue(), [Validators.required, (control: AbstractControl) => control.value > todayInputValue() ? { future: true } : null]],
    hours: this.fb.control<number | null>(null, [Validators.min(0.001), Validators.max(999999.999), Validators.pattern(/^\d+(\.\d{1,3})?$/)])
  });

  constructor() {
    effect(() => {
      const id = this.rmaId();
      untracked(() => { this.form.reset(); this.formOpen.set(false); this.expanded.set(new Set()); this.editing.set(null); this.voiding.set(null); this.voidReason.reset(); this.repair.set(null); this.load(id); });
    });
  }

  protected load(id = this.rmaId()): void {
    this.request?.unsubscribe();
    this.loading.set(true); this.error.set('');
    this.request = this.service.getRepair(id).pipe(takeUntilDestroyed(this.destroyRef), finalize(() => this.loading.set(false))).subscribe({
      next: repair => { if (id === this.rmaId()) this.repair.set(repair); },
      error: error => { if (id === this.rmaId()) this.error.set(extractHttpErrorMessage(error, 'Não foi possível carregar os reparos.')); }
    });
  }

  protected save(): void {
    if (!this.canWrite() || this.saving()) return;
    if (this.form.invalid) { this.form.markAllAsTouched(); return; }
    const id = this.rmaId(); const value = this.form.getRawValue();
    this.saving.set(true); this.error.set('');
    const payload = { ...value, type: value.type.trim(), hours: value.hours ?? null, description: value.description.trim() };
    const editing = this.editing();
    (editing ? this.service.updateIntervention(id, editing.id, payload) : this.service.addIntervention(id, payload)).pipe(takeUntilDestroyed(this.destroyRef), finalize(() => this.saving.set(false))).subscribe({
      next: () => { this.toasts.show({ message: 'Reparo salvo.', tone: 'success' }); if (id !== this.rmaId()) return; this.closeForm(false); this.load(id); this.changed.emit(); },
      error: error => { if (id === this.rmaId()) this.error.set(extractHttpErrorMessage(error, 'Não foi possível registrar o reparo.')); }
    });
  }
  protected edit(item: InterventionResponse): void {
    if (!this.canWrite() || this.saving() || item.voidedAt) return;
    this.voiding.set(null); this.editing.set(item);
    this.form.reset({ type: item.type, description: item.description, performedOn: item.performedOn, hours: item.hours ?? null });
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
    afterNextRender(() => this.host.nativeElement.querySelector<HTMLElement>('.inline-form input, .inline-form textarea')?.focus(), { injector: this.injector });
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
      next: () => { this.toasts.show({ message: 'Reparo anulado.', tone: 'success' }); if (id !== this.rmaId()) return; this.voiding.set(null); this.load(id); this.changed.emit(); },
      error: error => { if (id === this.rmaId()) this.error.set(extractHttpErrorMessage(error, 'Não foi possível anular o reparo.')); }
    });
  }
}
