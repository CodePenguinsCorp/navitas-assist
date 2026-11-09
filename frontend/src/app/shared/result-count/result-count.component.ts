import { Component, Signal, computed, input } from '@angular/core';

/** Builds "N noun" or "N de T noun" (only when T > N); empty while count is null. */
export function resultCountLabel(count: number | null, total: number | null, singular: string, plural: string): string {
  if (count === null) return '';
  const noun = (amount: number) => (amount === 1 ? singular : plural);
  if (total !== null && total > count) return `${count} de ${total} ${noun(total)}`;
  return `${count} ${noun(count)}`;
}

/**
 * Result count shown at the foot of a list, next to its pagination.
 * Hidden while there is no result for the current query (first load, reload or failure).
 */
@Component({
  selector: 'app-result-count',
  template: `
    @if (label()) {
      <p class="result-count">{{ label() }}</p>
    }
  `,
  styles: [':host { display: block; } :host:empty { display: none; }']
})
export class ResultCountComponent {
  readonly singular = input.required<string>();
  readonly plural = input.required<string>();
  /** null while there is no result for the current query (first load or failure). */
  readonly count = input<number | null>(null);
  /** Denominator, provided by the page only while a search or filter is active. */
  readonly total = input<number | null>(null);

  protected readonly label: Signal<string> = computed(() =>
    resultCountLabel(this.count(), this.total(), this.singular(), this.plural())
  );
}
