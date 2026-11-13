import { Permission } from './permissions';
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
    .find((candidate) => candidate.permissions.length > 0 && allowsPermissions(permissions, candidate.permissions, candidate.alternativePermissions));
  return item?.route ?? FALLBACK_ROUTE;
}

/** Permissoes obrigatorias OU uma permissao alternativa explicita. */
export function allowsPermissions(service: PermissionService, required: readonly Permission[], alternatives: readonly Permission[] = []): boolean {
  return service.hasAll(required) || service.hasAny(alternatives);
}
