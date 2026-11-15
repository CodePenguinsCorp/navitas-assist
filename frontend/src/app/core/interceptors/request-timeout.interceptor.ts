import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { catchError, throwError, timeout } from 'rxjs';

/** A little under the 50 s the database gives each query, so the screen answers first. */
export const REQUEST_TIMEOUT_MS = 45_000;
/** Exports, PDFs and the CSV import preview/confirmation legitimately take longer. */
export const SLOW_REQUEST_TIMEOUT_MS = 120_000;

export const READ_TIMEOUT_MESSAGE =
  'A operação demorou mais do que o esperado e foi interrompida. Verifique a conexão e tente novamente.';
export const WRITE_TIMEOUT_MESSAGE = `${READ_TIMEOUT_MESSAGE} Confira se a alteração foi salva antes de repetir.`;

const SLOW_PATHS = /\/export\.csv$|\/report\.pdf$|\/imports\/(preview|confirm)$/;

/**
 * Gives up on a request that never answers: unsubscribing cancels it in the browser, the loading
 * interceptor (outside this one) releases the overlay, and the caller gets an error whose `message`
 * `extractHttpErrorMessage` already shows. It never retries; for writes the text warns the change may have been saved.
 */
export const requestTimeoutInterceptor: HttpInterceptorFn = (request, next) => {
  const path = pathOf(request.url);
  // Login/CSRF give their own feedback; the notification counter poll already handles its own failure.
  if (path.startsWith('/api/auth/') || path === '/api/notifications/summary') return next(request);

  const limit = SLOW_PATHS.test(path) ? SLOW_REQUEST_TIMEOUT_MS : REQUEST_TIMEOUT_MS;
  const isWrite = request.method !== 'GET' && request.method !== 'HEAD';
  return next(request).pipe(
    timeout({ first: limit, each: limit }),
    catchError((error: unknown) => {
      if (error instanceof Error && error.name === 'TimeoutError') {
        return throwError(() => new HttpErrorResponse({
          status: 408,
          statusText: 'Request Timeout',
          url: request.urlWithParams,
          error: { message: isWrite ? WRITE_TIMEOUT_MESSAGE : READ_TIMEOUT_MESSAGE }
        }));
      }
      return throwError(() => error);
    })
  );
};

function pathOf(url: string): string {
  try {
    return new URL(url, 'http://relative.invalid').pathname;
  } catch {
    return url;
  }
}
