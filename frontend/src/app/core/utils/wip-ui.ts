import { WipLimit } from '../models';
import { extractHttpErrorMessage } from './catalog-ui';

export function wipLabel(limit: WipLimit): string {
  if (limit.maxItems === null) return 'WIP global: ' + limit.currentCount + ' · Sem limite';
  const state = limit.currentCount > limit.maxItems ? 'Excedido' : limit.currentCount === limit.maxItems ? 'Atingido'
    : limit.currentCount >= Math.ceil(limit.maxItems * 0.8) ? 'Próximo' : 'Normal';
  return 'WIP global: ' + limit.currentCount + '/' + limit.maxItems + ' · ' + state + (limit.blocking ? ' · Bloqueante' : ' · Alerta');
}

export function wipErrorMessage(error: unknown, fallback: string): string {
  const message = extractHttpErrorMessage(error, fallback);
  return message.startsWith('WIP limit reached') ? 'Limite de WIP atingido. Atualize as contagens ou solicite uma exceção justificada a um administrador.' : message;
}
