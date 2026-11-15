export { formatBusinessDateTime as formatDateTime } from './date';

export function normalizeOptionalText(value: string | null | undefined): string | null {
  const trimmed = value?.trim() ?? '';
  return trimmed ? trimmed : null;
}

export type PresenceFilter = 'all' | 'with' | 'without';

export const PRESENCE_FILTER_OPTIONS: ReadonlyArray<{ value: PresenceFilter; label: string }> = [
  { value: 'all', label: 'Todos' },
  { value: 'with', label: 'Com' },
  { value: 'without', label: 'Sem' }
];

/** Shown when the request never reached the server (offline, server down, DNS): the browser only says "Failed to fetch". */
export const CONNECTION_ERROR_MESSAGE = 'Sem conexão com o servidor. Verifique a internet e tente novamente.';

export function extractHttpErrorMessage(error: unknown, fallback: string): string {
  if (typeof error === 'object' && error !== null) {
    if ((error as { status?: unknown }).status === 0) {
      return CONNECTION_ERROR_MESSAGE;
    }
    const maybeHttpError = error as {
      error?: {
        message?: unknown;
        details?: unknown;
      };
    };

    const message = typeof maybeHttpError.error?.message === 'string' ? maybeHttpError.error.message.trim() : '';
    const details = Array.isArray(maybeHttpError.error?.details)
      ? maybeHttpError.error.details.filter((detail): detail is string => typeof detail === 'string' && detail.trim().length > 0)
      : [];

    if (details.length > 0 && message) {
      return `${message}: ${details.join(' | ')}`;
    }

    if (message) {
      return message;
    }
  }

  return fallback;
}

export function includesQuery(
  query: string,
  ...values: Array<string | number | null | undefined>
): boolean {
  const normalizedQuery = query.trim().toLocaleLowerCase('pt-BR');

  if (!normalizedQuery) {
    return true;
  }

  return values.some((value) =>
    String(value ?? '')
      .toLocaleLowerCase('pt-BR')
      .includes(normalizedQuery)
  );
}
