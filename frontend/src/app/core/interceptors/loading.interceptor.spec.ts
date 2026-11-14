import { HttpClient, HttpContext, HttpErrorResponse, HttpInterceptorFn, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { firstValueFrom, retry } from 'rxjs';
import { appConfig } from '../../app.config';
import { AuthService } from '../services/auth.service';
import { LoadingService } from '../services/loading.service';
import { NotificationService } from '../services/notification.service';
import { loadingInterceptor, SKIP_GLOBAL_LOADING } from './loading.interceptor';

describe('loadingInterceptor', () => {
  let http: HttpClient;
  let backend: HttpTestingController;
  let loading: LoadingService;

  beforeEach(() => {
    vi.useFakeTimers();
    TestBed.configureTestingModule({
      providers: [provideHttpClient(withInterceptors([loadingInterceptor])), provideHttpClientTesting()]
    });
    http = TestBed.inject(HttpClient);
    backend = TestBed.inject(HttpTestingController);
    loading = TestBed.inject(LoadingService);
  });

  afterEach(() => {
    try {
      backend?.verify();
    } finally {
      TestBed.resetTestingModule();
      vi.useRealTimers();
    }
  });

  it('counts subscribed requests and balances overlapping successful responses', () => {
    const request$ = http.get('/first');
    expect(loading.pendingCount()).toBe(0);
    request$.subscribe();
    http.post('/second', {}).subscribe();
    expect(loading.pendingCount()).toBe(2);
    vi.advanceTimersByTime(200);
    expect(loading.visible()).toBe(true);
    backend.expectOne('/first').flush({});
    expect(loading.pendingCount()).toBe(1);
    backend.expectOne('/second').flush({});
    expect(loading.pendingCount()).toBe(0);
    vi.advanceTimersByTime(400);
    expect(loading.visible()).toBe(false);
  });

  it.each([
    '/api/auth/csrf', '/api/auth/login', '/api/auth/logout', '/api/auth/me?refresh=1', '/api/auth/login#entrar',
    'https://navitas.example/api/auth/login', '//navitas.example/api/auth/csrf'
  ])('never blocks the screen for the authentication call %s', (url) => {
    http.post(url, {}).subscribe();
    expect(loading.pendingCount()).toBe(0);
    vi.advanceTimersByTime(1000);
    expect(loading.visible()).toBe(false);
    backend.expectOne(url).flush({});
  });

  it.each(['/api/authors', '/api/auth', '/api/rmas?next=/api/auth/login', 'https://navitas.example/api/rmas', '/api/auth/../rmas'])(
    'keeps the overlay for the non-authentication call %s', (url) => {
      http.get(url).subscribe();
      expect(loading.pendingCount()).toBe(1);
      backend.expectOne(url).flush({});
      expect(loading.pendingCount()).toBe(0);
    });

  it.each(['server', 'network'] as const)('finishes and forwards a %s error', (kind) => {
    let received: HttpErrorResponse | undefined;
    http.get('/failure').subscribe({ error: (error) => received = error });
    vi.advanceTimersByTime(200);
    expect(loading.visible()).toBe(true);
    const request = backend.expectOne('/failure');
    if (kind === 'server') request.flush({}, { status: 500, statusText: 'Server Error' });
    else request.error(new ProgressEvent('error'));
    expect(received?.status).toBe(kind === 'server' ? 500 : 0);
    expect(loading.pendingCount()).toBe(0);
    vi.advanceTimersByTime(400);
    expect(loading.visible()).toBe(false);
  });

  it('finishes on cancellation without decrementing again', () => {
    const subscription = http.get('/cancel').subscribe();
    const request = backend.expectOne('/cancel');
    expect(loading.pendingCount()).toBe(1);
    vi.advanceTimersByTime(200);
    subscription.unsubscribe();
    subscription.unsubscribe();
    expect(request.cancelled).toBe(true);
    expect(loading.pendingCount()).toBe(0);
    vi.advanceTimersByTime(400);
    expect(loading.visible()).toBe(false);
  });

  it('ignores opted-out requests without finishing another active request', () => {
    http.get('/foreground').subscribe();
    const subscription = http.get('/background', { context: new HttpContext().set(SKIP_GLOBAL_LOADING, true) }).subscribe();
    expect(loading.pendingCount()).toBe(1);
    backend.expectOne('/background');
    subscription.unsubscribe();
    expect(loading.pendingCount()).toBe(1);
    backend.expectOne('/foreground').flush({});
    vi.advanceTimersByTime(1000);
    expect(loading.pendingCount()).toBe(0);
    expect(loading.visible()).toBe(false);
  });

  it('counts every subscription and retry independently', () => {
    const request$ = http.get('/retry').pipe(retry(1));
    request$.subscribe();
    request$.subscribe();
    expect(loading.pendingCount()).toBe(2);
    const requests = backend.match('/retry');
    requests[0].flush({}, { status: 500, statusText: 'Server Error' });
    expect(loading.pendingCount()).toBe(2);
    backend.expectOne('/retry').flush({});
    expect(loading.pendingCount()).toBe(1);
    requests[1].flush({});
    expect(loading.pendingCount()).toBe(0);
  });

  it('keeps silent session checks and notification polling out of the counter', () => {
    TestBed.inject(AuthService).restoreSession().subscribe();
    TestBed.inject(NotificationService).refreshSummary().subscribe();
    const session = backend.expectOne('/api/auth/me');
    const summary = backend.expectOne('/api/notifications/summary');
    expect(session.request.context.get(SKIP_GLOBAL_LOADING)).toBe(true);
    expect(summary.request.context.get(SKIP_GLOBAL_LOADING)).toBe(true);
    expect(loading.pendingCount()).toBe(0);
    vi.advanceTimersByTime(1000);
    expect(loading.visible()).toBe(false);
    session.flush({}, { status: 401, statusText: 'Unauthorized' });
    summary.flush({ unread: 3 });
    expect(loading.pendingCount()).toBe(0);
  });

  it('keeps user-initiated notification list requests in the counter', () => {
    TestBed.inject(NotificationService).list().subscribe();
    expect(loading.pendingCount()).toBe(1);
    backend.expectOne('/api/notifications').flush([]);
    expect(loading.pendingCount()).toBe(0);
  });

  it('also finalizes if a downstream interceptor throws synchronously', async () => {
    TestBed.resetTestingModule();
    const throwing: HttpInterceptorFn = () => { throw new Error('downstream failure'); };
    TestBed.configureTestingModule({ providers: [provideHttpClient(withInterceptors([loadingInterceptor, throwing])), provideHttpClientTesting()] });
    loading = TestBed.inject(LoadingService);
    await expect(firstValueFrom(TestBed.inject(HttpClient).get('/throw'))).rejects.toThrow('downstream failure');
    expect(loading.pendingCount()).toBe(0);
    vi.advanceTimersByTime(1000);
    expect(loading.visible()).toBe(false);
  });
});

describe('global loading app registration', () => {
  it('enables loading for the production HttpClient configuration', () => {
    TestBed.configureTestingModule({ providers: [...appConfig.providers, provideHttpClientTesting()] });
    const loading = TestBed.inject(LoadingService);
    TestBed.inject(HttpClient).get('/app-request').subscribe();
    const backend = TestBed.inject(HttpTestingController);
    const request = backend.expectOne('/app-request');
    const pending = loading.pendingCount();
    request.flush({});
    backend.verify();
    expect(pending).toBe(1);
    expect(loading.pendingCount()).toBe(0);
  });
});
