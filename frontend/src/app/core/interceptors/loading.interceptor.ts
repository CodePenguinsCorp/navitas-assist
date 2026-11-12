import { HttpContextToken, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { defer, finalize } from 'rxjs';
import { LoadingService } from '../services/loading.service';

export const SKIP_GLOBAL_LOADING = new HttpContextToken<boolean>(() => false);

export const loadingInterceptor: HttpInterceptorFn = (request, next) => {
  // Login, logout and the CSRF token already give their own feedback on the screen that triggers them.
  if (request.context.get(SKIP_GLOBAL_LOADING) || request.url.startsWith('/api/auth/')) return next(request);

  const loading = inject(LoadingService);
  return defer(() => {
    loading.start();
    return next(request);
  }).pipe(finalize(() => loading.finish()));
};
