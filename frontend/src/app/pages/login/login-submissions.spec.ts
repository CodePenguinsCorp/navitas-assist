import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting, TestRequest } from '@angular/common/http/testing';
import { Component } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { NavigationEnd, provideRouter, Router } from '@angular/router';
import { Subscription } from 'rxjs';
import { AuthUserResponse } from '../../core/models';
import { AuthService } from '../../core/services/auth.service';
import { LoginComponent } from './login.component';

@Component({ template: '' })
class LoginTestDestination {}

describe('LoginComponent pending submissions', () => {
  let fixture: ComponentFixture<LoginComponent>;
  let http: HttpTestingController;
  let router: Router;
  let page: HTMLElement;
  let navigations: string[];
  let navigationSubscription: Subscription | undefined;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [LoginComponent],
      providers: [
        provideHttpClient(), provideHttpClientTesting(),
        provideRouter([
          { path: 'login', component: LoginTestDestination },
          { path: 'dashboard', component: LoginTestDestination },
          { path: 'rmas', component: LoginTestDestination }
        ])
      ]
    }).compileComponents();
    http = TestBed.inject(HttpTestingController);
    router = TestBed.inject(Router);
    await router.navigateByUrl('/login');
    navigations = [];
    navigationSubscription = router.events.subscribe((event) => {
      if (event instanceof NavigationEnd) navigations.push(event.urlAfterRedirects);
    });
    fixture = TestBed.createComponent(LoginComponent);
    http.expectOne('/api/auth/me').flush({ message: 'Unauthorized' }, { status: 401, statusText: 'Unauthorized' });
    fixture.detectChanges();
    page = fixture.nativeElement as HTMLElement;
  });

  afterEach(() => {
    navigationSubscription?.unsubscribe();
    http.verify();
  });

  function fill(): void {
    for (const [selector, value] of [['#username', '  operator  '], ['#password', 'test-password']]) {
      const input = page.querySelector<HTMLInputElement>(selector)!;
      input.value = value;
      input.dispatchEvent(new Event('input', { bubbles: true }));
    }
    fixture.detectChanges();
  }

  function button(): HTMLButtonElement {
    return page.querySelector<HTMLButtonElement>('button[type="submit"]')!;
  }

  function submit(): void {
    page.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    fixture.detectChanges();
  }

  function expectNoSecondFlow(first: TestRequest): void {
    const duplicates = http.match((request) => request.url === '/api/auth/csrf' || request.url === '/api/auth/login');
    for (const duplicate of duplicates) {
      duplicate.flush({ message: 'Duplicate request' }, { status: 500, statusText: 'Server Error' });
    }
    if (duplicates.length) {
      first.flush({ message: 'Pending request cleanup' }, { status: 500, statusText: 'Server Error' });
      fixture.detectChanges();
    }
    expect(duplicates).toHaveLength(0);
    expect(first.cancelled).toBe(false);
    expect(button().disabled).toBe(true);
  }

  async function succeed(request: TestRequest, destination = '/dashboard'): Promise<void> {
    expect(request.request.body).toEqual({ username: 'operator', password: 'test-password' });
    request.flush(authUser);
    await fixture.whenStable();
    fixture.detectChanges();
    expect(router.url).toBe(destination);
    expect(navigations).toEqual([destination]);
    expect(TestBed.inject(AuthService).currentUser()).toEqual({
      username: 'operator', name: 'Operador', role: 'SERVICE_DESK'
    });
    expect(TestBed.inject(AuthService).isAuthenticated()).toBe(true);
    expect(button().disabled).toBe(false);
  }

  it('ignores repeated submissions while the CSRF request is pending', async () => {
    fill();
    submit();
    const first = http.expectOne({ method: 'GET', url: '/api/auth/csrf' });
    expect(button().disabled).toBe(true);
    submit();
    expectNoSecondFlow(first);
    first.flush(null);
    await succeed(http.expectOne({ method: 'POST', url: '/api/auth/login' }));
  });

  it('ignores repeated submissions while the login request is pending', async () => {
    fill();
    submit();
    http.expectOne({ method: 'GET', url: '/api/auth/csrf' }).flush(null);
    const first = http.expectOne({ method: 'POST', url: '/api/auth/login' });
    expect(button().disabled).toBe(true);
    submit();
    expectNoSecondFlow(first);
    await succeed(first);
  });

  it.each(['csrf', 'login'] as const)('allows a manual retry after a %s error without losing values', async (phase) => {
    fill();
    submit();
    const csrf = http.expectOne({ method: 'GET', url: '/api/auth/csrf' });
    if (phase === 'csrf') {
      csrf.flush({ message: 'Unavailable' }, { status: 500, statusText: 'Server Error' });
    } else {
      csrf.flush(null);
      http.expectOne({ method: 'POST', url: '/api/auth/login' })
        .flush({ message: 'Unauthorized' }, { status: 401, statusText: 'Unauthorized' });
    }
    fixture.detectChanges();
    expect(page.querySelector<HTMLInputElement>('#username')!.value).toBe('  operator  ');
    expect(page.querySelector<HTMLInputElement>('#password')!.value).toBe('test-password');
    expect(button().disabled).toBe(false);
    expect(page.querySelector('[role="alert"]')).not.toBeNull();
    expect(navigations).toEqual([]);
    expect(TestBed.inject(AuthService).isAuthenticated()).toBe(false);
    submit();
    http.expectOne({ method: 'GET', url: '/api/auth/csrf' }).flush(null);
    await succeed(http.expectOne({ method: 'POST', url: '/api/auth/login' }));
  });

  it.each([
    { initial: '/login', destination: '/dashboard' },
    { initial: '/login?redirectTo=%2Frmas', destination: '/rmas' }
  ])('preserves the $destination redirect after one successful login', async ({ initial, destination }) => {
    await router.navigateByUrl(initial);
    navigations.length = 0;
    fill();
    submit();
    http.expectOne({ method: 'GET', url: '/api/auth/csrf' }).flush(null);
    await succeed(http.expectOne({ method: 'POST', url: '/api/auth/login' }), destination);
  });

  it('does not send or lock an invalid form', () => {
    submit();
    http.expectNone('/api/auth/csrf');
    http.expectNone('/api/auth/login');
    expect(button().disabled).toBe(false);
    expect(page.querySelector('[role="alert"]')).not.toBeNull();
    expect(navigations).toEqual([]);
  });
});

const authUser: AuthUserResponse = {
  id: 1, username: 'operator', fullName: 'Operador', role: 'SERVICE_DESK', active: true,
  createdAt: '2026-10-20T12:00:00Z', updatedAt: '2026-10-20T12:00:00Z'
};
