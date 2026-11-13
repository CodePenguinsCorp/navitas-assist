import { CLOSED_RMA_STATUSES } from '../mock-data';
import { RmaDeadlineStatus, RmaResponse } from '../models';
import type { CustomSelectOption } from '../../shared/form-controls/custom-select/custom-select.component';
import { businessDateInputValue } from './date';

export type DeadlineStatus = RmaDeadlineStatus;
export type DeadlineFilterValue = 'all' | Exclude<RmaDeadlineStatus, 'CLOSED'>;

type DeadlineSource = Pick<RmaResponse, 'status' | 'dueDate' | 'deadline'>;

export const DEADLINE_LABELS: Record<DeadlineStatus, string> = {
  OVERDUE: 'Atrasado',
  DUE_SOON: 'Perto do limite',
  ON_TRACK: 'No prazo',
  NO_DUE_DATE: 'Sem data limite',
  CLOSED: 'Encerrado'
};

export const DEADLINE_FILTER_OPTIONS: ReadonlyArray<CustomSelectOption<DeadlineFilterValue>> = [
  { value: 'all', label: 'Todos' },
  { value: 'OVERDUE', label: 'Atrasados' },
  { value: 'DUE_SOON', label: 'Perto do limite' },
  { value: 'ON_TRACK', label: 'No prazo' },
  { value: 'NO_DUE_DATE', label: 'Sem data limite' }
];

/** "Today" is always the civil date in São Paulo. */
export function businessToday(now: number): string {
  return businessDateInputValue(new Date(now));
}

/** Civil days from `today` to `date` (both YYYY-MM-DD), without local time zone conversion. */
function daysBetween(today: string, date: string): number {
  return Math.round((civilDay(date) - civilDay(today)) / 86_400_000);
}

function civilDay(value: string): number {
  const [year, month, day] = value.split('-').map(Number);
  return Date.UTC(year, month - 1, day);
}

/** Recomputed on every clock tick from the due date and `dueSoonFrom`, so the day turn needs no reload. */
export function deadlineStatus(rma: DeadlineSource, today: string): DeadlineStatus {
  if (CLOSED_RMA_STATUSES.includes(rma.status)) return 'CLOSED';
  if (!rma.dueDate) return 'NO_DUE_DATE';
  if (today > rma.dueDate) return 'OVERDUE';
  const dueSoonFrom = rma.deadline?.dueSoonFrom ?? rma.dueDate;
  return today >= dueSoonFrom ? 'DUE_SOON' : 'ON_TRACK';
}

export function deadlineCardLabel(rma: DeadlineSource, today: string): string | null {
  const status = deadlineStatus(rma, today);
  if ((status !== 'OVERDUE' && status !== 'DUE_SOON') || !rma.dueDate) return null;
  const days = daysBetween(today, rma.dueDate);
  if (status === 'OVERDUE') return `Atrasado há ${-days} ${-days === 1 ? 'dia' : 'dias'}`;
  if (days === 0) return 'Vence hoje';
  return `Vence em ${days} ${days === 1 ? 'dia' : 'dias'}`;
}

export function deadlineDetailLabel(rma: DeadlineSource, today: string): string {
  return deadlineCardLabel(rma, today) ?? DEADLINE_LABELS[deadlineStatus(rma, today)];
}
