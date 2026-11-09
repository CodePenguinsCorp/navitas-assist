import { DOCUMENT } from '@angular/common';
import { Component, ElementRef, computed, effect, inject, viewChild } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { LoadingService } from './core/services/loading.service';
import { LoadingOverlayComponent } from './shared/loading-overlay/loading-overlay.component';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, LoadingOverlayComponent],
  templateUrl: './app.html',
  styleUrl: './app.css'
})
export class App {
  private readonly loading = inject(LoadingService);
  private readonly document = inject(DOCUMENT);
  private readonly content = viewChild<ElementRef<HTMLElement>>('content');
  private readonly loadingDialog = viewChild<ElementRef<HTMLDialogElement>>('loadingDialog');
  private focusedElement: HTMLElement | null = null;

  protected readonly busy = computed(() => this.loading.pendingCount() > 0 || this.loading.visible());

  constructor() {
    effect(() => {
      const content = this.content()?.nativeElement;
      const dialog = this.loadingDialog()?.nativeElement;
      if (!content || !dialog) return;

      if (this.loading.visible()) {
        const active = this.document.activeElement;
        this.focusedElement = active instanceof HTMLElement && content.contains(active) ? active : null;
        dialog.showModal();
        content.inert = true;
        content.setAttribute('aria-hidden', 'true');
        // Loading has no interactive focus target; restore the saved control when it ends.
        dialog.blur();
      } else {
        dialog.close();
        content.inert = false;
        content.removeAttribute('aria-hidden');
        const previous = this.focusedElement;
        this.focusedElement = null;
        if (previous?.isConnected) previous.focus({ preventScroll: true });
      }
    });
  }
}
