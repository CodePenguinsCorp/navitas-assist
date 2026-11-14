import { Component, computed, input } from '@angular/core';

export interface BarRow { label: string; value: number }

/** Barras horizontais com rótulo e valor visíveis; a própria tabela é a alternativa acessível. */
@Component({
  selector: 'app-bar-chart',
  template: `
    @if (rows().length) {
      <table class="bars" [attr.aria-label]="ariaLabel()">
        <thead class="sr-only"><tr><th scope="col">Item</th><th scope="col">Quantidade</th><th scope="col">Proporção</th></tr></thead>
        <tbody>
          @for (row of rows(); track $index) {
            <tr>
              <th scope="row" class="bars__label">{{ row.label }}</th>
              <td class="bars__value">{{ row.value }}</td>
              <td class="bars__track"><span class="bars__bar" aria-hidden="true" [style.width.%]="width(row.value)"></span></td>
            </tr>
          }
        </tbody>
      </table>
    } @else { <p class="bars__empty">Sem dados no período.</p> }
  `,
  styles: `
    :host { display: block; }
    .bars { width: 100%; border-collapse: collapse; table-layout: fixed; }
    .bars th, .bars td { padding: 0.3rem 0; border: 0; vertical-align: middle; }
    .bars .bars__label { width: 36%; padding-right: 0.75rem; text-align: left; font-weight: 400; color: var(--text); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .bars .bars__value { width: 2.5rem; padding-right: 0.75rem; text-align: right; font-variant-numeric: tabular-nums; color: var(--text); font-weight: 600; }
    .bars__bar { display: block; min-width: 2px; height: 0.6rem; border-radius: 0 4px 4px 0; background: var(--brand-blue); }
    .bars__empty { margin: 0; color: var(--muted); }
  `
})
export class BarChartComponent {
  readonly rows = input.required<readonly BarRow[]>();
  readonly ariaLabel = input('');
  private readonly max = computed(() => this.rows().reduce((value, row) => Math.max(value, row.value), 0));
  protected width(value: number): number {
    return this.max() ? Math.round((value / this.max()) * 100) : 0;
  }
}
