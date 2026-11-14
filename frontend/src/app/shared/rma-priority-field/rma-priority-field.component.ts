import { Component, EventEmitter, Output, computed, effect, inject, input, signal } from '@angular/core';
import { finalize } from 'rxjs';
import { CLOSED_RMA_STATUSES } from '../../core/mock-data';
import { RmaPriority, RmaResponse } from '../../core/models';
import { RmaService } from '../../core/services/rma.service';
import { extractHttpErrorMessage } from '../../core/utils/catalog-ui';
import { priorityLabel } from '../../core/utils/rma-ui';
import { CustomSelectComponent, CustomSelectOption } from '../form-controls/custom-select/custom-select.component';

const PRIORITIES: readonly RmaPriority[] = ['HIGH', 'MEDIUM', 'LOW'];

/**
 * Priority of an RMA in the detail: an action menu with the priority bars that saves on pick
 * (PUT /api/rmas/{id} with only `priority`; the API records the change in the status history).
 * Read only without `rma.editar` or once the RMA is closed.
 */
@Component({
  selector: 'app-rma-priority-field',
  imports: [CustomSelectComponent],
  template: `
    @if (editable()) {
      <app-custom-select class="rma-priority-field__picker" appearance="priority" [actionMenu]="true"
        [ariaLabel]="'Alterar prioridade, atual: ' + label(rma().priority)" [options]="options()" [value]="rma().priority"
        [disabled]="disabled() || busy()" (valueChange)="choose($event)" />
    } @else {
      <span class="priority-tag" [attr.data-priority]="rma().priority"><span class="priority-bars" [attr.data-priority]="rma().priority" aria-hidden="true"><i></i><i></i><i></i></span>{{ label(rma().priority) }}</span>
    }
    @if (message()) { <p class="rma-priority-field__feedback" role="status">{{ message() }}</p> }
    @if (error()) { <p class="field-error" role="alert">{{ error() }}</p> }
  `,
  styles: [`
    :host { display: block; min-width: 0; overflow-wrap: anywhere; }
    .rma-priority-field__feedback { margin: var(--space-1) 0 0; color: var(--muted); font-size: 0.82rem; }
    .field-error { margin: var(--space-1) 0 0; }
  `]
})
export class RmaPriorityFieldComponent {
  readonly rma = input.required<RmaResponse>();
  /** `rma.editar`: the priority becomes a selector. */
  readonly canEdit = input(false);
  /** The host is writing something else: the selector waits. */
  readonly disabled = input(false);
  @Output() readonly saved = new EventEmitter<RmaResponse>();
  @Output() readonly busyChange = new EventEmitter<boolean>();

  private readonly rmaService = inject(RmaService);
  private contextRmaId: number | null = null;
  protected readonly label = priorityLabel;
  protected readonly busy = signal(false);
  protected readonly message = signal('');
  protected readonly error = signal('');
  protected readonly editable = computed(() => this.canEdit() && !CLOSED_RMA_STATUSES.includes(this.rma().status));
  protected readonly options = computed<ReadonlyArray<CustomSelectOption<RmaPriority>>>(() =>
    PRIORITIES.map((priority) => ({
      value: priority,
      label: priorityLabel(priority),
      priority,
      hint: priority === this.rma().priority ? 'Prioridade atual' : undefined
    }))
  );

  constructor() {
    effect(() => {
      const id = this.rma().id;
      if (id !== this.contextRmaId) {
        this.contextRmaId = id;
        this.message.set('');
        this.error.set('');
      }
    });
  }

  protected choose(value: unknown): void {
    const target = this.rma();
    const priority = value as RmaPriority;
    if (!this.editable() || this.disabled() || this.busy() || !PRIORITIES.includes(priority) || priority === target.priority) return;
    this.busy.set(true);
    this.busyChange.emit(true);
    this.message.set('');
    this.error.set('');
    this.rmaService.updatePriority(target.id, priority)
      .pipe(finalize(() => { this.busy.set(false); this.busyChange.emit(false); }))
      .subscribe({
        next: (updated) => {
          this.message.set(`Prioridade alterada para ${priorityLabel(updated.priority)}`);
          this.saved.emit(updated);
        },
        error: (error) => this.error.set(extractHttpErrorMessage(error, 'Não foi possível alterar a prioridade da OS.'))
      });
  }
}
