import { businessDateInputValue, formatBusinessDateTime, formatDateOnly, todayInputValue } from './date';

describe('date utilities', () => {
  it('formats civil dates without converting them through UTC', () => {
    expect(formatDateOnly('2026-10-20')).toBe('20/10/2026');
    expect(formatDateOnly('2026-02-30')).toBe('N\u00e3o informado');
  });

  it('calculates today in America/Sao_Paulo around the UTC day boundary', () => {
    expect(todayInputValue(new Date('2026-10-20T02:30:00Z'))).toBe('2026-10-19');
    expect(todayInputValue(new Date('2026-10-20T03:30:00Z'))).toBe('2026-10-20');
  });

  it('converts instants to the business date used by filters', () => {
    expect(businessDateInputValue(new Date('2026-10-20T02:59:00Z'))).toBe('2026-10-19');
    expect(businessDateInputValue(new Date('invalid'))).toBe('');
  });

  it('formats instants as date and time in America/Sao_Paulo', () => {
    expect(formatBusinessDateTime('2026-10-20T02:30:00Z')).toBe('19/10/2026, 23:30');
    expect(formatBusinessDateTime(null)).toBe('Não informado');
    expect(formatBusinessDateTime('invalid', '-')).toBe('-');
  });
});
