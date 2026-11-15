import { TipDirective } from '../tip/tip.directive';
import { CollapsibleSectionComponent } from '../collapsible-section/collapsible-section.component';
import { viewChild, Component, computed, inject, input } from '@angular/core';
import { CLOSED_RMA_STATUSES } from '../../core/mock-data';
import { RmaResponse } from '../../core/models';
import { ClockService } from '../../core/services/clock.service';
import { formatDuration } from '../../core/utils/duration';
import { stageElapsedSeconds } from '../../core/utils/rma-stage';
import { formatDateTime, statusLabel } from '../../core/utils/rma-ui';

interface StageRow {
  key: string;
  status: RmaResponse['status'];
  text: string;
  /** Stage name and time, shown as two columns in the expanded list. */
  label: string;
  value: string;
  /** Share of the bar; the closing stage of a closed RMA takes no space. */
  weight: number;
  seconds: number;
}

/** "Tempo por etapa": one proportional bar with the total on the right; hovering a segment names its stage and time. */
@Component({
  selector: 'app-rma-stage-times',
  imports: [TipDirective, CollapsibleSectionComponent],
  templateUrl: './rma-stage-times.component.html',
  styleUrl: './rma-stage-times.component.css'
})
export class RmaStageTimesComponent {
  readonly section = viewChild(CollapsibleSectionComponent);
  readonly rma = input.required<Pick<RmaResponse, 'status' | 'stagePeriods'>>();
  private readonly clock = inject(ClockService);

  protected readonly rows = computed<StageRow[]>(() => {
    const periods = this.rma().stagePeriods;
    const closed = CLOSED_RMA_STATUSES.includes(this.rma().status);
    const now = this.clock.now();
    // Map preserves the first passage order already used by the detail.
    const stages = new Map<RmaResponse['status'], { seconds: number; current: boolean; closing: boolean; enteredAt: string }>();
    periods.forEach((period, index) => {
      const current = index === periods.length - 1;
      const closing = current && closed;
      const previous = stages.get(period.status);
      stages.set(period.status, {
        seconds: (previous?.seconds ?? 0) + (closing ? 0 : stageElapsedSeconds(period, now)),
        current,
        closing,
        enteredAt: period.enteredAt
      });
    });
    const rows = [...stages].map(([status, stage]) => {
      const label = statusLabel(status);
      const value = stage.closing
        ? `Encerrada em ${formatDateTime(stage.enteredAt).replace(", ", " ")}`
        : `${formatDuration(stage.seconds)}${stage.current ? ' (atual)' : ''}`;
      return { key: status, status, text: `${label} - ${value}`, label, value, seconds: stage.seconds, closing: stage.closing };
    });
    return rows.map((row) => ({
      key: row.key,
      status: row.status,
      text: row.text,
      label: row.label,
      value: row.value,
      seconds: row.seconds,
      weight: row.closing ? 0 : Math.max(row.seconds, 1)
    }));
  });

  /** Segments of the bar: every stage that took time. */
  protected readonly segments = computed(() => this.rows().filter((row) => row.weight > 0));

  /** Total time spent in stages, shown next to the title. */
  protected readonly totalLabel = computed(() =>
    formatDuration(this.rows().reduce((sum, row) => sum + row.seconds, 0)));

  protected readonly closingRow = computed(() => this.rows().find((row) => row.weight === 0) ?? null);

}
