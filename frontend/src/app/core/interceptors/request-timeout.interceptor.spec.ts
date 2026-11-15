import { HttpClient, HttpErrorResponse, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { LoadingService } from '../services/loading.service';
import { extractHttpErrorMessage } from '../utils/catalog-ui';
import { loadingInterceptor } from './loading.interceptor';
import {
  READ_TIMEOUT_MESSAGE, REQUEST_TIMEOUT_MS, requestTimeoutInterceptor, SLOW_REQUEST_TIMEOUT_MS, WRITE_TIMEOUT_MESSAGE
} from './request-timeout.interceptor';

describe('requestTimeoutInterceptor', () => {
  let http: HttpClient;
  let backend: HttpTestingController;
  let loading: LoadingService;

  beforeEach(() => {
    vi.useFakeTimers();
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([loadingInterceptor, requestTimeoutInterceptor])),
        provideHttpClientTesting()
      ]
    });
    http = TestBed.inject(HttpClient);
    backend = TestBed.inject(HttpTestingController);
    loading = TestBed.inject(LoadingService);
  });

  afterEach(() => {
    try {
      backend.verify();
    } finally {
      TestBed.resetTestingModule();
      vi.useRealTimers();
    }
  });

  it('uses 45 s for ordinary calls and 120 s for the slow ones', () => {
    expect(REQUEST_TIMEOUT_MS).toBe(45_000);
    expect(SLOW_REQUEST_TIMEOUT_MS).toBe(120_000);
  });

  it('leaves a quick request untouched', () => {
    let body: unknown;
    http.get('/api/rmas').subscribe((value) => body = value);
    vi.advanceTimersByTime(10_000);
    backend.expectOne('/api/rmas').flush({ ok: true });
    expect(body).toEqual({ ok: true });
    vi.advanceTimersByTime(120_000);
    expect(loading.pendingCount()).toBe(0);
  });

  it('keeps waiting just before 45 s and fails at 45 s, cancelling the request', () => {
    let error: HttpErrorResponse | undefined;
    http.get('/api/rmas').subscribe({ error: (e) => error = e });
    const request = backend.expectOne('/api/rmas');
    vi.advanceTimersByTime(44_999);
    expect(error).toBeUndefined();
    vi.advanceTimersByTime(1);
    expect(error).toBeInstanceOf(HttpErrorResponse);
    expect(request.cancelled).toBe(true);
    expect(extractHttpErrorMessage(error, 'fallback')).toBe(READ_TIMEOUT_MESSAGE);
    expect(READ_TIMEOUT_MESSAGE).toBe('A operação demorou mais do que o esperado e foi interrompida. Verifique a conexão e tente novamente.');
  });

  it('releases the global loading when the limit is reached', () => {
    http.get('/api/rmas').subscribe({ error: () => undefined });
    expect(loading.pendingCount()).toBe(1);
    backend.expectOne('/api/rmas');
    vi.advanceTimersByTime(45_000);
    expect(loading.pendingCount()).toBe(0);
    vi.advanceTimersByTime(1000);
    expect(loading.visible()).toBe(false);
  });

  it.each(['POST', 'PUT', 'PATCH', 'DELETE'])('warns that a %s may have been saved', (method) => {
    let error: HttpErrorResponse | undefined;
    http.request(method, '/api/clients/1', { body: {} }).subscribe({ error: (e) => error = e });
    backend.expectOne('/api/clients/1');
    vi.advanceTimersByTime(45_000);
    expect(extractHttpErrorMessage(error, 'fallback')).toBe(WRITE_TIMEOUT_MESSAGE);
    expect(WRITE_TIMEOUT_MESSAGE).toBe(
      'A operação demorou mais do que o esperado e foi interrompida. Verifique a conexão e tente novamente. Confira se a alteração foi salva antes de repetir.'
    );
  });

  it('never retries on its own: only one request reaches the network', () => {
    http.post('/api/clients', {}).subscribe({ error: () => undefined });
    backend.expectOne('/api/clients');
    vi.advanceTimersByTime(200_000);
    backend.expectNone('/api/clients');
  });

  it.each([
    ['GET', '/api/reports/rmas/export.csv'], ['GET', '/api/reports/rmas/summary/export.csv'], ['GET', '/api/rmas/7/report.pdf'],
    ['POST', '/api/clients/imports/preview'], ['POST', '/api/products/imports/confirm']
  ])('gives %s %s 120 s', (method, url) => {
    let error: HttpErrorResponse | undefined;
    http.request(method, url, { body: method === 'POST' ? {} : undefined }).subscribe({ error: (e) => error = e });
    const request = backend.expectOne(url);
    vi.advanceTimersByTime(119_999);
    expect(error).toBeUndefined();
    vi.advanceTimersByTime(1);
    expect(error).toBeInstanceOf(HttpErrorResponse);
    expect(request.cancelled).toBe(true);
  });

  it('does not touch the notification counter polling, which has its own handling', () => {
    let error: HttpErrorResponse | undefined;
    http.get('/api/notifications/summary').subscribe({ error: (e) => error = e });
    const request = backend.expectOne('/api/notifications/summary');
    vi.advanceTimersByTime(300_000);
    expect(error).toBeUndefined();
    expect(request.cancelled).toBe(false);
    request.flush({ unread: 0 });
  });

  it('does not touch the authentication calls', () => {
    http.post('/api/auth/login', {}).subscribe();
    const request = backend.expectOne('/api/auth/login');
    vi.advanceTimersByTime(300_000);
    expect(request.cancelled).toBe(false);
    request.flush({});
  });

  it('forwards server errors unchanged', () => {
    let error: HttpErrorResponse | undefined;
    http.get('/api/rmas').subscribe({ error: (e) => error = e });
    backend.expectOne('/api/rmas').flush({ message: 'Falhou.' }, { status: 503, statusText: 'x' });
    expect(error?.status).toBe(503);
    expect(extractHttpErrorMessage(error, 'fallback')).toBe('Falhou.');
  });
});
