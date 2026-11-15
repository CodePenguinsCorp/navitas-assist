import { CLOSED_RMA_STATUSES } from '../mock-data';
import { RmaResponse, RmaStagePeriodResponse, RmaStatus } from '../models';
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

/** "há 2 d 4 h nesta etapa" a partir do instante em que a OS entrou na etapa atual (`currentStageEnteredAt` do card). */
export function stageTimeLabel(rma: { status: RmaStatus; currentStageEnteredAt: string }, now: number): string | null {
  if (CLOSED_RMA_STATUSES.includes(rma.status)) return null;
  const seconds = Math.max(0, Math.floor((now - Date.parse(rma.currentStageEnteredAt)) / 1000));
  return `há ${formatDuration(seconds)} nesta etapa`;
}
