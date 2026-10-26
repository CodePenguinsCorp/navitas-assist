import { Component, ElementRef, ViewChild, computed, inject, input, output, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { finalize } from 'rxjs';
import { CLOSED_RMA_STATUSES, RMA_STATUS_FLOW, RMA_STATUS_LABELS } from '../../core/mock-data';
import { RmaStatus, WipLimit } from '../../core/models';
import { AuthService } from '../../core/services/auth.service';
import { WipService } from '../../core/services/wip.service';
import { extractHttpErrorMessage } from '../../core/utils/catalog-ui';
import { CustomSelectComponent } from '../form-controls/custom-select/custom-select.component';

@Component({
  selector: 'app-kanban-wip-settings',
  imports: [ReactiveFormsModule, CustomSelectComponent],
  templateUrl: './kanban-wip-settings.component.html',
})
export class KanbanWipSettingsComponent {
  private readonly auth = inject(AuthService);
  private readonly service = inject(WipService);
  private readonly builder = inject(FormBuilder);
  readonly limits = input<readonly WipLimit[]>([]);
  readonly saved = output<void>();
  @ViewChild('wipDialog') private dialog?: ElementRef<HTMLDialogElement>;
  protected readonly busy = signal(false);
  protected readonly error = signal('');
  protected readonly options = RMA_STATUS_FLOW.filter(status => !CLOSED_RMA_STATUSES.includes(status)).map(value => ({ value, label: RMA_STATUS_LABELS[value] }));
  protected readonly ready = computed(() => this.options.every(option => this.limits().some(limit => limit.status === option.value)));
  protected readonly form = this.builder.group({
    status: ['RECEIVED' as RmaStatus, Validators.required],
    maxItems: [null as number | null, [Validators.min(1), Validators.max(100000)]],
    blocking: [false],
  });
  protected canConfigure(): boolean { return this.auth.hasAnyRole(['ADMIN']); }
  protected open(): void {
    if (!this.canConfigure() || this.busy() || !this.ready() || !this.selectColumn('RECEIVED')) return;
    this.error.set('');
    if (!this.dialog?.nativeElement.open) this.dialog?.nativeElement.showModal();
  }
  protected close(): void {
    if (!this.busy()) this.dialog?.nativeElement.close();
  }
  protected cancel(event: Event): void {
    event.preventDefault();
    this.close();
  }
  protected selectColumn(value: unknown): boolean {
    const limit = this.limits().find(item => item.status === value);
    if (this.busy() || !limit || !this.options.some(option => option.value === value)) return false;
    this.form.reset({ status: limit.status, maxItems: limit.maxItems, blocking: limit.blocking });
    return true;
  }
  protected save(): void {
    if (!this.canConfigure() || this.busy() || !this.ready() || this.form.invalid) return;
    const raw = this.form.getRawValue();
    if (raw.maxItems !== null && !Number.isInteger(raw.maxItems)) {
      this.error.set('Informe um limite inteiro ou deixe vazio para não limitar.');
      return;
    }
    if (!raw.status || !this.options.some(option => option.value === raw.status)) return;
    this.busy.set(true);
    this.form.disable({ emitEvent: false });
    this.error.set('');
    this.service.update(raw.status, { maxItems: raw.maxItems, blocking: raw.blocking ?? false }).pipe(finalize(() => { this.busy.set(false); this.form.enable({ emitEvent: false }); })).subscribe({
      next: () => { this.dialog?.nativeElement.close(); this.saved.emit(); },
      error: error => this.error.set(extractHttpErrorMessage(error, 'Não foi possível salvar o limite de WIP.')),
    });
  }
}
