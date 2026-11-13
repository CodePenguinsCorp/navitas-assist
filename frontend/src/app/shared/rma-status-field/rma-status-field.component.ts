import { Component, ElementRef, EventEmitter, Injector, Output, afterNextRender, computed, effect, inject, input, signal } from '@angular/core';
import { FormControl, ReactiveFormsModule, Validators } from '@angular/forms';
import { finalize } from 'rxjs';
import { RMA_STATUS_FLOW } from '../../core/mock-data';
import { RmaResponse, RmaStatus } from '../../core/models';
import { PermissionService } from '../../core/services/permission.service';
import { RmaService } from '../../core/services/rma.service';
import { extractHttpErrorMessage } from '../../core/utils/catalog-ui';
import { statusLabel } from '../../core/utils/rma-ui';
import { CustomSelectComponent } from '../form-controls/custom-select/custom-select.component';

@Component({
  selector: 'app-rma-status-field',
  imports: [CustomSelectComponent, ReactiveFormsModule],
  template: `
    @if (showSelector() && rma(); as item) {
      @if (allowed()) {
        <app-custom-select class="rma-detail__status" appearance="status" [actionMenu]="true"
          [ariaLabel]="'Alterar status, atual: ' + label(item.status)" [options]="options()" [value]="item.status"
          [disabled]="disabled() || busy() || editing()" (valueChange)="choose($event)" />
      } @else {
        <span class="status-chip" [attr.data-status]="item.status">{{ label(item.status) }}</span>
      }
    }
    @if (message()) {
      <div class="status-feedback" role="status">
        <span>{{ message() }}</span>
        @if (allowed() && previous()) {
          <button type="button" class="link-button" [disabled]="busy() || disabled() || editing()" (click)="undo()">Desfazer</button>
          <button type="button" class="link-button status-note-trigger" [disabled]="busy() || disabled() || editing()" (click)="editNote()">Adicionar observação</button>
        }
      </div>
    }
    @if (error()) { <p class="field-error" role="alert">{{ error() }}</p> }
    @if (draft()) { <p class="muted-inline" role="status">Observação reservada para a próxima mudança: {{ draft() }}</p> }
    @if (editing()) {
      <div class="status-note" (keydown.escape)="cancelOnEscape($event)">
        <label>Observação para a próxima mudança
          <textarea [formControl]="note" rows="3" maxlength="255" [attr.aria-invalid]="note.invalid || null"></textarea>
        </label>
        <p class="muted-inline">O histórico anterior não pode ser editado. A nota será enviada na próxima mudança de status.</p>
        @if (note.invalid) { <p class="field-error" role="alert">Use até 255 caracteres.</p> }
        <div class="form-actions">
          <button type="button" class="button-secondary" (click)="cancelNote()">Cancelar</button>
          <button type="button" class="button-primary" (click)="saveNote()">Salvar</button>
        </div>
      </div>
    }
  `,
  styles: [`
    :host { display: block; min-width: 0; overflow-wrap: anywhere; }
    .status-feedback { display: flex; flex-wrap: wrap; gap: var(--space-2); align-items: baseline; margin-top: var(--space-2); }
    .status-note { display: grid; gap: var(--space-2); margin-top: var(--space-3); }
    label { display: grid; gap: var(--space-2); }
    textarea { box-sizing: border-box; width: 100%; min-width: 0; }
    .form-actions { display: flex; justify-content: space-between; flex-wrap: wrap; gap: var(--space-2); }
  `]
})
export class RmaStatusFieldComponent {
  readonly rma = input<RmaResponse | null>(null);
  readonly showSelector = input(true);
  readonly disabled = input(false);
  @Output() readonly saved = new EventEmitter<RmaResponse>();
  @Output() readonly busyChange = new EventEmitter<boolean>();
  private readonly service = inject(RmaService);
  private readonly permissions = inject(PermissionService);
  private readonly injector = inject(Injector);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private contextRmaId: number | null = null;
  protected readonly allowed = computed(() => this.permissions.hasPermission('rma.status'));
  protected readonly label = statusLabel;
  protected readonly options = computed(() => RMA_STATUS_FLOW.map(status => ({ value: status, label: statusLabel(status), status, hint: status === this.rma()?.status ? 'Status atual' : undefined })));
  protected readonly busy = signal(false);
  protected readonly error = signal('');
  protected readonly message = signal('');
  protected readonly previous = signal<{ before: RmaResponse; after: RmaResponse } | null>(null);
  protected readonly editing = signal(false);
  protected readonly draft = signal('');
  protected readonly note = new FormControl('', { nonNullable: true, validators: [Validators.maxLength(255)] });

  constructor() {
    effect(() => {
      const next = this.rma()?.id ?? null;
      if (next !== this.contextRmaId) {
        this.contextRmaId = next;
        this.previous.set(null); this.message.set(''); this.error.set(''); this.draft.set(''); this.editing.set(false);
      }
    });
  }

  protected choose(status: unknown): void { this.move(status as RmaStatus); }

  /** Board drops use the same request and feedback as the detail selector. */
  move(status: RmaStatus, target = this.rma()): void {
    if (!target || !this.allowed() || this.disabled() || this.busy()) return;
    if (this.contextRmaId !== target.id) {
      this.contextRmaId = target.id;
      this.previous.set(null); this.message.set(''); this.draft.set(''); this.editing.set(false);
    }
    if (this.editing() || status === target.status) return;
    this.submit(target, status, this.draft(), false);
  }

  protected undo(): void {
    const change = this.previous();
    if (!change || !this.allowed() || this.disabled() || this.busy() || this.editing()) return;
    const current = this.rma() ?? change.after;
    if (current.id !== change.after.id || current.status !== change.after.status) {
      this.error.set('O status mudou. Atualize o RMA antes de desfazer.');
      return;
    }
    this.submit(current, change.before.status, '', true);
  }

  private submit(target: RmaResponse, status: RmaStatus, note: string, undo: boolean): void {
    this.error.set(''); this.busy.set(true); this.busyChange.emit(true);
    this.service.updateStatus(target.id, { status, note }).pipe(finalize(() => {
      this.busy.set(false); this.busyChange.emit(false);
    })).subscribe({
      next: updated => {
        this.previous.set(undo ? null : { before: target, after: updated });
        this.message.set(undo ? 'Alteração desfeita' : `Movido para ${statusLabel(updated.status)}`);
        this.draft.set('');
        this.saved.emit(updated);
      },
      error: error => this.error.set(extractHttpErrorMessage(error, 'Não foi possível atualizar o status do RMA.'))
    });
  }

  protected editNote(): void {
    this.note.reset(this.draft()); this.editing.set(true); this.focus('textarea');
  }
  protected cancelNote(): void { this.editing.set(false); this.focus('.status-note-trigger'); }
  protected cancelOnEscape(event: Event): void { event.preventDefault(); event.stopPropagation(); this.cancelNote(); }
  protected saveNote(): void {
    if (this.note.invalid) { this.note.markAsTouched(); return; }
    this.draft.set(this.note.value.trim()); this.cancelNote();
  }
  private focus(selector: string): void {
    afterNextRender(() => this.host.nativeElement.querySelector<HTMLElement>(selector)?.focus(), { injector: this.injector });
  }
}
