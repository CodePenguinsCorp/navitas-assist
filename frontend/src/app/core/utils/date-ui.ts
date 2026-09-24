export const APP_TIME_ZONE = 'America/Sao_Paulo';

export function formatDate(value: string | null): string {
  if (!value) {
    return 'Não informado';
  }

  // Datas civis (LocalDate da API) não representam um instante nem mudam com o fuso.
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return value.split('-').reverse().join('/');
  }

  return new Intl.DateTimeFormat('pt-BR', { timeZone: APP_TIME_ZONE }).format(new Date(value));
}

export function formatDateTime(value: string | null): string {
  if (!value) {
    return 'Não informado';
  }

  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short',
    timeZone: APP_TIME_ZONE
  }).format(new Date(value));
}

export function todayInputValue(now = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    timeZone: APP_TIME_ZONE
  }).formatToParts(now);
  const part = (type: string) => parts.find((item) => item.type === type)!.value;
  return `${part('year')}-${part('month')}-${part('day')}`;
}
