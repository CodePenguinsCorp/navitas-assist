import { NotificationEventType, NotificationResponse, NotificationSeverity, RmaPriority } from '../models';

const APP_TIME_ZONE = 'America/Sao_Paulo';

const NEW_RMA_PRIORITY_VALUES: Record<string, RmaPriority> = {
  baixa: 'LOW', low: 'LOW', média: 'MEDIUM', medium: 'MEDIUM', alta: 'HIGH', high: 'HIGH'
};

/** Prefer the immutable snapshot; parse legacy rows only when no structured priority exists. */
export function newRmaMessagePriority(notification: Pick<NotificationResponse, 'eventType' | 'message' | 'rmaPriority'>): { before: string; priority: RmaPriority; after: string } | null {
  if (notification.eventType !== 'RMA_CREATED') return null;
  const actorStart = notification.message.search(/\. Abert[oa] por /);
  const context = actorStart < 0 ? notification.message : notification.message.slice(0, actorStart);
  const match = [...context.matchAll(/(?:^| · )(prioridade\s+(baixa|média|alta|low|medium|high))(?=[.;]|$)/gi)].at(-1);
  if (!match) return notification.rmaPriority ? { before: `${notification.message} · `, priority: notification.rmaPriority, after: '' } : null;
  const end = match.index + match[0].length;
  return { before: notification.message.slice(0, end - match[1].length), priority: notification.rmaPriority ?? NEW_RMA_PRIORITY_VALUES[match[2].toLowerCase()], after: notification.message.slice(end) };
}

export const NOTIFICATION_EVENT_LABELS: Record<NotificationEventType, string> = {
  RMA_CREATED: 'Nova OS',
  RMA_ASSIGNED: 'Nova atribuição',
  RMA_BLOCKED: 'Bloqueio',
  PART_PENDING: 'Peça pendente',
  TEST_FAILED: 'Falha de teste'
};

export const NOTIFICATION_SEVERITY_LABELS: Record<NotificationSeverity, string> = {
  INFO: 'Informativo',
  WARNING: 'Atenção',
  CRITICAL: 'Crítico'
};

export const NOTIFICATION_SEVERITIES: NotificationSeverity[] = ['INFO', 'WARNING', 'CRITICAL'];

export const SNOOZE_OPTIONS: ReadonlyArray<{ value: number; label: string }> = [
  { value: 60, label: '1 hora' },
  { value: 240, label: '4 horas' },
  { value: 1440, label: '1 dia' }
];

export function severityClass(severity: NotificationSeverity): string {
  switch (severity) {
    case 'CRITICAL':
      return 'priority-high';
    case 'WARNING':
      return 'warranty-alert';
    default:
      return 'priority-low';
  }
}

/** Formats API instants in the business time zone, regardless of the browser zone. */
export function formatNotificationDateTime(value: string | null): string {
  if (!value) {
    return 'Não informado';
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return 'Não informado';
  }

  return new Intl.DateTimeFormat('pt-BR', { timeZone: APP_TIME_ZONE, dateStyle: 'short', timeStyle: 'short' }).format(date);
}

/**
 * Short headline for the detail dialog: drops the "na OS <código>" wording the server puts in the title
 * and names the OS code once, after a middle dot.
 */
export function notificationHeadline(notification: Pick<NotificationResponse, 'title' | 'rmaCode'>): string {
  const { title, rmaCode: code } = notification;
  if (!code) return title;
  if (!title.includes(code)) return `${title} · ${code}`;
  const short = title.replace(` na OS ${code}`, '').replace(`OS ${code}`, 'OS');
  return short.includes(code) ? title : `${short.replace(/\s+/g, ' ').trim()} · ${code}`;
}

/** Relative age such as "há 5 min"; instants slightly in the future read as "agora". */
export function formatTimeAgo(value: string | null, now: number): string {
  const time = value ? Date.parse(value) : NaN;
  if (Number.isNaN(time)) return '';
  const minutes = Math.floor((now - time) / 60_000);
  if (minutes < 1) return 'agora';
  if (minutes < 60) return `há ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `há ${hours} h`;
  const days = Math.floor(hours / 24);
  return days === 1 ? 'há 1 dia' : `há ${days} dias`;
}

/** Time of day only (the inbox groups rows by day), in the business time zone. */
export function formatNotificationTime(value: string | null): string {
  const date = value ? new Date(value) : null;
  if (!date || Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('pt-BR', { timeZone: APP_TIME_ZONE, timeStyle: 'short' }).format(date);
}

/** Splits an internal action path such as "/rmas?rma=7" into router commands and query params; external URLs are rejected. */
export function internalRoute(actionPath: string | null): { path: string; queryParams: Record<string, string> } | null {
  if (!actionPath || !actionPath.startsWith('/') || actionPath.startsWith('//')) {
    return null;
  }

  const [path, query = ''] = actionPath.split('?', 2);
  return { path, queryParams: Object.fromEntries(new URLSearchParams(query).entries()) };
}

/** Groups rows by local calendar day, keeping the given order; today and yesterday get relative labels. */
export function groupNotificationsByDay<T extends { createdAt: string }>(items: readonly T[], now: number): Array<{ label: string; items: T[] }> {
  const today = new Date(now); today.setHours(0, 0, 0, 0);
  const yesterday = new Date(today); yesterday.setDate(yesterday.getDate() - 1);
  const groups = new Map<string, { label: string; items: T[] }>();
  for (const item of items) {
    const day = new Date(item.createdAt); day.setHours(0, 0, 0, 0);
    const key = String(day.getTime());
    const label = day.getTime() === today.getTime() ? 'Hoje' : day.getTime() === yesterday.getTime() ? 'Ontem' : day.toLocaleDateString('pt-BR');
    if (!groups.has(key)) groups.set(key, { label, items: [] });
    groups.get(key)!.items.push(item);
  }
  return [...groups.values()];
}

/** Follows the notification's internal link, if any; external or malformed paths are never followed. */
export function followNotification(
  notification: Pick<NotificationResponse, 'actionPath'>,
  router: { navigate(commands: unknown[], extras: { queryParams: Record<string, string> }): Promise<boolean> }
): boolean {
  const route = internalRoute(notification.actionPath);
  if (!route) return false;
  void router.navigate([route.path], { queryParams: route.queryParams });
  return true;
}
