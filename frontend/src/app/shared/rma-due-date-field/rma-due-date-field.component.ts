import { Component, ElementRef, EventEmitter, Injector, HostListener, Output, afterNextRender, inject, input, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { finalize } from 'rxjs';
import { RmaResponse } from '../../core/models';
import { RmaService } from '../../core/services/rma.service';
import { extractHttpErrorMessage } from '../../core/utils/catalog-ui';
import { formatDateOnly } from '../../core/utils/date';
import { IconComponent } from '../icon/icon.component';
import { RmaDeadlineChipComponent } from '../rma-deadline-chip/rma-deadline-chip.component';

/**
 * Due date of an RMA as an inline field (Jira style): the value itself is the trigger and opens a date input in place.
 * Saving null sends `clearDueDate: true` (see RmaService.updateDueDate); dates before the entry are refused locally.
 */
@Component({
  selector: 'app-rma-due-date-field',
  imports: [ReactiveFormsModule, IconComponent, RmaDeadlineChipComponent],
  templateUrl: './rma-due-date-field.component.html',
  styleUrl: './rma-due-date-field.component.css'
})
export class RmaDueDateFieldComponent {
  readonly rma = input.required<RmaResponse>();
  /** `rma.editar`: the value becomes clickable. */
  readonly canEdit = input(false);
  /** The host is writing something else: the trigger waits. */
  readonly disabled = input(false);
  @Output() readonly busyChange = new EventEmitter<boolean>();
  @Output() readonly saved = new EventEmitter<RmaResponse>();

  private readonly rmaService = inject(RmaService);
  private readonly injector = inject(Injector);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  protected readonly dateLabel = formatDateOnly;
  protected readonly control = new FormControl('', { nonNullable: true });
  protected readonly form = new FormGroup({ dueDate: this.control });
  protected readonly editing = signal(false);
  protected readonly busy = signal(false);
  protected readonly invalid = signal(false);
  protected readonly error = signal<string | null>(null);

  protected edit(): void {
    if (this.disabled() || !this.canEdit()) return;
    this.control.reset(this.rma().dueDate ?? '');
    this.invalid.set(false);
    this.error.set(null);
    this.editing.set(true);
    this.focusAfterRender('input[type="date"]');
  }

  protected clear(): void {
    this.save(null);
  }

  protected cancel(): void {
    if (this.busy()) return;
    this.close();
  }

  /** Escape leaves the edit first; the detail below ignores the consumed event. */
  protected cancelOnEscape(event: Event): void {
    event.preventDefault();
    event.stopPropagation();
    this.cancel();
  }

  protected selectDate(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (!input.value || !input.validity.valid) {
      this.invalid.set(Boolean(input.value && input.validity.rangeUnderflow));
      return;
    }
    this.save(input.value);
  }

  @HostListener('document:pointerdown', ['$event'])
  protected cancelOutside(event: MouseEvent): void {
    if (this.editing() && !this.host.nativeElement.contains(event.target as Node)) this.close(false);
  }

  private save(dueDate: string | null): void {
    if (!this.editing() || this.busy() || this.disabled() || !this.canEdit()) return;
    if (dueDate === (this.rma().dueDate ?? null)) {
      this.close();
      return;
    }
    if (dueDate && dueDate < this.rma().entryDate) {
      this.invalid.set(true);
      this.error.set(null);
      return;
    }
    this.invalid.set(false);
    this.error.set(null);
    this.busy.set(true);
    this.busyChange.emit(true);
    this.control.disable();
    this.rmaService.updateDueDate(this.rma().id, dueDate)
      .pipe(finalize(() => { this.busy.set(false); this.control.enable(); this.busyChange.emit(false); }))
      .subscribe({
        next: (rma) => {
          this.busy.set(false);
          this.close();
          this.saved.emit(rma);
        },
        error: (error) => this.error.set(extractHttpErrorMessage(error, 'Não foi possível salvar a data limite.'))
      });
  }

  private close(restoreFocus = true): void {
    if (this.busy()) return;
    this.editing.set(false);
    this.invalid.set(false);
    this.error.set(null);
    if (restoreFocus) this.focusAfterRender('.due-date-field__trigger');
  }

  private focusAfterRender(selector: string): void {
    afterNextRender(() => this.host.nativeElement.querySelector<HTMLElement>(selector)?.focus(), { injector: this.injector });
  }
}
