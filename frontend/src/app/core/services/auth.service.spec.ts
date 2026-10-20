import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';
import { AuthUserResponse } from '../models';
import { AuthService } from './auth.service';

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
    request.flush(authUser({ username: 'operator', fullName: 'Operador', role: 'SERVICE_DESK' }));

    await expect(login).resolves.toEqual({
      username: 'operator',
      name: 'Operador',
      role: 'SERVICE_DESK',
    });
    expect(service.currentUser()).toEqual({
      username: 'operator',
      name: 'Operador',
      role: 'SERVICE_DESK',
    });
    expect(service.isAuthenticated()).toBe(true);
    expect(service.hasAnyRole(['ADMIN', 'SERVICE_DESK'])).toBe(true);
  });

  it('converts a failed session restore into an anonymous initialized session', async () => {
    const restored = firstValueFrom(service.restoreSession());
    httpTesting
      .expectOne('/api/auth/me')
      .flush({ message: 'Unauthorized' }, { status: 401, statusText: 'Unauthorized' });

    await expect(restored).resolves.toBeNull();
    expect(service.currentUser()).toBeNull();
    expect(service.isAuthenticated()).toBe(false);
    expect(service.hasAnyRole(['VIEWER'])).toBe(false);

    await expect(firstValueFrom(service.restoreSession())).resolves.toBeNull();
    httpTesting.expectNone('/api/auth/me');
  });
});

function authUser(overrides: Partial<AuthUserResponse> = {}): AuthUserResponse {
  return {
    id: 1,
    username: 'admin',
    fullName: 'Administrador',
    role: 'ADMIN',
    active: true,
    createdAt: '2026-10-20T12:00:00Z',
    updatedAt: '2026-10-20T12:00:00Z',
    ...overrides,
  };
}
