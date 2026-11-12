import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, throwError } from 'rxjs';
import { AuthService } from '../services/auth.service';

/**
 * 401 com sessão ativa (exceto o próprio login): a sessão expirou no servidor, então volta ao login com aviso.
 * 403 fora de `/api/auth/*`: as permissões podem ter mudado, então relê a sessão; menus e botões seguem os signals.
 */
export const authErrorInterceptor: HttpInterceptorFn = (request, next) => {
  const auth = inject(AuthService);
  const router = inject(Router);

  return next(request).pipe(
    catchError((error: unknown) => {
      if (error instanceof HttpErrorResponse) {
        if (error.status === 401 && !request.url.startsWith('/api/auth/login') && auth.currentUser()) {
          const redirectTo = router.url;
          auth.clearSession();
          void router.navigate(['/login'], { queryParams: { redirectTo, reason: 'expired' } });
        } else if (error.status === 403 && !request.url.startsWith('/api/auth/')) {
          auth.refreshSession().subscribe();
        }
      }
      return throwError(() => error);
    })
  );
};
