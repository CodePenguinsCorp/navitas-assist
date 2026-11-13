import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { map } from 'rxjs';
import { allowsPermissions, firstAllowedRoute } from '../core/navigation';
import { Permission } from '../core/permissions';
import { AuthService } from '../core/services/auth.service';
import { PermissionService } from '../core/services/permission.service';

/** Exige todas as permissões de `route.data.permissions`; na falta, leva à primeira rota permitida do menu. */
export const permissionGuard: CanActivateFn = (route) => {
  const authService = inject(AuthService);
  const permissions = inject(PermissionService);
  const router = inject(Router);
  const required = (route.data?.['permissions'] as Permission[] | undefined) ?? [];

  const alternatives = (route.data?.['alternativePermissions'] as Permission[] | undefined) ?? [];

  return authService.restoreSession().pipe(
    map(() => allowsPermissions(permissions, required, alternatives)
      ? true
      : router.parseUrl(firstAllowedRoute(permissions)))
  );
};
