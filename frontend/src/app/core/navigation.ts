import { NAV_GROUPS } from './mock-data';
import { PermissionService } from './services/permission.service';

const FALLBACK_ROUTE = '/notificacoes';

/**
 * Primeira rota do menu cujas permissões (não vazias) estão todas concedidas. Itens sem permissão, como
 * Notificações, não contam; sem nenhuma rota permitida, vai para Notificações, que só exige login (evita laço).
 */
export function firstAllowedRoute(permissions: PermissionService): string {
  const item = NAV_GROUPS
    .flatMap((group) => group.items)
    .find((candidate) => candidate.permissions.length > 0 && permissions.hasAll(candidate.permissions));
  return item?.route ?? FALLBACK_ROUTE;
}
