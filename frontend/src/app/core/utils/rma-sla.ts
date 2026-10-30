import type { RmaResponse, RmaSlaResponse, RmaSlaStatus } from '../models';

export type SlaFilterValue = 'all' | RmaSlaStatus;
export type AssigneeFilterValue = 'all' | 'unassigned' | number;

export const SLA_LABELS: Record<RmaSlaStatus, string> = {
  NORMAL: 'No prazo', WARNING: 'Atenção', OVERDUE: 'Atrasado', CLOSED: 'Encerrado'
};

export function slaStatus(sla: RmaSlaResponse, now: number): RmaSlaStatus {
  if (sla.status === 'CLOSED' || !sla.dueAt || !sla.warningAt) {
    return sla.status;
  }
  if (now >= Date.parse(sla.dueAt)) {
    return 'OVERDUE';
  }
  return now >= Date.parse(sla.warningAt) ? 'WARNING' : 'NORMAL';
}

export function elapsedSlaSeconds(sla: RmaSlaResponse, now: number): number {
  return sla.status === 'CLOSED' ? sla.elapsedSeconds : Math.max(0, Math.floor((now - Date.parse(sla.startedAt)) / 1000));
}

export function slaDuration(seconds: number): string {
  const minutes = Math.floor(Math.max(0, seconds) / 60);
  return minutes < 60 ? `${minutes} min` : `${Math.floor(minutes / 60)}h ${minutes % 60}min`;
}

export function filterKanbanRmas(rmas: readonly RmaResponse[], assignee: AssigneeFilterValue, sla: SlaFilterValue, now: number): RmaResponse[] {
  return rmas.filter((rma) => (assignee === 'all' || (assignee === 'unassigned' ? rma.assigneeId === null : rma.assigneeId === assignee))
    && (sla === 'all' || slaStatus(rma.sla, now) === sla));
}
