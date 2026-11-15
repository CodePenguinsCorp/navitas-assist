import { Component, input, output } from '@angular/core';
import { IconComponent } from '../icon/icon.component';
import { ModalFocusDirective } from '../modal-focus/modal-focus.directive';

let nextId = 0;

/** Standard modal for a failed read (opening a card, loading a detail): short title, plain message, retry and close. */
@Component({
  selector: 'app-error-dialog',
  imports: [IconComponent, ModalFocusDirective],
  template: `
    <div class="modal-overlay" (click)="closed.emit()">
      <section class="modal-panel modal-panel--narrow panel" role="alertdialog" aria-modal="true"
        [attr.aria-labelledby]="titleId" [attr.aria-describedby]="messageId" appModalFocus modalInitialFocus=".button-primary"
        [modalFallbackFocus]="fallbackFocus()" (modalCloseRequested)="closed.emit()" (click)="$event.stopPropagation()">
        <header class="modal-header">
          <h3 [id]="titleId">{{ title() }}</h3>
          <button type="button" class="modal-close" aria-label="Fechar" (click)="closed.emit()"><app-icon name="close" [size]="20" /></button>
        </header>
        <p [id]="messageId" class="error-dialog__message">{{ message() }}</p>
        <div class="form-actions">
          <button type="button" class="button-secondary" (click)="closed.emit()">Fechar</button>
          <button type="button" class="button-primary" (click)="retry.emit()">Tentar novamente</button>
        </div>
      </section>
    </div>
  `,
  styles: `.error-dialog__message { margin: 0 0 var(--space-5); color: var(--muted); line-height: var(--line-height-body); overflow-wrap: anywhere; }`
})
export class ErrorDialogComponent {
  readonly title = input('Não foi possível carregar');
  readonly message = input.required<string>();
  readonly fallbackFocus = input<HTMLElement | null>(null);
  readonly retry = output<void>();
  readonly closed = output<void>();
  protected readonly titleId = `error-dialog-title-${nextId++}`;
  protected readonly messageId = `${this.titleId}-message`;
}
