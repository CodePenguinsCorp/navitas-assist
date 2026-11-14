import { Component, computed, inject, input, signal } from '@angular/core';
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
}

/** Share below which a stage would be invisible on the bar; it still gets a thin, hoverable segment. */
const MIN_SHARE = 0.05;

/** "Tempo por etapa": one proportional bar with the total on the right; hovering a segment names its stage and time. */
@Component({
  selector: 'app-rma-stage-times',
  templateUrl: './rma-stage-times.component.html',
  styleUrl: './rma-stage-times.component.css'
})
export class RmaStageTimesComponent {
  readonly rma = input.required<Pick<RmaResponse, 'status' | 'stagePeriods'>>();
  private readonly clock = inject(ClockService);

  protected readonly rows = computed<StageRow[]>(() => {
    const periods = this.rma().stagePeriods;
    const closed = CLOSED_RMA_STATUSES.includes(this.rma().status);
    const now = this.clock.now();
    const rows = periods.map((period, index) => {
      const current = index === periods.length - 1;
      const label = statusLabel(period.status);
      const closing = current && closed;
      const seconds = closing ? 0 : stageElapsedSeconds(period, now);
      const value = closing
        ? `Encerrado em ${formatDateTime(period.enteredAt).replace(", ", " ")}`
        : `${formatDuration(seconds)}${current ? ' (atual)' : ''}`;
      return { key: `${period.status}-${period.enteredAt}-${index}`, status: period.status, text: `${label} · ${value}`, label, value, seconds, closing };
    });
    const total = rows.reduce((sum, row) => sum + row.seconds, 0);
    return rows.map((row) => ({
      key: row.key,
      status: row.status,
      text: row.text,
      label: row.label,
      value: row.value,
      weight: row.closing ? 0 : Math.max(row.seconds, total * MIN_SHARE, 1)
    }));
  });

  /** Segments of the bar: every stage that took time. */
  protected readonly segments = computed(() => this.rows().filter((row) => row.weight > 0));

  /** Total time spent in stages, shown next to the title. */
  protected readonly totalLabel = computed(() => {
    const now = this.clock.now();
    const closed = CLOSED_RMA_STATUSES.includes(this.rma().status);
    const periods = this.rma().stagePeriods;
    const seconds = periods.reduce((sum, period, index) =>
      closed && index === periods.length - 1 ? sum : sum + stageElapsedSeconds(period, now), 0);
    return formatDuration(seconds);
  });

  protected readonly closingRow = computed(() => this.rows().find((row) => row.weight === 0) ?? null);

  /** The per-stage list below the bar is collapsed until the user opens it with the arrow. */
  protected readonly expanded = signal(false);

  protected toggle(): void {
    this.expanded.update((value) => !value);
  }
}
