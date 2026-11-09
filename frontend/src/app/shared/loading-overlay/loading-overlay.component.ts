import { Component, inject } from '@angular/core';
import { LoadingService } from '../../core/services/loading.service';

@Component({
  selector: 'app-loading-overlay',
  template: `
    @if (visible()) {
      <div class="loading-overlay">
        <div class="loading-overlay__card" role="status" aria-live="polite" aria-atomic="true">
          <span class="loading-overlay__spinner" aria-hidden="true"></span>
          <span>Carregando...</span>
        </div>
      </div>
    }
  `,
  styleUrl: './loading-overlay.component.css'
})
export class LoadingOverlayComponent {
  protected readonly visible = inject(LoadingService).visible;
}
