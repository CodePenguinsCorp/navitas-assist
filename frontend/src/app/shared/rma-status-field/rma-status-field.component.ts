import { ToastAction, ToastService } from '../../core/services/toast.service';
import { TipDirective } from '../tip/tip.directive';
import { Component, DestroyRef, ElementRef, EventEmitter, Injector, Output, afterNextRender, computed, effect, inject, input, signal, untracked } from '@angular/core';
import { FormControl, ReactiveFormsModule, Validators } from '@angular/forms';
import { finalize } from 'rxjs';
import { CLOSED_RMA_STATUSES, RMA_STATUS_FLOW } from '../../core/mock-data';
import { formatBusinessDateTime } from '../../core/utils/date';
import { RmaResponse, RmaStatusHistoryResponse, RmaStatus } from '../../core/models';
import { PermissionService } from '../../core/services/permission.service';
import { RmaService } from '../../core/services/rma.service';
import { extractHttpErrorMessage } from '../../core/utils/catalog-ui';
import { statusLabel } from '../../core/utils/rma-ui';
import { CustomSelectComponent } from '../form-controls/custom-select/custom-select.component';

type StatusTarget = Pick<RmaResponse, 'id' | 'status'> & { statusHistory?: RmaStatusHistoryResponse[] };

@Component({
  selector: 'app-rma-status-field',
  imports: [TipDirective, CustomSelectComponent, ReactiveFormsModule],
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
    @if (event(); as entry) {
      @if (entry.note) { <blockquote class="history-note">{{ entry.note }}</blockquote> }
      @if (entry.noteEditedAt) { <small class="muted-inline" [appTip]="editedTooltip(entry)">(editada)</small> }
      @if (noteAllowed() && !editing()) {
        <button type="button" class="link-button status-note-trigger" [disabled]="busy() || disabled()" (click)="editNote()">{{ entry.note ? 'Editar observação' : 'Adicionar observação' }}</button>
      }
    }
    @if (error()) { <p class="field-error" role="alert">{{ error() }}</p> }
    @if (editing()) {
      <div class="inline-form" (keydown.escape)="cancelOnEscape($event)">
        <label class="field-group field-group--full"><span>Observação</span>
          <textarea [formControl]="note" rows="4" maxlength="255" [attr.aria-invalid]="note.invalid || null"></textarea>
        </label>
        @if (note.invalid) { <p class="field-error field-group--full" role="alert">Use até 255 caracteres.</p> }
        <div class="form-actions inline-form__actions">
          <button type="button" class="button-secondary" (click)="cancelNote()">Cancelar</button>
          <button type="button" class="button-primary" [disabled]="busy() || disabled()" (click)="saveNote()">Salvar</button>
        </div>
      </div>
    }
  `,
  styles: [`
    :host { display: block; min-width: 0; overflow-wrap: anywhere; }
  `]
})
export class RmaStatusFieldComponent {
  /** The open detail or a board card: id and status drive the request; the history, when present, the note. */
  readonly rma = input<StatusTarget | null>(null);
  readonly showSelector = input(true);
  readonly event = input<RmaStatusHistoryResponse | null>(null);
  readonly disabled = input(false);
  @Output() readonly saved = new EventEmitter<RmaResponse>();
  @Output() readonly busyChange = new EventEmitter<boolean>();
  private readonly service = inject(RmaService);
  private readonly toasts = inject(ToastService);
  private readonly destroyRef = inject(DestroyRef);
  private toastId: number | null = null;
  private readonly permissions = inject(PermissionService);
  private readonly injector = inject(Injector);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private contextRmaId: number | null = null;
  protected readonly allowed = computed(() => this.permissions.hasPermission('rma.status'));
  protected readonly label = statusLabel;
  protected readonly options = computed(() => RMA_STATUS_FLOW.map(status => ({ value: status, label: statusLabel(status), status, hint: status === this.rma()?.status ? 'Status atual' : undefined })));
  protected readonly busy = signal(false);
  protected readonly error = signal('');
  protected readonly previous = signal<{ before: StatusTarget; after: RmaResponse } | null>(null);
  protected readonly editing = signal(false);
  protected readonly noteTarget = computed(() => {
    const target = this.event() ?? this.previous()?.after.statusHistory.reduce<RmaStatusHistoryResponse | null>((latest, entry) => !latest || (entry.id ?? 0) > (latest.id ?? 0) ? entry : latest, null);
    return this.rma()?.statusHistory?.find(entry => entry.id === target?.id) ?? target;
  });
  protected readonly noteAllowed = computed(() => this.allowed() && !!this.noteTarget()?.id && !CLOSED_RMA_STATUSES.includes(this.rma()?.status ?? this.previous()?.after.status ?? 'RECEIVED'));
  protected readonly note = new FormControl('', { nonNullable: true, validators: [Validators.maxLength(255)] });

  constructor() {
    this.destroyRef.onDestroy(() => this.dismissToast());
    effect(() => {
      const next = this.rma()?.id ?? null;
      if (next !== this.contextRmaId) {
        this.contextRmaId = next;
        this.previous.set(null); this.dismissToast(); this.error.set(''); this.editing.set(false);
      }
    });
    // Permission revoked (or the OS closed) while the note is open: close it without saving.
    effect(() => { if (!this.noteAllowed() && !untracked(() => this.busy())) this.editing.set(false); });
  }

  protected choose(status: unknown): void { this.move(status as RmaStatus); }

  /** Board drops use the same request and feedback as the detail selector. */
  move(status: RmaStatus, target = this.rma()): void {
    if (!target || !this.allowed() || this.disabled() || this.busy()) return;
    if (this.contextRmaId !== target.id) {
      this.contextRmaId = target.id;
      this.previous.set(null); this.dismissToast(); this.editing.set(false);
    }
    if (this.editing() || status === target.status) return;
    this.submit(target, status, '', false);
  }

  protected undo(): void {
    const change = this.previous();
    if (!change || !this.allowed() || this.disabled() || this.busy() || this.editing()) return;
    const current = this.rma() ?? change.after;
    if (current.id !== change.after.id || current.status !== change.after.status) {
      this.error.set('O status mudou. Atualize a OS antes de desfazer.');
      return;
    }
    this.submit(current, change.before.status, '', true);
  }

  private submit(target: StatusTarget, status: RmaStatus, note: string, undo: boolean): void {
    this.error.set(''); this.busy.set(true); this.busyChange.emit(true);
    this.service.updateStatus(target.id, { status, note }).pipe(finalize(() => {
      this.busy.set(false); this.busyChange.emit(false);
    })).subscribe({
      next: updated => {
        if (this.destroyRef.destroyed || this.contextRmaId !== target.id) return;
        this.previous.set(undo ? null : { before: target, after: updated });
        this.saved.emit(updated);
        if (!this.destroyRef.destroyed) this.showToast(undo, target.id);
      },
      error: error => this.error.set(extractHttpErrorMessage(error, 'Não foi possível atualizar o status da OS.'))
    });
  }

  private dismissToast(): void {
    if (this.toastId !== null) this.toasts.dismiss(this.toastId);
    this.toastId = null;
  }

  private showToast(undo: boolean, rmaId: number): void {
    this.dismissToast();
    const safe = (run: () => void) => () => {
      // Ao fechar o campo ou trocar de OS, callbacks já capturados também viram no-op.
      if (!this.destroyRef.destroyed && this.contextRmaId === rmaId && (!this.rma() || this.rma()?.id === rmaId)) run();
    };
    const actions: ToastAction[] = [];
    if (this.allowed() && this.previous()) actions.push({ label: 'Desfazer', run: safe(() => this.undo()) });
    if (this.noteAllowed()) actions.push({ label: this.noteTarget()?.note ? 'Editar observação' : 'Adicionar observação', run: safe(() => this.editNote()) });
    this.toastId = this.toasts.show({
      message: undo ? 'Alteração desfeita' : `Movido para ${statusLabel(this.previous()!.after.status)}`,
      tone: 'success', actions
    });
  }

  protected editNote(): void {
    if (!this.noteAllowed() || this.disabled() || this.busy()) return;
    this.note.reset(this.noteTarget()?.note ?? ''); this.editing.set(true); this.focus('textarea');
  }
  protected cancelNote(): void { this.editing.set(false); this.focus('.status-note-trigger'); }
  protected cancelOnEscape(event: Event): void { event.preventDefault(); event.stopPropagation(); this.cancelNote(); }
  protected saveNote(): void {
    if (this.note.invalid) { this.note.markAsTouched(); return; }
    const target = this.rma() ?? this.previous()?.after;
    const entry = this.noteTarget();
    if (!target || !entry?.id || !this.noteAllowed() || this.disabled() || this.busy()) return;
    this.error.set(''); this.busy.set(true); this.busyChange.emit(true);
    this.service.updateStatusNote(target.id, entry.id, this.note.value.trim()).pipe(finalize(() => {
      this.busy.set(false); this.busyChange.emit(false);
    })).subscribe({
      next: updated => {
        const previous = this.previous();
        if (previous) this.previous.set({ ...previous, after: updated });
        this.cancelNote(); this.saved.emit(updated);
      },
      error: error => this.error.set(extractHttpErrorMessage(error, 'Não foi possível salvar a observação.'))
    });
  }
  protected editedTooltip(entry: RmaStatusHistoryResponse): string {
    return `${entry.noteEditedBy ?? ''} - ${formatBusinessDateTime(entry.noteEditedAt ?? '')}`;
  }
  private focus(selector: string): void {
    afterNextRender(() => this.host.nativeElement.querySelector<HTMLElement>(selector)?.focus(), { injector: this.injector });
  }
}
