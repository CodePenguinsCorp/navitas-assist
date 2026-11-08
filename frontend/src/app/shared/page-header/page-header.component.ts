import { Component, Signal, computed, input } from '@angular/core';

/**
 * Collection page heading: title, record count and projected actions.
 * The input is named "heading" because "title" would also become the host's native tooltip.
 */
@Component({
  selector: 'app-page-header',
  template: `
    <header class="page-heading">
      <div class="page-heading__title">
        <h1>{{ heading() }}</h1>
        @if (countLabel()) {
          <span class="page-heading__count">{{ countLabel() }}</span>
        }
      </div>
      <div class="shell-actions"><ng-content /></div>
    </header>
  `,
  styles: [':host { display: block; }']
})
export class PageHeaderComponent {
  readonly heading = input.required<string>();
  readonly singular = input.required<string>();
  readonly plural = input.required<string>();
  /** null while there is no result for the current query (first load or failure). */
  readonly count = input<number | null>(null);
  /** Denominator, provided by the page only while a search or filter is active. */
  readonly total = input<number | null>(null);

  protected readonly countLabel: Signal<string> = computed(() => {
    const count = this.count();
    if (count === null) return '';
    const total = this.total();
    if (total !== null && total > count) return `${count} de ${total} ${this.noun(total)}`;
    return `${count} ${this.noun(count)}`;
  });

  private noun(amount: number): string {
    return amount === 1 ? this.singular() : this.plural();
  }
}
