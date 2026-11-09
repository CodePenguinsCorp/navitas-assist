import { HttpContextToken, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { defer, finalize } from 'rxjs';
import { LoadingService } from '../services/loading.service';

export const SKIP_GLOBAL_LOADING = new HttpContextToken<boolean>(() => false);

export const loadingInterceptor: HttpInterceptorFn = (request, next) => {
  if (request.context.get(SKIP_GLOBAL_LOADING)) return next(request);

  const loading = inject(LoadingService);
  return defer(() => {
    loading.start();
    return next(request);
  }).pipe(finalize(() => loading.finish()));
};
