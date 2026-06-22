import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { UserRole } from '../core/models';
import { AuthService } from '../core/services/auth.service';

export const roleGuard: CanActivateFn = (route) => {
  const authService = inject(AuthService);
  const router = inject(Router);
  const roles = (route.data?.['roles'] as UserRole[] | undefined) ?? [];

  if (roles.length === 0 || authService.hasAnyRole(roles)) {
    return true;
  }

  return router.createUrlTree(['/dashboard']);
};
