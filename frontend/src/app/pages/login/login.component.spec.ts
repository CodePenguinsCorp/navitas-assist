import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting, TestRequest } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, Router } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';
import { LoginComponent } from './login.component';

describe('Login failure feedback', () => {
  let fixture: ComponentFixture<LoginComponent>;
  let http: HttpTestingController;
  let page: HTMLElement;
  const navigate = vi.fn().mockResolvedValue(true);

  beforeEach(async () => {
    navigate.mockClear();
    await TestBed.configureTestingModule({
      imports: [LoginComponent],
      providers: [
        provideHttpClient(), provideHttpClientTesting(),
        { provide: Router, useValue: { navigateByUrl: navigate } },
        { provide: ActivatedRoute, useValue: { snapshot: { queryParamMap: convertToParamMap({ redirectTo: '/rmas' }) } } },
      ],
    }).compileComponents();
    http = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(LoginComponent);
    http.expectOne('/api/auth/me').flush({ message: 'Unauthorized' }, { status: 401, statusText: 'Unauthorized' });
    fixture.detectChanges();
    page = fixture.nativeElement as HTMLElement;
  });

  afterEach(() => http.verify());

  function startLogin(): TestRequest {
    for (const [id, value] of [['username', '  operator  '], ['password', 'fake-password']]) {
      const input = page.querySelector<HTMLInputElement>(`#${id}`)!;
      input.value = value;
      input.dispatchEvent(new Event('input', { bubbles: true }));
    }
    page.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    fixture.detectChanges();
    expect(page.querySelector<HTMLButtonElement>('[type="submit"]')!.disabled).toBe(true);
    return http.expectOne('/api/auth/csrf');
  }

  function expectFailure(message: string): void {
    fixture.detectChanges();
    expect(page.querySelector('[role="alert"]')?.textContent?.trim()).toBe(message);
    expect(page.textContent).not.toContain('server-secret');
    expect(page.querySelector<HTMLButtonElement>('[type="submit"]')!.disabled).toBe(false);
    expect(TestBed.inject(AuthService).currentUser()).toBeNull();
    expect(navigate).not.toHaveBeenCalled();
    http.expectNone('/api/auth/csrf');
    http.expectNone('/api/auth/login');
  }

  it('keeps the credential message only for a rejected login', () => {
    startLogin().flush(null);
    http.expectOne('/api/auth/login').flush({ message: 'server-secret' }, { status: 401, statusText: 'Unauthorized' });
    expectFailure('Credenciais inválidas.');
  });

  it.each([0, 400, 403, 429, 500, 502])('does not blame credentials for login failure %s', (status) => {
    startLogin().flush(null);
    const login = http.expectOne('/api/auth/login');
    if (status === 0) {
      login.error(new ProgressEvent('error'));
    } else {
      login.flush({ message: 'server-secret', details: ['internal diagnostics'] }, { status, statusText: 'Failure' });
    }
    expectFailure('Não foi possível entrar. Tente novamente em instantes.');
  });

  it.each([401, 403, 500])('does not send credentials after CSRF bootstrap failure %s', (status) => {
    startLogin().flush({ message: 'server-secret' }, { status, statusText: 'Failure' });
    expectFailure('Não foi possível entrar. Tente novamente em instantes.');
  });

  it('keeps required field validation without making a login request', () => {
    page.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    expectFailure('Preencha os campos obrigatórios.');
  });

  it('clears failure feedback for a manual retry and redirects only after success', () => {
    startLogin().flush(null);
    http.expectOne('/api/auth/login').flush({}, { status: 500, statusText: 'Failure' });
    expectFailure('Não foi possível entrar. Tente novamente em instantes.');

    const csrf = startLogin();
    expect(page.querySelector('[role="alert"]')).toBeNull();
    http.expectNone('/api/auth/login');
    csrf.flush(null);
    const login = http.expectOne('/api/auth/login');
    expect(login.request.method).toBe('POST');
    expect(login.request.body).toEqual({ username: 'operator', password: 'fake-password' });
    login.flush({ id: 2, username: 'operator', fullName: 'Operador', role: 'SERVICE_DESK', active: true,
      createdAt: '2026-10-20T12:00:00Z', updatedAt: '2026-10-20T12:00:00Z' });
    fixture.detectChanges();

    expect(page.querySelector('[role="alert"]')).toBeNull();
    expect(page.querySelector<HTMLButtonElement>('[type="submit"]')!.disabled).toBe(false);
    expect(TestBed.inject(AuthService).currentUser()).toEqual({ username: 'operator', name: 'Operador', role: 'SERVICE_DESK' });
    expect(navigate).toHaveBeenCalledExactlyOnceWith('/rmas');
  });
});
