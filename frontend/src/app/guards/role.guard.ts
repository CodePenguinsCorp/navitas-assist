import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { map } from 'rxjs';
import { UserRole } from '../core/models';
import { AuthService } from '../core/services/auth.service';

export const roleGuard: CanActivateFn = (route) => {
  const authService = inject(AuthService);
  const router = inject(Router);
  const roles = (route.data?.['roles'] as UserRole[] | undefined) ?? [];

  return authService.restoreSession().pipe(
    map(() => roles.length === 0 || authService.hasAnyRole(roles)
      ? true
      : router.createUrlTree(['/dashboard']))
  );
};
