import { Component, EventEmitter, Output, computed, effect, inject, input, signal } from '@angular/core';
import { finalize } from 'rxjs';
import { AssignableUserResponse, RmaResponse } from '../../core/models';
import { CatalogService } from '../../core/services/catalog.service';
import { RmaService } from '../../core/services/rma.service';
import { extractHttpErrorMessage } from '../../core/utils/catalog-ui';
import { initialsOf, ownerLabel } from '../../core/utils/rma-ui';
import { CustomSelectComponent, CustomSelectOption } from '../form-controls/custom-select/custom-select.component';

/** Unassigned plus the eligible users; a current assignee who can no longer receive OSs stays listed, disabled. */
export function assigneeSelectOptions(
  rma: Pick<RmaResponse, 'assigneeId' | 'assigneeName'>,
  users: readonly AssignableUserResponse[]
): CustomSelectOption<number | null>[] {
  const options: CustomSelectOption<number | null>[] = [
    { value: null, label: 'Sem responsável', avatar: '' },
    ...users.map((user) => ({ value: user.id, label: user.fullName, hint: '@' + user.username, avatar: initialsOf(user.fullName) }))
  ];
  if (rma.assigneeId !== null && !users.some((user) => user.id === rma.assigneeId)) {
    options.push({ value: rma.assigneeId, label: rma.assigneeName ?? 'Responsável atual', avatar: initialsOf(rma.assigneeName), hint: 'Não pode receber novas atribuições', disabled: true });
  }
  return options;
}

/**
 * Assignee of an OS in the list detail: an action menu that saves on pick through the same
 * PATCH /api/rmas/{id}/assignee as the Kanban (history and notification come from the API).
 * Read only without `rma.responsavel`.
 */
@Component({
  selector: 'app-rma-assignee-field',
  imports: [CustomSelectComponent],
  template: `
    @if (canEdit()) {
      <app-custom-select class="rma-assignee-field__picker" appearance="person" [actionMenu]="true"
        [ariaLabel]="'Trocar responsável, atual: ' + owner(rma())" [placeholder]="owner(rma())"
        [options]="options()" [value]="rma().assigneeId" [disabled]="disabled() || busy()" (valueChange)="choose($event)" />
    } @else {
      <span class="person" [class.is-empty]="!rma().assigneeId">
        <span class="avatar" [class.avatar--empty]="!rma().assigneeId" aria-hidden="true">{{ rma().assigneeId ? initials(rma().assigneeName) : '–' }}</span>
        <span [title]="owner(rma())">{{ owner(rma()) }}</span>
      </span>
    }
    @if (message()) { <p class="rma-assignee-field__feedback" role="status">{{ message() }}</p> }
    @if (error()) { <p class="field-error" role="alert">{{ error() }}</p> }
  `,
  styles: [`
    :host { display: block; min-width: 0; overflow-wrap: anywhere; }
    .rma-assignee-field__feedback { margin: var(--space-1) 0 0; color: var(--muted); font-size: 0.82rem; }
    .field-error { margin: var(--space-1) 0 0; }
  `]
})
export class RmaAssigneeFieldComponent {
  readonly rma = input.required<RmaResponse>();
  /** `rma.responsavel`: the assignee becomes a selector. */
  readonly canEdit = input(false);
  /** The host is writing something else: the selector waits. */
  readonly disabled = input(false);
  @Output() readonly saved = new EventEmitter<RmaResponse>();
  @Output() readonly busyChange = new EventEmitter<boolean>();

  private readonly rmaService = inject(RmaService);
  private readonly catalogService = inject(CatalogService);
  private contextRmaId: number | null = null;
  private usersRequested = false;
  protected readonly owner = ownerLabel;
  protected readonly initials = initialsOf;
  protected readonly busy = signal(false);
  protected readonly message = signal('');
  protected readonly error = signal('');
  private readonly users = signal<readonly AssignableUserResponse[]>([]);
  protected readonly options = computed(() => assigneeSelectOptions(this.rma(), this.users()));

  constructor() {
    effect(() => {
      const id = this.rma().id;
      if (id !== this.contextRmaId) {
        this.contextRmaId = id;
        this.message.set('');
        this.error.set('');
      }
      // The eligible users come once, from the lean options endpoint, and only for who can assign.
      if (this.canEdit() && !this.usersRequested) {
        this.usersRequested = true;
        this.catalogService.listAssignableUsers().subscribe({
          next: (users) => this.users.set(users),
          error: (error) => {
            this.usersRequested = false;
            this.error.set(extractHttpErrorMessage(error, 'Não foi possível carregar os responsáveis.'));
          }
        });
      }
    });
  }

  protected choose(value: unknown): void {
    const target = this.rma();
    const assigneeId = value as number | null;
    if (!this.canEdit() || this.disabled() || this.busy() || assigneeId === target.assigneeId) return;
    this.busy.set(true);
    this.busyChange.emit(true);
    this.message.set('');
    this.error.set('');
    this.rmaService.updateAssignee(target.id, { assigneeId })
      .pipe(finalize(() => { this.busy.set(false); this.busyChange.emit(false); }))
      .subscribe({
        next: (updated) => {
          this.message.set(updated.assigneeId ? `Responsável alterado para ${ownerLabel(updated)}` : 'OS sem responsável');
          this.saved.emit(updated);
        },
        error: (error) => this.error.set(extractHttpErrorMessage(error, 'Não foi possível trocar o responsável da OS.'))
      });
  }
}
