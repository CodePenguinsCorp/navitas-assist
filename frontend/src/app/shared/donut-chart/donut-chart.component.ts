import { Component, computed, input, signal } from '@angular/core';
import { DONUT_CENTER, DONUT_RADIUS, DonutSliceInput, buildDonutArcs } from './donut-geometry';

/** Pizza/rosca em SVG com legenda em tabela: valores e porcentagens nunca dependem só da cor. */
@Component({
  selector: 'app-donut-chart',
  template: `
    <div class="donut" [class.donut--empty]="empty()">
      <svg class="donut__svg" viewBox="0 0 120 120" aria-hidden="true" focusable="false">
        <circle class="donut__track" [attr.cx]="center" [attr.cy]="center" [attr.r]="radius" />
        @for (arc of arcs(); track $index) {
          @if (arc.full) {
            <circle class="donut__arc" [class.is-active]="active() === $index" [attr.cx]="center" [attr.cy]="center" [attr.r]="radius"
              [style.stroke]="'var(--tone-' + arc.tone + ')'" (mouseenter)="active.set($index)" (mouseleave)="active.set(null)" />
          } @else if (arc.path) {
            <path class="donut__arc" [class.is-active]="active() === $index" [class.is-dim]="active() !== null && active() !== $index" [attr.d]="arc.path"
              [style.stroke]="'var(--tone-' + arc.tone + ')'" (mouseenter)="active.set($index)" (mouseleave)="active.set(null)" />
          }
        }
        <text class="donut__value" [attr.x]="center" [attr.y]="center + 2" text-anchor="middle">{{ shownValue() }}</text>
        <text class="donut__label" [attr.x]="center" [attr.y]="center + 15" text-anchor="middle">{{ shownLabel() }}</text>
      </svg>
      <table class="donut__legend" [attr.aria-label]="ariaLabel()">
        <thead class="sr-only"><tr><th scope="col">Situação</th><th scope="col">Valor</th><th scope="col">Participação</th></tr></thead>
        <tbody>
          @for (arc of arcs(); track $index) {
            <tr tabindex="0" [class.is-active]="active() === $index" (mouseenter)="active.set($index)" (mouseleave)="active.set(null)"
              (focus)="active.set($index)" (blur)="active.set(null)">
              <th scope="row"><span class="donut__dot" aria-hidden="true" [style.background]="'var(--tone-' + arc.tone + ')'"></span>{{ arc.label }}</th>
              <td class="donut__num">{{ arc.value }}</td>
              <td class="donut__num donut__pct">{{ arc.percentLabel }}</td>
            </tr>
          }
        </tbody>
      </table>
    </div>
  `,
  styles: `
    :host { display: block; }
    .donut { display: flex; align-items: center; gap: 1.25rem; flex-wrap: wrap; }
    .donut__svg { width: 8.5rem; height: 8.5rem; flex: none; }
    .donut__track { fill: none; stroke: var(--line); stroke-width: 16; }
    .donut__arc { fill: none; stroke-width: 16; transition: stroke-width 120ms ease, opacity 120ms ease; }
    .donut__arc.is-active { stroke-width: 20; }
    .donut__arc.is-dim { opacity: 0.45; }
    .donut__value { fill: var(--text); font-size: 20px; font-weight: 700; font-variant-numeric: tabular-nums; }
    .donut__label { fill: var(--muted); font-size: 8px; }
    .donut__legend { flex: 1 1 11rem; min-width: 0; border-collapse: collapse; }
    .donut__legend tr { border-radius: var(--radius-sm); outline: none; }
    .donut__legend tr:focus-visible { box-shadow: var(--focus-ring); }
    .donut__legend tr.is-active { background: var(--surface-alt); }
    .donut__legend th, .donut__legend td { padding: 0.4rem 0.5rem; border: 0; text-align: left; font-weight: 400; color: var(--text); }
    .donut__dot { display: inline-block; width: 0.7rem; height: 0.7rem; border-radius: 50%; margin-right: 0.5rem; vertical-align: -1px; }
    .donut__legend .donut__num { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
    .donut__legend .donut__pct { color: var(--muted); }
  `
})
export class DonutChartComponent {
  readonly slices = input.required<readonly DonutSliceInput[]>();
  readonly centerLabel = input('');
  readonly centerValue = input<string | number>('');
  readonly ariaLabel = input('');
  protected readonly center = DONUT_CENTER;
  protected readonly radius = DONUT_RADIUS;
  protected readonly active = signal<number | null>(null);
  protected readonly arcs = computed(() => buildDonutArcs(this.slices()));
  protected readonly empty = computed(() => this.arcs().every((arc) => arc.value === 0));
  private readonly activeArc = computed(() => (this.active() === null ? null : this.arcs()[this.active() as number] ?? null));
  protected readonly shownValue = computed(() => (this.empty() ? '—' : this.activeArc()?.value ?? this.centerValue()));
  protected readonly shownLabel = computed(() => (this.empty() ? 'Sem dados' : this.activeArc()?.label ?? this.centerLabel()));
}
