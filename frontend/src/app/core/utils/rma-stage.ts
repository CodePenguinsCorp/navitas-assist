import { CLOSED_RMA_STATUSES } from '../mock-data';
import { RmaResponse, RmaStagePeriodResponse } from '../models';
import { formatDuration } from './duration';

/** The backend always sends at least one period; the last one is the current stage. */
export function currentStagePeriod(rma: Pick<RmaResponse, 'stagePeriods'>): RmaStagePeriodResponse {
  return rma.stagePeriods[rma.stagePeriods.length - 1];
}

/** The current period keeps counting with the shared clock; finished periods keep their recorded duration. */
export function stageElapsedSeconds(period: RmaStagePeriodResponse, now: number): number {
  if (period.leftAt) return period.durationSeconds;
  return Math.max(0, Math.floor((now - Date.parse(period.enteredAt)) / 1000));
}

export function stageTimeLabel(rma: Pick<RmaResponse, 'status' | 'stagePeriods'>, now: number): string | null {
  if (CLOSED_RMA_STATUSES.includes(rma.status)) return null;
  const current = currentStagePeriod(rma);
  return current ? `há ${formatDuration(stageElapsedSeconds(current, now))} nesta etapa` : null;
}
