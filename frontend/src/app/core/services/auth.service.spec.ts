import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting, TestRequest } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';
import { AuthUserResponse } from '../models';
import { SKIP_GLOBAL_LOADING } from '../interceptors/loading.interceptor';
import { profilePermissions } from '../../testing/permission-fixtures';
import { AuthService } from './auth.service';
import { PermissionService } from './permission.service';

const ADMIN_PERMISSIONS = [...profilePermissions('ADMIN')];

describe('AuthService', () => {
  let service: AuthService;
  let httpTesting: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(AuthService);
    httpTesting = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpTesting.verify());

  it('obtains the CSRF token before login and stores the mapped session', async () => {
    const login = firstValueFrom(service.login({ username: '  operator  ', password: 'secret' }));

    httpTesting.expectOne('/api/auth/csrf').flush(null);
    const request = httpTesting.expectOne('/api/auth/login');
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual({ username: 'operator', password: 'secret' });
    request.flush(authUser({ username: 'operator', fullName: 'Operador' }));

    const expected = {
      username: 'operator',
      name: 'Operador',
      profileName: 'Administrador',
      permissions: ADMIN_PERMISSIONS,
    };
    await expect(login).resolves.toEqual(expected);
    expect(service.currentUser()).toEqual(expected);
    expect(service.isAuthenticated()).toBe(true);
    expect(TestBed.inject(PermissionService).hasPermission('usuarios.gerir')).toBe(true);
  });

  it('converts a failed session restore into an anonymous initialized session', async () => {
    const restored = firstValueFrom(service.restoreSession());
    httpTesting
      .expectOne('/api/auth/me')
      .flush({ message: 'Unauthorized' }, { status: 401, statusText: 'Unauthorized' });

    await expect(restored).resolves.toBeNull();
    expect(service.currentUser()).toBeNull();
    expect(service.isAuthenticated()).toBe(false);
    expect(TestBed.inject(PermissionService).hasPermission('rma.ver')).toBe(false);

    await expect(firstValueFrom(service.restoreSession())).resolves.toBeNull();
    httpTesting.expectNone('/api/auth/me');
  });
});

