import { of } from 'rxjs';
import { NotificationResponse } from '../models';
import { NOTIFICATION_EVENT_LABELS, formatNotificationDateTime, groupNotificationsByDay, internalRoute, openNotification, severityClass } from './notification-ui';

describe('Notification UI utilities', () => {
  it('maps internal action paths to router navigation and rejects external links', () => {
    expect(internalRoute('/rmas?rma=7')).toEqual({ path: '/rmas', queryParams: { rma: '7' } });
    expect(internalRoute('/notificacoes')).toEqual({ path: '/notificacoes', queryParams: {} });
    expect(internalRoute('https://exemplo.com/rmas')).toBeNull();
    expect(internalRoute('//exemplo.com')).toBeNull();
    expect(internalRoute(null)).toBeNull();
  });

  it('has no stage SLA alerts and never labels anything as vencido', () => {
    expect(Object.keys(NOTIFICATION_EVENT_LABELS).some((type) => type.startsWith('SLA_'))).toBe(false);
    expect(Object.values(NOTIFICATION_EVENT_LABELS).some((label) => /SLA|vencid/i.test(label))).toBe(false);
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

  it('groups notifications by local day in the given order, labelling today and yesterday', () => {
    const at = (day: number, hour: number) => ({ createdAt: new Date(2026, 9, day, hour).toISOString() });
    const items = [at(24, 10), at(24, 8), at(23, 22), at(20, 9)];
    const groups = groupNotificationsByDay(items, new Date(2026, 9, 24, 23, 59).getTime());
    expect(groups.map((group) => group.label)).toEqual(['Hoje', 'Ontem', '20/10/2026']);
    expect(groups[0].items).toEqual([items[0], items[1]]);
    expect(groupNotificationsByDay([], Date.now())).toEqual([]);
  });

  describe('openNotification', () => {
    const base = { id: 7, read: false, actionPath: '/rmas?rma=7' } as NotificationResponse;
    const setup = () => {
      const service = { markRead: vi.fn(() => of(base)), refreshSummary: vi.fn(() => of(0)) };
      const router = { navigate: vi.fn(() => Promise.resolve(true)) };
      return { service, router };
    };

    it('marks an unread notification as read, refreshes the summary and follows its internal link', () => {
      const { service, router } = setup();
      openNotification(base, service, router);
      expect(service.markRead).toHaveBeenCalledWith(7);
      expect(service.refreshSummary).toHaveBeenCalledOnce();
      expect(router.navigate).toHaveBeenCalledWith(['/rmas'], { queryParams: { rma: '7' } });
    });

    it('does not mark again when already read and never follows external links', () => {
      const { service, router } = setup();
      openNotification({ ...base, read: true, actionPath: 'https://exemplo.com' }, service, router);
      expect(service.markRead).not.toHaveBeenCalled();
      expect(router.navigate).not.toHaveBeenCalled();
    });
  });
});
