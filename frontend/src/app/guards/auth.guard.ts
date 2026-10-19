import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { map } from 'rxjs';
import { AuthService } from '../core/services/auth.service';

export const authGuard: CanActivateFn = (_, state) => {
  const authService = inject(AuthService);
  const router = inject(Router);

  return authService.restoreSession().pipe(
    map((session) => session ? true : router.createUrlTree(['/login'], {
      queryParams: {
        redirectTo: state.url
      }
    }))
  );
};
