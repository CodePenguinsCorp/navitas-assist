import { Component, ElementRef, Injector, afterNextRender, computed, inject, input, linkedSignal } from '@angular/core';
import { RmaResponse } from '../../core/models';
import { rmaHistory } from '../../core/utils/rma-detail';

/** Shared display limit; projected cards keep each detail's existing actions and layout. */
@Component({
  selector: 'app-rma-history-list',
  exportAs: 'rmaHistoryList',
  template: `
    @if (showHeading() && total() > 5) { <h3>Histórico <span class="mini-chip">{{ total() }}</span></h3> }
    <ng-content />
    <p class="sr-only" aria-live="polite" aria-atomic="true">{{ entries().length }} entradas exibidas</p>
    @if (remaining() > 0) {
      <button type="button" class="link-button" (click)="showMore()">Ver mais ({{ remaining() }} restantes)</button>
    }
  `,
  styles: `
    :host { display: block; }
    h3 { display: flex; align-items: center; gap: var(--space-2); margin: 0 0 var(--space-3); }
    button { display: block; margin-top: var(--space-3); }
  `
})
export class RmaHistoryListComponent {
  readonly rma = input.required<RmaResponse>();
  readonly showHeading = input(false);
  private readonly rmaId = computed(() => this.rma().id);
  readonly visible = linkedSignal({ source: this.rmaId, computation: () => 5 });
  private readonly history = computed(() => rmaHistory(this.rma()));
  readonly total = computed(() => this.history().length);
  readonly entries = computed(() => this.history().slice(0, this.visible()));
  readonly remaining = computed(() => this.total() - this.entries().length);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly injector = inject(Injector);

  protected showMore(): void {
    const firstNew = this.entries().length;
    const id = this.rmaId();
    this.visible.update(count => count + 10);
    afterNextRender(() => {
      if (this.rmaId() !== id) return;
      const entry = this.host.nativeElement.querySelectorAll<HTMLElement>('ol > li')[firstNew];
      entry?.setAttribute('tabindex', '-1');
      entry?.focus();
    }, { injector: this.injector });
  }
}
