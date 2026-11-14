import { Component, EventEmitter, Output, effect, inject, input, signal } from '@angular/core';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { finalize } from 'rxjs';
import { RmaResponse } from '../../core/models';
import { RmaService } from '../../core/services/rma.service';
import { extractHttpErrorMessage } from '../../core/utils/catalog-ui';
import { formatDateOnly } from '../../core/utils/date';
import { DatePickerComponent } from '../form-controls/date-picker/date-picker.component';
import { RmaDeadlineChipComponent } from '../rma-deadline-chip/rma-deadline-chip.component';

/**
 * Due date of an RMA: the shared date picker is the control. Choosing a date saves it at once; "Limpar" removes it
 * (`clearDueDate: true`, see RmaService.updateDueDate). Dates before the entry are disabled in the calendar.
 */
@Component({
  selector: 'app-rma-due-date-field',
  imports: [ReactiveFormsModule, DatePickerComponent, RmaDeadlineChipComponent],
  templateUrl: './rma-due-date-field.component.html',
  styleUrl: './rma-due-date-field.component.css'
})
export class RmaDueDateFieldComponent {
  readonly rma = input.required<RmaResponse>();
  /** `rma.editar`: the picker is shown; otherwise plain text. */
  readonly canEdit = input(false);
  /** The host is writing something else: the picker waits. */
  readonly disabled = input(false);
  @Output() readonly busyChange = new EventEmitter<boolean>();
  @Output() readonly saved = new EventEmitter<RmaResponse>();

  private readonly rmaService = inject(RmaService);
  protected readonly dateLabel = formatDateOnly;
  protected readonly control = new FormControl('', { nonNullable: true });
  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);

  constructor() {
    effect(() => this.control.setValue(this.rma().dueDate ?? '', { emitEvent: false }));
    effect(() => {
      if (this.disabled() || this.busy()) this.control.disable({ emitEvent: false });
      else this.control.enable({ emitEvent: false });
    });
  }

  protected pick(value: string): void {
    const dueDate = value || null;
    if (this.busy() || this.disabled() || !this.canEdit() || dueDate === (this.rma().dueDate ?? null)) return;
    if (dueDate && dueDate < this.rma().entryDate) return;
    this.error.set(null);
    this.busy.set(true);
    this.busyChange.emit(true);
    this.rmaService.updateDueDate(this.rma().id, dueDate)
      .pipe(finalize(() => { this.busy.set(false); this.busyChange.emit(false); }))
      .subscribe({
        next: (rma) => this.saved.emit(rma),
        error: (error) => {
          this.control.setValue(this.rma().dueDate ?? '', { emitEvent: false });
          this.error.set(extractHttpErrorMessage(error, 'Não foi possível salvar a data limite.'));
        }
      });
  }
}
