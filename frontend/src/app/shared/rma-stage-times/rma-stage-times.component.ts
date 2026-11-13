import { Component, computed, inject, input } from '@angular/core';
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
}

/** Compact "Tempo por etapa" list, oldest stage first; the last line is the current stage (or the closing). */
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
    return periods.map((period, index) => {
      const current = index === periods.length - 1;
      const label = statusLabel(period.status);
      const text = current && closed
        ? `${label} · Encerrado em ${formatDateTime(period.enteredAt).replace(", ", " ")}`
        : `${label} · ${formatDuration(stageElapsedSeconds(period, now))}${current ? ' (atual)' : ''}`;
      return { key: `${period.status}-${period.enteredAt}-${index}`, status: period.status, text };
    });
  });
}
