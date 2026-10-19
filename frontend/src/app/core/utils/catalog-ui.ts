export function normalizeOptionalText(value: string | null | undefined): string | null {
  const trimmed = value?.trim() ?? '';
  return trimmed ? trimmed : null;
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

export function formatDateTime(value: string | null): string {
  if (!value) {
    return 'Não informado';
  }

  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short'
  }).format(new Date(value));
}
