import { Component, EventEmitter, OnInit, Output, inject, input, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { finalize } from 'rxjs';
import { RmaResponse } from '../../core/models';
import { RmaService } from '../../core/services/rma.service';
import { extractHttpErrorMessage } from '../../core/utils/catalog-ui';
import { DatePickerComponent } from '../form-controls/date-picker/date-picker.component';
import { ModalFocusDirective } from '../modal-focus/modal-focus.directive';

/** Narrow modal that sets, changes or removes the due date of an RMA (`rma.editar`). */
@Component({
  selector: 'app-rma-due-date-dialog',
  imports: [ReactiveFormsModule, DatePickerComponent, ModalFocusDirective],
  templateUrl: './rma-due-date-dialog.component.html',
  styleUrl: './rma-due-date-dialog.component.css'
})
export class RmaDueDateDialogComponent implements OnInit {
  readonly rma = input.required<RmaResponse>();
  @Output() readonly saved = new EventEmitter<RmaResponse>();
  @Output() readonly closed = new EventEmitter<void>();

  private readonly rmaService = inject(RmaService);
  protected readonly form = inject(FormBuilder).nonNullable.group({ dueDate: [''] });
  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);

  ngOnInit(): void {
    this.form.reset({ dueDate: this.rma().dueDate ?? '' });
  }

  protected close(): void {
    if (!this.busy()) this.closed.emit();
  }

  protected save(): void {
    if (this.busy()) return;
    const dueDate = this.form.getRawValue().dueDate || null;
    if (dueDate && dueDate < this.rma().entryDate) {
      this.error.set('A data limite não pode ser anterior à entrada.');
      return;
    }
    this.busy.set(true);
    this.error.set(null);
    this.rmaService.updateDueDate(this.rma().id, dueDate)
      .pipe(finalize(() => this.busy.set(false)))
      .subscribe({
        next: (rma) => this.saved.emit(rma),
        error: (error) => this.error.set(extractHttpErrorMessage(error, 'Não foi possível salvar a data limite.'))
      });
  }
}
