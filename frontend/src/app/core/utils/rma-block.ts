import { RmaBlockResponse } from '../models';
import { formatDuration } from './duration';

const BLOCK_DATE_FORMAT = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short', timeZone: 'America/Sao_Paulo' });

export function blockDateTime(value: string): string {
  return BLOCK_DATE_FORMAT.format(new Date(value));
}

export function blockDuration(block: Pick<RmaBlockResponse, 'blockedAt'> & { resolvedAt?: string | null }, now: number): string {
  return formatDuration(Math.max(0, ((block.resolvedAt ? Date.parse(block.resolvedAt) : now) - Date.parse(block.blockedAt)) / 1000));
}
