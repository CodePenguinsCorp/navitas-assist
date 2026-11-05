import { NotificationEventType, NotificationSeverity } from '../models';

const APP_TIME_ZONE = 'America/Sao_Paulo';

export const NOTIFICATION_EVENT_LABELS: Record<NotificationEventType, string> = {
  RMA_CREATED: 'Novo RMA',
  RMA_ASSIGNED: 'Nova atribuição',
  SLA_WARNING: 'SLA perto do limite',
  SLA_OVERDUE: 'SLA vencido',
  RMA_BLOCKED: 'Bloqueio',
  WIP_LIMIT_EXCEEDED: 'Limite de WIP',
  PART_PENDING: 'Peça pendente',
  INTERNAL_APPROVAL_REQUIRED: 'Aprovação interna',
  TEST_FAILED: 'Falha de teste',
  RECURRENCE_DETECTED: 'Recorrência'
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

/** Splits an internal action path such as "/rmas?rma=7" into router commands and query params; external URLs are rejected. */
export function internalRoute(actionPath: string | null): { path: string; queryParams: Record<string, string> } | null {
  if (!actionPath || !actionPath.startsWith('/') || actionPath.startsWith('//')) {
    return null;
  }

  const [path, query = ''] = actionPath.split('?', 2);
  return { path, queryParams: Object.fromEntries(new URLSearchParams(query).entries()) };
}
