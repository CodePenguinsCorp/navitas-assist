import { Component, ElementRef, EventEmitter, Injector, Output, afterNextRender, computed, effect, inject, input, signal } from '@angular/core';
import { AbstractControl, FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { catchError, finalize, of, switchMap } from 'rxjs';
import { CLOSED_RMA_STATUSES, FAILURE_CAUSE_LABELS, FAILURE_CAUSE_OPTIONS, FAILURE_TYPE_LABELS, FAILURE_TYPE_OPTIONS } from '../../core/mock-data';
import { FailureCause, FailureType, RmaResponse } from '../../core/models';
import { AuthService } from '../../core/services/auth.service';
import { PermissionService } from '../../core/services/permission.service';
import { RmaService } from '../../core/services/rma.service';
import { extractHttpErrorMessage } from '../../core/utils/catalog-ui';
import { todayInputValue } from '../../core/utils/date';
import { diagnosisFacts, NO_DIAGNOSIS_LABEL } from '../../core/utils/rma-detail';
import { normalizeText } from '../../core/utils/rma-ui';
import { CustomSelectComponent } from '../form-controls/custom-select/custom-select.component';
import { DatePickerComponent } from '../form-controls/date-picker/date-picker.component';
import { IconComponent } from '../icon/icon.component';

@Component({
  selector: 'app-rma-diagnosis',
  imports: [ReactiveFormsModule, CustomSelectComponent, DatePickerComponent, IconComponent],
  templateUrl: './rma-diagnosis.component.html',
  styles: [`
    :host { display: block; min-width: 0; overflow-wrap: anywhere; }
    .diagnosis-header { display: flex; align-items: baseline; justify-content: space-between; gap: var(--space-2); flex-wrap: wrap; margin-bottom: var(--space-3); }
    h3 { display: flex; align-items: center; gap: var(--space-2); margin: 0; }
    fieldset.diagnosis-fields { min-inline-size: 0; border: 0; padding: 0; margin: 0; grid-column: 1 / -1; display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: var(--space-3); }
    legend { font-weight: var(--font-weight-bold); margin-bottom: var(--space-2); }
    .form-actions { justify-content: space-between; }
    input, textarea { min-width: 0; width: 100%; box-sizing: border-box; }
    .diagnosis-facts { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: var(--space-3); }
    .diagnosis-facts > div { min-width: 0; }
    .diagnosis-facts dd { white-space: pre-wrap; }
    @media (max-width: 600px) { .form-grid, fieldset.diagnosis-fields, .diagnosis-facts { grid-template-columns: minmax(0, 1fr); } }
  `]
})
export class RmaDiagnosisComponent {
  readonly rma = input.required<RmaResponse>();
  readonly disabled = input(false);
  @Output() readonly saved = new EventEmitter<RmaResponse>();
  @Output() readonly busyChange = new EventEmitter<boolean>();
  private readonly service = inject(RmaService);
  private readonly permissions = inject(PermissionService);
  private readonly builder = inject(FormBuilder);
  private readonly injector = inject(Injector);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  protected readonly canEdit = computed(() => this.permissions.hasPermission('rma.diagnosticar') && !CLOSED_RMA_STATUSES.includes(this.rma().status));
  protected readonly editing = signal(false);
  protected readonly diagnosisSubmitting = signal(false);
  protected readonly diagnosisErrorMessage = signal('');
  protected readonly diagnosisSubmitAttempted = signal(false);
  protected readonly message = signal('');
  protected readonly diagnosisFacts = diagnosisFacts;
  protected readonly noDiagnosisLabel = NO_DIAGNOSIS_LABEL;
  protected readonly failureTypeSelectOptions = [{ value: '', label: 'Não classificado' }, ...FAILURE_TYPE_OPTIONS.map(value => ({ value, label: FAILURE_TYPE_LABELS[value] }))];
  protected readonly failureCauseSelectOptions = [{ value: '', label: 'Não classificada' }, ...FAILURE_CAUSE_OPTIONS.map(value => ({ value, label: FAILURE_CAUSE_LABELS[value] }))];
  protected readonly diagnosisForm = this.builder.nonNullable.group({
    foundFailure: ['', [Validators.required, Validators.pattern(/\S/), Validators.maxLength(2000)]],
    failureType: ['' as FailureType | ''],
    probableCause: ['' as FailureCause | ''],
    notes: ['', Validators.maxLength(2000)],
    diagnosedAt: [todayInputValue(), Validators.required],
    technicianName: ['', [Validators.required, Validators.pattern(/\S/), Validators.maxLength(120)]]
  });

  constructor() {
    let id: number | null = null;
    effect(() => {
      const next = this.rma().id;
      if (next !== id || !this.canEdit()) { this.editing.set(false); this.message.set(''); }
      id = next;
    });
  }

  protected fieldId(name: string): string { return `rma-${this.rma().id}-diagnosis-${name}`; }
  protected showDiagnosisError(control: AbstractControl): boolean { return control.invalid && (control.touched || this.diagnosisSubmitAttempted()); }

  protected edit(): void {
    if (!this.canEdit() || this.disabled() || this.diagnosisSubmitting()) return;
    const diagnosis = this.rma().diagnosis;
    const user = this.injector.get(AuthService).currentUser();
    this.diagnosisForm.reset({
      foundFailure: diagnosis?.foundFailure ?? '', failureType: diagnosis?.failureType ?? '', probableCause: diagnosis?.probableCause ?? '',
      notes: diagnosis?.notes ?? '', diagnosedAt: diagnosis?.diagnosedAt ?? todayInputValue(), technicianName: diagnosis?.technicianName ?? user?.name ?? user?.username ?? ''
    });
    this.diagnosisErrorMessage.set(''); this.message.set(''); this.diagnosisSubmitAttempted.set(false); this.editing.set(true);
    this.focus('[formControlName="foundFailure"]');
  }

  protected cancel(): void {
    if (this.diagnosisSubmitting()) return;
    this.editing.set(false); this.diagnosisErrorMessage.set(''); this.focus('.diagnosis-trigger');
  }

  protected cancelOnEscape(event: Event): void { event.preventDefault(); event.stopPropagation(); this.cancel(); }

  protected saveDiagnosis(): void {
    if (!this.canEdit() || this.disabled() || this.diagnosisSubmitting() || !this.editing()) return;
    this.diagnosisErrorMessage.set('');
    if (this.diagnosisForm.invalid) {
      this.diagnosisForm.markAllAsTouched(); this.diagnosisSubmitAttempted.set(true);
      this.diagnosisErrorMessage.set('Preencha os campos obrigatórios do diagnóstico.');
      this.focus('[aria-invalid="true"]');
      return;
    }
    const id = this.rma().id;
    const raw = this.diagnosisForm.getRawValue();
    this.diagnosisSubmitting.set(true); this.busyChange.emit(true);
    this.diagnosisForm.disable();
    this.service.upsertDiagnosis(id, {
      foundFailure: raw.foundFailure.trim(), failureType: raw.failureType || null, probableCause: raw.probableCause || null,
      notes: normalizeText(raw.notes), diagnosedAt: raw.diagnosedAt, technicianName: raw.technicianName.trim()
    }).pipe(
      switchMap(updated => this.service.getById(id).pipe(catchError(() => {
        this.message.set('Diagnóstico salvo. Não foi possível recarregar o RMA; atualize o detalhe.');
        return of(updated);
      }))),
      finalize(() => { this.diagnosisSubmitting.set(false); this.diagnosisForm.enable(); this.busyChange.emit(false); })
    ).subscribe({
      next: updated => { this.editing.set(false); this.saved.emit(updated); this.focus('.diagnosis-trigger'); },
      error: error => this.diagnosisErrorMessage.set(extractHttpErrorMessage(error, 'Não foi possível salvar o diagnóstico agora.'))
    });
  }

  private focus(selector: string): void {
    afterNextRender(() => this.host.nativeElement.querySelector<HTMLElement>(selector)?.focus(), { injector: this.injector });
  }
}
