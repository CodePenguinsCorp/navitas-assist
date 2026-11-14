import { RmaDeadlineStatus, RmaResponse, RmaStatus } from '../models';
import {
  DEADLINE_FILTER_OPTIONS,
  DEADLINE_LABELS,
  businessToday,
  deadlineCardLabel,
  deadlineDetailLabel,
  deadlineStatus
} from './rma-deadline';

const TODAY = '2026-11-13';

function minusDays(date: string, days: number): string {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d - days)).toISOString().slice(0, 10);
}

function rma(dueDate: string | null, status: RmaStatus = 'IN_REPAIR', backend: RmaDeadlineStatus = 'ON_TRACK'): Pick<RmaResponse, 'status' | 'dueDate' | 'deadline'> {
  return {
    status,
    dueDate,
    deadline: { status: dueDate ? backend : 'NO_DUE_DATE', dueSoonFrom: dueDate ? minusDays(dueDate, 7) : null }
  };
}

describe('rma deadline', () => {
  it('classifies the window boundaries and labels the card', () => {
    expect(deadlineStatus(rma('2026-11-21'), TODAY)).toBe('ON_TRACK');
    expect(deadlineCardLabel(rma('2026-11-21'), TODAY)).toBeNull();
    expect(deadlineStatus(rma('2026-11-20'), TODAY)).toBe('DUE_SOON');
    expect(deadlineCardLabel(rma('2026-11-20'), TODAY)).toBe('Vence em 7 dias');
    expect(deadlineCardLabel(rma('2026-11-14'), TODAY)).toBe('Vence em 1 dia');
    expect(deadlineCardLabel(rma('2026-11-13'), TODAY)).toBe('Vence hoje');
    expect(deadlineStatus(rma('2026-11-12'), TODAY)).toBe('OVERDUE');
    expect(deadlineCardLabel(rma('2026-11-12'), TODAY)).toBe('Atrasado há 1 dia');
    expect(deadlineCardLabel(rma('2026-11-10'), TODAY)).toBe('Atrasado há 3 dias');
  });

  it('never flags closed ordens de serviço or ordens de serviço without a due date', () => {
    const closed = rma('2026-11-01', 'COMPLETED', 'CLOSED');
    expect(deadlineStatus(closed, TODAY)).toBe('CLOSED');
    expect(deadlineCardLabel(closed, TODAY)).toBeNull();
    expect(deadlineStatus(rma(null), TODAY)).toBe('NO_DUE_DATE');
    expect(deadlineCardLabel(rma(null), TODAY)).toBeNull();
  });

  it('uses the card text in detail when late or close, and the status label otherwise', () => {
    expect(deadlineDetailLabel(rma('2026-11-11'), TODAY)).toBe('Atrasado há 2 dias');
    expect(deadlineDetailLabel(rma('2026-11-30'), TODAY)).toBe('No prazo');
    expect(deadlineDetailLabel(rma(null), TODAY)).toBe('Sem data limite');
    expect(deadlineDetailLabel(rma('2026-11-01', 'RETURNED', 'CLOSED'), TODAY)).toBe('Encerrada');
  });

  it('turns overdue at São Paulo midnight', () => {
    expect(businessToday(Date.parse('2026-11-14T02:59:59Z'))).toBe('2026-11-13');
    expect(businessToday(Date.parse('2026-11-14T03:00:00Z'))).toBe('2026-11-14');
    const dueToday = rma('2026-11-13');
    expect(deadlineCardLabel(dueToday, businessToday(Date.parse('2026-11-14T02:59:59Z')))).toBe('Vence hoje');
    expect(deadlineCardLabel(dueToday, businessToday(Date.parse('2026-11-14T03:00:00Z')))).toBe('Atrasado há 1 dia');
  });

  it('offers the five Prazo options and never says vencido', () => {
    expect(DEADLINE_FILTER_OPTIONS.map((option) => option.label)).toEqual(['Todos', 'Atrasadas', 'Perto do limite', 'No prazo', 'Sem data limite']);
    expect(DEADLINE_FILTER_OPTIONS.map((option) => option.value)).toEqual(['all', 'OVERDUE', 'DUE_SOON', 'ON_TRACK', 'NO_DUE_DATE']);
    const texts = [
      ...Object.values(DEADLINE_LABELS),
      ...['2026-11-01', '2026-11-12', '2026-11-13', '2026-11-15', '2026-12-30'].flatMap((date) => [
        deadlineCardLabel(rma(date), TODAY) ?? '', deadlineDetailLabel(rma(date), TODAY)
      ])
    ];
    expect(texts.some((text) => /vencid/i.test(text))).toBe(false);
  });
});
