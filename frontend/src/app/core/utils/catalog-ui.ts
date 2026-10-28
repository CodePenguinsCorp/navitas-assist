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

export function matchesPresence(value: string | null | undefined, filter: PresenceFilter): boolean {
  if (filter === 'all') {
    return true;
  }

  const hasValue = Boolean(normalizeOptionalText(value));
  return filter === 'with' ? hasValue : !hasValue;
}

export function extractHttpErrorMessage(error: unknown, fallback: string): string {
  if (typeof error === 'object' && error !== null) {
    const maybeHttpError = error as {
      error?: {
        message?: string;
        details?: string[];
      };
    };

    const message = maybeHttpError.error?.message?.trim();
    const details = maybeHttpError.error?.details?.filter(Boolean) ?? [];

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

export function countDistinct(values: Array<string | null | undefined>): number {
  return new Set(
    values
      .map((value) => normalizeOptionalText(value)?.toLocaleLowerCase('pt-BR'))
      .filter((value): value is string => Boolean(value))
  ).size;
}
