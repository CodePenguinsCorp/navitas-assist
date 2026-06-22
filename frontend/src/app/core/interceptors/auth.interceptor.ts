import { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { AuthService } from '../services/auth.service';

export const authInterceptor: HttpInterceptorFn = (request, next) => {
  if (!request.url.startsWith('/api') || request.headers.has('Authorization')) {
    return next(request);
  }

  const authService = inject(AuthService);
  const authHeader = authService.getAuthorizationHeader();

  if (!authHeader) {
    return next(request);
  }

  return next(request.clone({
    setHeaders: {
      Authorization: authHeader
    }
  }));
};
