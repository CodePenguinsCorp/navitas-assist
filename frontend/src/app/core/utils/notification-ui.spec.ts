import { formatNotificationDateTime, internalRoute, severityClass } from './notification-ui';

describe('Notification UI utilities', () => {
  it('maps internal action paths to router navigation and rejects external links', () => {
    expect(internalRoute('/rmas?rma=7')).toEqual({ path: '/rmas', queryParams: { rma: '7' } });
    expect(internalRoute('/notificacoes')).toEqual({ path: '/notificacoes', queryParams: {} });
    expect(internalRoute('https://exemplo.com/rmas')).toBeNull();
    expect(internalRoute('//exemplo.com')).toBeNull();
    expect(internalRoute(null)).toBeNull();
  });

  it('formats timestamps in America/Sao_Paulo', () => {
    expect(formatNotificationDateTime('2026-10-24T02:30:00Z')).toBe('23/10/2026, 23:30');
    expect(formatNotificationDateTime(null)).toBe('Não informado');
  });

  it('maps severities to chip tones', () => {
    expect(severityClass('CRITICAL')).toBe('priority-high');
    expect(severityClass('WARNING')).toBe('warranty-alert');
    expect(severityClass('INFO')).toBe('priority-low');
  });
});