describe('AuthService permissions session', () => {
  let service: AuthService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    service = TestBed.inject(AuthService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('maps the profile name and drops unknown permission codes', () => {
    service.restoreSession().subscribe();
    http.expectOne('/api/auth/me').flush(authUser({
      profile: { id: 7, name: 'Suporte' },
      permissions: ['rma.ver', 'ADMIN', 'rma.apagar', 'pecas.ver'],
    }));

    expect(service.currentUser()).toEqual({
      username: 'admin', name: 'Administrador', profileName: 'Suporte', permissions: ['rma.ver', 'pecas.ver'],
    });
  });

  it('refreshes the session with a single shared request outside the global loading', async () => {
    service.restoreSession().subscribe();
    http.expectOne('/api/auth/me').flush(authUser());

    const first = firstValueFrom(service.refreshSession());
    const second = firstValueFrom(service.refreshSession());
    const request = http.expectOne('/api/auth/me');
    expect(request.request.context.get(SKIP_GLOBAL_LOADING)).toBe(true);
    request.flush(authUser({ profile: { id: 3, name: 'Técnico' }, permissions: ['rma.ver', 'rma.status'] }));

    const expected = { username: 'admin', name: 'Administrador', profileName: 'Técnico', permissions: ['rma.ver', 'rma.status'] };
    await expect(first).resolves.toEqual(expected);
    await expect(second).resolves.toEqual(expected);
    expect(service.currentUser()).toEqual(expected);

    service.refreshSession().subscribe();
    http.expectOne('/api/auth/me').flush(authUser());
    expect(service.currentUser()?.profileName).toBe('Administrador');
  });

  it('keeps the current session when a refresh fails', async () => {
    service.restoreSession().subscribe();
    http.expectOne('/api/auth/me').flush(authUser());

    const refreshed = firstValueFrom(service.refreshSession());
    http.expectOne('/api/auth/me').flush({ message: 'erro' }, { status: 500, statusText: 'Server Error' });

    await expect(refreshed).resolves.toEqual(service.currentUser());
    expect(service.currentUser()?.username).toBe('admin');
  });

  it('clears the session on demand', () => {
    service.restoreSession().subscribe();
    http.expectOne('/api/auth/me').flush(authUser());

    service.clearSession();

    expect(service.currentUser()).toBeNull();
    expect(service.isAuthenticated()).toBe(false);
  });
});

function authUser(overrides: Partial<AuthUserResponse> = {}): AuthUserResponse {
  return {
    id: 1,
    username: 'admin',
    fullName: 'Administrador',
    profile: { id: 1, name: 'Administrador' },
    extraPermissions: [],
    permissions: ADMIN_PERMISSIONS,
    active: true,
    createdAt: '2026-10-20T12:00:00Z',
    updatedAt: '2026-10-20T12:00:00Z',
    ...overrides,
  };
}

describe('AuthService logout confirmation', () => {
  let service: AuthService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    service = TestBed.inject(AuthService);
    http = TestBed.inject(HttpTestingController);
    service.restoreSession().subscribe();
    http.expectOne('/api/auth/me').flush(authUser());
  });

  afterEach(() => http.verify());

  function expectOriginalSession(): void {
    expect(service.currentUser()).toEqual({
      username: 'admin', name: 'Administrador', profileName: 'Administrador', permissions: ADMIN_PERMISSIONS,
    });
    expect(service.isAuthenticated()).toBe(true);
    expect(TestBed.inject(PermissionService).hasPermission('usuarios.gerir')).toBe(true);
  }

  function fail(request: TestRequest, kind: 'network' | number): void {
    if (kind === 'network') request.error(new ProgressEvent('error'));
    else request.flush({ message: 'internal upstream detail' }, { status: kind, statusText: 'Request failed' });
  }

  it('retains the session while pending and clears it only after successful logout', () => {
    const complete = vi.fn();
    service.logout().subscribe({ complete });
    expectOriginalSession();
    http.expectOne({ method: 'GET', url: '/api/auth/csrf' }).flush(null, { status: 204, statusText: 'No Content' });
    const request = http.expectOne({ method: 'POST', url: '/api/auth/logout' });
    expect(request.request.body).toEqual({});
    expectOriginalSession();
    expect(complete).not.toHaveBeenCalled();
    request.flush(null, { status: 204, statusText: 'No Content' });
    expect(complete).toHaveBeenCalledOnce();
    expect(service.currentUser()).toBeNull();
    expect(service.isAuthenticated()).toBe(false);
    expect(TestBed.inject(PermissionService).hasPermission('usuarios.gerir')).toBe(false);
    let restored: unknown = 'not restored';
    service.restoreSession().subscribe((value) => restored = value);
    expect(restored).toBeNull();
    http.expectNone('/api/auth/me');
  });

  describe.each(['csrf', 'logout'] as const)('%s failure', (stage) => {
    it.each(['network', 401, 403, 500] as const)('preserves state and forwards error %s without retry', (kind) => {
      const error = vi.fn();
      service.logout().subscribe({ error });
      let request = http.expectOne({ method: 'GET', url: '/api/auth/csrf' });
      if (stage === 'logout') {
        request.flush(null, { status: 204, statusText: 'No Content' });
        request = http.expectOne({ method: 'POST', url: '/api/auth/logout' });
      }
      fail(request, kind);
      expect(error).toHaveBeenCalledOnce();
      expect(error.mock.calls[0][0].status).toBe(kind === 'network' ? 0 : kind);
      expectOriginalSession();
      http.expectNone('/api/auth/csrf');
      http.expectNone('/api/auth/logout');
    });
  });

  it.each(['csrf', 'logout'] as const)('does not clear state when cancelled during %s', (stage) => {
    const subscription = service.logout().subscribe();
    let request = http.expectOne({ method: 'GET', url: '/api/auth/csrf' });
    if (stage === 'logout') {
      request.flush(null, { status: 204, statusText: 'No Content' });
      request = http.expectOne({ method: 'POST', url: '/api/auth/logout' });
    }
    subscription.unsubscribe();
    expect(request.cancelled).toBe(true);
    expectOriginalSession();
    http.expectNone('/api/auth/logout');
  });

  it('can complete a new manual attempt after a failed CSRF request', () => {
    service.logout().subscribe({ error: () => {} });
    fail(http.expectOne('/api/auth/csrf'), 500);
    expectOriginalSession();
    const complete = vi.fn();
    service.logout().subscribe({ complete });
    http.expectOne('/api/auth/csrf').flush(null, { status: 204, statusText: 'No Content' });
    http.expectOne({ method: 'POST', url: '/api/auth/logout' }).flush(null, { status: 204, statusText: 'No Content' });
    expect(complete).toHaveBeenCalledOnce();
    expect(service.currentUser()).toBeNull();
  });
});
