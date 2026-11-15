import { Component, DestroyRef, ElementRef, afterRenderEffect, inject } from '@angular/core';
import { Toast, ToastAction, ToastService } from '../../core/services/toast.service';
import { IconComponent } from '../icon/icon.component';

@Component({
  selector: 'app-toast-outlet',
  imports: [IconComponent],
  host: { 'popover': 'manual', 'aria-label': 'Avisos' },
  template: `
    @for (toast of service.toasts(); track toast.id) {
      <section class="toast" [attr.data-tone]="toast.tone" tabindex="-1"
        [attr.role]="toast.tone === 'error' ? 'alert' : 'status'"
        [attr.aria-live]="toast.tone === 'error' ? 'assertive' : 'polite'" aria-atomic="true"
        (mouseenter)="service.pause(toast.id, 'pointer')" (mouseleave)="service.resume(toast.id, 'pointer')"
        (focusin)="service.pause(toast.id, 'focus')" (focusout)="onFocusOut($event, toast.id)"
        (keydown.escape)="closeOnEscape($event, toast.id)">
        <span class="toast__message">{{ toast.message }}</span>
        <div class="toast__actions">
          @for (action of toast.actions; track action.label) {
            <button type="button" class="link-button" (click)="run(toast, action)">{{ action.label }}</button>
          }
        </div>
        <button type="button" class="toast__close" aria-label="Fechar aviso" (click)="service.dismiss(toast.id)">
          <app-icon name="close" [size]="18" />
        </button>
      </section>
    }
  `,
  styleUrl: './toast-outlet.component.css'
})
export class ToastOutletComponent {
  protected readonly service = inject(ToastService);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;

  constructor() {
    const anchor = document.createComment('avisos');
    let dialogs: HTMLDialogElement[] = [];
    const sync = (records: MutationRecord[] = []) => {
      const opened = Array.from(document.querySelectorAll<HTMLDialogElement>('dialog[open]'));
      dialogs = dialogs.filter(dialog => opened.includes(dialog));
      for (const dialog of opened) if (!dialogs.includes(dialog)) dialogs.push(dialog);
      // O último diálogo aberto é o dono da modalidade, independentemente da ordem no DOM.
      for (const record of records) {
        if (record.type === 'attributes' && record.target instanceof HTMLDialogElement && opened.includes(record.target)) {
          dialogs = dialogs.filter(dialog => dialog !== record.target);
          dialogs.push(record.target);
        }
      }
      const parent = dialogs.at(-1) ?? anchor.parentNode;
      if (!parent) return;
      if (this.host.parentNode !== parent) {
        this.host.hidePopover?.();
        if (parent instanceof HTMLDialogElement) parent.append(this.host);
        else parent.insertBefore(this.host, anchor.nextSibling);
      }
      // Um popover externo ao diálogo continua inerte: hospede-o dentro do diálogo ativo.
      if (this.host.showPopover && this.host.hidePopover) {
        if (!this.service.toasts().length) this.host.hidePopover();
        else if (!this.host.matches(':popover-open')) this.host.showPopover();
      }
    };
    const observer = new MutationObserver(sync);
    afterRenderEffect(() => {
      this.service.toasts();
      if (!anchor.parentNode && this.host.parentNode) {
        this.host.before(anchor);
        observer.observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ['open'] });
      }
      sync();
    });
    inject(DestroyRef).onDestroy(() => {
      observer.disconnect();
      this.host.hidePopover?.();
      if (anchor.parentNode) anchor.parentNode.insertBefore(this.host, anchor.nextSibling);
      anchor.remove();
    });
  }

  protected run(toast: Toast, action: ToastAction): void {
    // Fecha primeiro: a ação pode publicar outro aviso com a mesma mensagem.
    this.service.dismiss(toast.id);
    action.run();
  }

  protected onFocusOut(event: FocusEvent, id: number): void {
    if (!(event.relatedTarget instanceof Node) || !(event.currentTarget as HTMLElement).contains(event.relatedTarget)) {
      this.service.resume(id, 'focus');
    }
  }

  protected closeOnEscape(event: Event, id: number): void {
    event.preventDefault(); event.stopPropagation(); this.service.dismiss(id);
  }
}
