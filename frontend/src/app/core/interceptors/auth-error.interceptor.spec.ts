import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { of } from 'rxjs';
import { UserSession } from '../models';
import { AuthService } from '../services/auth.service';
import { authErrorInterceptor } from './auth-error.interceptor';

describe('authErrorInterceptor', () => {
  const session = signal<UserSession | null>(null);
  const auth = {
    currentUser: session.asReadonly(),
    clearSession: vi.fn(() => session.set(null)),
    refreshSession: vi.fn(() => of(session())),
  };
  const router = { url: '/rmas', navigate: vi.fn().mockResolvedValue(true) };
  let http: HttpClient;
  let httpTesting: HttpTestingController;

  beforeEach(() => {
    session.set({ username: 'operator', name: 'Operador', profileName: 'Atendimento', permissions: ['rma.ver'] });
    auth.clearSession.mockClear();
    auth.refreshSession.mockClear();
    router.navigate.mockClear();
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([authErrorInterceptor])),
        provideHttpClientTesting(),
        { provide: AuthService, useValue: auth },
        { provide: Router, useValue: router },
      ],
    });
    http = TestBed.inject(HttpClient);
    httpTesting = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpTesting.verify());

  function fail(url: string, status: number, method: 'GET' | 'POST' = 'GET'): ReturnType<typeof vi.fn> {
    const error = vi.fn();
    (method === 'GET' ? http.get(url) : http.post(url, {})).subscribe({ error });
    httpTesting.expectOne(url).flush({ message: 'denied' }, { status, statusText: 'Failure' });
    return error;
  }

  it('redirects to login with expired notice on 401', () => {
    const error = fail('/api/rmas', 401);

    expect(auth.clearSession).toHaveBeenCalledOnce();
    expect(session()).toBeNull();
    expect(router.navigate).toHaveBeenCalledExactlyOnceWith(['/login'], {
      queryParams: { redirectTo: '/rmas', reason: 'expired' },
    });
    expect(error).toHaveBeenCalledOnce();
    expect(error.mock.calls[0][0].status).toBe(401);
  });

  it('ignores 401 from login', () => {
    const error = fail('/api/auth/login', 401, 'POST');

    expect(auth.clearSession).not.toHaveBeenCalled();
    expect(router.navigate).not.toHaveBeenCalled();
    expect(session()).not.toBeNull();
    expect(error).toHaveBeenCalledOnce();
  });

  it('ignores 401 without session', () => {
    session.set(null);
    const error = fail('/api/auth/me', 401);

    expect(auth.clearSession).not.toHaveBeenCalled();
    expect(router.navigate).not.toHaveBeenCalled();
    expect(error).toHaveBeenCalledOnce();
  });

  it('refreshes the session on 403', () => {
    const error = fail('/api/rmas', 403, 'POST');

    expect(auth.refreshSession).toHaveBeenCalledOnce();
    expect(auth.clearSession).not.toHaveBeenCalled();
    expect(router.navigate).not.toHaveBeenCalled();
    expect(error).toHaveBeenCalledOnce();
    expect(error.mock.calls[0][0].status).toBe(403);
  });

  it('does not refresh on 403 from /api/auth/*', () => {
    const error = fail('/api/auth/csrf', 403);

    expect(auth.refreshSession).not.toHaveBeenCalled();
    expect(error).toHaveBeenCalledOnce();
  });

  it('leaves other failures untouched', () => {
    const error = fail('/api/rmas', 500);

    expect(auth.refreshSession).not.toHaveBeenCalled();
    expect(auth.clearSession).not.toHaveBeenCalled();
    expect(router.navigate).not.toHaveBeenCalled();
    expect(error).toHaveBeenCalledOnce();
  });
});
