import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { RmaStatus } from '../../core/models';
import { statusLabel } from '../../core/utils/rma-ui';

/** Título de uma entrada de status: "Recebida para Diagnóstico" com os chips do sistema; sem anterior, um chip só. */
@Component({
  selector: 'app-rma-status-transition',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <span class="status-transition" [class.status-transition--compact]="compact()">
      <span class="sr-only">{{ spoken() }}</span>
      <span class="status-transition__visual" aria-hidden="true">
        @if (changed()) {
          <span class="status-chip" [attr.data-status]="previous()">{{ label(previous()!) }}</span>
          <span class="status-transition__word">para</span>
          <span class="status-chip" [attr.data-status]="status()">{{ label(status()) }}</span>
        } @else {
          <span class="status-transition__word">{{ initial() ? 'Status inicial' : 'Status registrado' }}</span>
          <span class="status-chip" [attr.data-status]="status()">{{ label(status()) }}</span>
        }
      </span>
    </span>
  `,
  styles: `
    :host { display: inline-block; max-width: 100%; }
    .status-transition__visual { display: inline-flex; flex-wrap: wrap; align-items: center; gap: var(--space-1) var(--space-2); }
    .status-transition__word { color: var(--muted); font-size: 0.82rem; font-weight: 500; }
    .status-transition--compact .status-chip { min-height: 22px; padding: 0 var(--space-2); font-size: 0.72rem; }
    .status-transition--compact .status-transition__word { font-size: 0.76rem; }
  `
})
export class RmaStatusTransitionComponent {
  readonly status = input.required<RmaStatus>();
  readonly previous = input<RmaStatus | null>(null);
  readonly initial = input(false);
  readonly compact = input(false);
  protected readonly changed = computed(() => !this.initial() && !!this.previous() && this.previous() !== this.status());
  protected readonly spoken = computed(() => this.changed()
    ? `Status alterado de ${statusLabel(this.previous()!)} para ${statusLabel(this.status())}`
    : `${this.initial() ? 'Status inicial' : 'Status registrado'}: ${statusLabel(this.status())}`);
  protected label(status: RmaStatus): string { return statusLabel(status); }
}
