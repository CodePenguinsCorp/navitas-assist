import { NOTIFICATION_EVENT_LABELS, followNotification, formatNotificationDateTime, formatTimeAgo, groupNotificationsByDay, internalRoute, notificationHeadline, newRmaMessagePriority, severityClass } from './notification-ui';

describe('Notification UI utilities', () => {
  it('maps internal action paths to router navigation and rejects external links', () => {
    expect(internalRoute('/rmas?rma=7')).toEqual({ path: '/rmas', queryParams: { rma: '7' } });
    expect(internalRoute('/notificacoes')).toEqual({ path: '/notificacoes', queryParams: {} });
    expect(internalRoute('https://exemplo.com/rmas')).toBeNull();
    expect(internalRoute('//exemplo.com')).toBeNull();
    expect(internalRoute(null)).toBeNull();
  });

  it('lista apenas os cinco eventos com produtor', () => {
    expect(Object.keys(NOTIFICATION_EVENT_LABELS)).toEqual(['RMA_CREATED', 'RMA_ASSIGNED', 'RMA_BLOCKED', 'PART_PENDING', 'TEST_FAILED']);
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

  it('builds a short headline that names the OS code once', () => {
    const code = 'OS-2026-000004';
    expect(notificationHeadline({ title: `Impedimento na OS ${code}`, rmaCode: code })).toBe(`Impedimento · ${code}`);
    expect(notificationHeadline({ title: `Nova OS ${code}`, rmaCode: code })).toBe(`Nova OS · ${code}`);
    expect(notificationHeadline({ title: `OS ${code} atribuída a Ana`, rmaCode: code })).toBe(`OS atribuída a Ana · ${code}`);
    expect(notificationHeadline({ title: `${code} atribuída`, rmaCode: code })).toBe(`${code} atribuída`);
    expect(notificationHeadline({ title: 'Peça pendente', rmaCode: code })).toBe(`Peça pendente · ${code}`);
    expect(notificationHeadline({ title: 'Aviso geral', rmaCode: null })).toBe('Aviso geral');
  });

  it('formats the relative age', () => {
    const now = Date.parse('2026-10-24T12:00:00Z');
    expect(formatTimeAgo('2026-10-24T12:00:30Z', now)).toBe('agora');
    expect(formatTimeAgo('2026-10-24T11:55:00Z', now)).toBe('há 5 min');
    expect(formatTimeAgo('2026-10-24T09:00:00Z', now)).toBe('há 3 h');
    expect(formatTimeAgo('2026-10-23T11:00:00Z', now)).toBe('há 1 dia');
    expect(formatTimeAgo('2026-10-20T12:00:00Z', now)).toBe('há 4 dias');
    expect(formatTimeAgo(null, now)).toBe('');
  });

  describe('new RMA priority', () => {
    it('keeps the current OS author outside the legacy priority clause', () => {
      expect(newRmaMessagePriority({ eventType: 'RMA_CREATED', message: 'Cliente · prioridade alta. Aberta por Admin · prioridade baixa.' }))
        .toEqual({ before: 'Cliente · ', priority: 'HIGH', after: '. Aberta por Admin · prioridade baixa.' });
    });
    it('prefers the captured priority over message text and leaves the input unchanged', () => {
      const notification = { eventType: 'RMA_CREATED' as const, rmaPriority: 'HIGH' as const, message: 'Cliente · Produto · prioridade baixa. Aberto por prioridade low.' };
      expect(newRmaMessagePriority(notification)).toEqual({ before: 'Cliente · Produto · ', priority: 'HIGH', after: '. Aberto por prioridade low.' });
      expect(notification.message).toBe('Cliente · Produto · prioridade baixa. Aberto por prioridade low.');
    });

    it('keeps the entire message when the structured priority has no matching text clause', () => {
      expect(newRmaMessagePriority({ eventType: 'RMA_CREATED', rmaPriority: 'MEDIUM', message: '<b>Novo formato</b>. Aberto por prioridade high.' }))
        .toEqual({ before: '<b>Novo formato</b>. Aberto por prioridade high. · ', priority: 'MEDIUM', after: '' });
    });

    it.each([['baixa', 'LOW'], ['Medium', 'MEDIUM'], ['ALTA', 'HIGH']])('supports legacy %s without a structured snapshot', (label, priority) => {
      expect(newRmaMessagePriority({ eventType: 'RMA_CREATED', message: `Cliente · prioridade ${label}. Aberto por Admin.` }))
        .toEqual({ before: 'Cliente · ', priority, after: '. Aberto por Admin.' });
    });

    it('does not infer priority from an author name or another event type', () => {
      expect(newRmaMessagePriority({ eventType: 'RMA_CREATED', message: 'Cliente. Aberto por prioridade high.' })).toBeNull();
      expect(newRmaMessagePriority({ eventType: 'RMA_ASSIGNED', rmaPriority: 'HIGH', message: 'Cliente · prioridade high.' })).toBeNull();
    });
  });

  describe('followNotification', () => {
    const router = () => ({ navigate: vi.fn(() => Promise.resolve(true)) });

    it('follows an internal link', () => {
      const target = router();
      expect(followNotification({ actionPath: '/rmas?rma=7' }, target)).toBe(true);
      expect(target.navigate).toHaveBeenCalledWith(['/rmas'], { queryParams: { rma: '7' } });
    });

    it('never follows external or missing links', () => {
      const target = router();
      expect(followNotification({ actionPath: 'https://exemplo.com' }, target)).toBe(false);
      expect(followNotification({ actionPath: '//exemplo.com' }, target)).toBe(false);
      expect(followNotification({ actionPath: null }, target)).toBe(false);
      expect(target.navigate).not.toHaveBeenCalled();
    });
  });
});
