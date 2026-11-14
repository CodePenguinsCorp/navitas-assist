import { Component, inject } from '@angular/core';
import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { CanActivateFn, provideRouter, Router } from '@angular/router';
import { map } from 'rxjs';
import { App } from '../../app';
import { authErrorInterceptor } from '../../core/interceptors/auth-error.interceptor';
import { loadingInterceptor } from '../../core/interceptors/loading.interceptor';
import { AuthService } from '../../core/services/auth.service';
import { LoadingService } from '../../core/services/loading.service';
import { LoginComponent } from './login.component';

/** Like the RMA list: one request ends with the page, the option lists outlive it. */
@Component({ template: '<p>Ordens de serviço</p>' })
class RmasPage {
  constructor() {
    const http = inject(HttpClient);
    http.get('/api/rmas').subscribe({ error: () => undefined });
    http.get('/api/clients/options').subscribe({ error: () => undefined });
  }
}

@Component({ template: '<p>Dashboard</p>' })
class DashboardPage {
  constructor() {
    inject(HttpClient).get('/api/rmas/dashboard').subscribe();
  }
}

/** A destination guard that reads the API while the login screen is still the one on display. */
const slowGuard: CanActivateFn = () => inject(HttpClient).get('/api/slow-guard').pipe(map(() => true));

const user = { username: 'admin', fullName: 'Admin', email: 'admin@navitas.test', profileName: 'Administrador', permissions: [] };

describe('Login screen and the global loading overlay', () => {
  let fixture: ComponentFixture<App>;
  let http: HttpTestingController;
  let loading: LoadingService;
  let router: Router;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [App],
      providers: [
        provideRouter([
          { path: 'login', component: LoginComponent },
          { path: 'rmas', component: RmasPage },
          { path: 'dashboard', component: DashboardPage, canActivate: [slowGuard] }
        ]),
        provideHttpClient(withInterceptors([loadingInterceptor, authErrorInterceptor])),
        provideHttpClientTesting()
      ]
    }).compileComponents();
    http = TestBed.inject(HttpTestingController);
    loading = TestBed.inject(LoadingService);
    router = TestBed.inject(Router);
    fixture = TestBed.createComponent(App);
    fixture.detectChanges();
    vi.useFakeTimers();
  });

  afterEach(() => {
    try {
      http.verify();
    } finally {
      TestBed.resetTestingModule();
      vi.useRealTimers();
    }
  });

  function overlayShown(): boolean {
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;
    return loading.visible() || root.querySelector('app-loading-overlay [role="status"]') !== null
      || root.querySelector<HTMLDialogElement>('dialog.global-loading-dialog')!.open;
  }

  function loginScreen(): boolean {
    fixture.detectChanges();
    return (fixture.nativeElement as HTMLElement).querySelector('app-login') !== null;
  }

  async function signIn(): Promise<void> {
    TestBed.inject(AuthService).login({ username: 'admin', password: 'admin123' }).subscribe();
    http.expectOne('/api/auth/csrf').flush(null);
    http.expectOne('/api/auth/login').flush(user);
  }

  async function settle(): Promise<void> {
    await vi.advanceTimersByTimeAsync(0);
    fixture.detectChanges();
  }

  it('stays hidden on the login screen while a request from the expired page is still pending', async () => {
    await signIn();
    await router.navigateByUrl('/rmas');
    await settle();
    http.expectOne('/api/rmas').flush({}, { status: 401, statusText: 'Unauthorized' });
    await settle();
    expect(loginScreen()).toBe(true);
    expect(router.url).toBe('/login?redirectTo=%2Frmas&reason=expired');

    await vi.advanceTimersByTimeAsync(1500);
    expect(overlayShown()).toBe(false);
    expect(loginScreen()).toBe(true);
    expect(fixture.nativeElement.querySelector('[aria-busy="true"]')).toBeNull();

    http.expectOne('/api/clients/options').flush({}, { status: 401, statusText: 'Unauthorized' });
    await vi.advanceTimersByTimeAsync(1000);
    expect(overlayShown()).toBe(false);
  });

  it('closes an overlay that was already open as soon as the login screen replaces the page', async () => {
    await signIn();
    await router.navigateByUrl('/rmas');
    await settle();
    await vi.advanceTimersByTimeAsync(200);
    expect(overlayShown()).toBe(true);

    http.expectOne('/api/rmas').flush({}, { status: 401, statusText: 'Unauthorized' });
    await settle();
    expect(loginScreen()).toBe(true);
    expect(overlayShown()).toBe(false);
    http.expectOne('/api/clients/options').flush({}, { status: 401, statusText: 'Unauthorized' });
  });

  it('keeps the login screen clear while the post-login navigation loads, then loads normally on the destination', async () => {
    await router.navigateByUrl('/login');
    await settle();
    http.expectOne('/api/auth/me').flush({}, { status: 401, statusText: 'Unauthorized' });
    await settle();
    const page = fixture.nativeElement as HTMLElement;
    for (const [id, value] of [['username', 'admin'], ['password', 'admin123']]) {
      const input = page.querySelector<HTMLInputElement>(`#${id}`)!;
      input.value = value;
      input.dispatchEvent(new Event('input', { bubbles: true }));
    }
    page.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    http.expectOne('/api/auth/csrf').flush(null);
    http.expectOne('/api/auth/login').flush(user);
    await settle();

    const guard = http.expectOne('/api/slow-guard');
    await vi.advanceTimersByTimeAsync(1000);
    expect(loginScreen()).toBe(true);
    expect(overlayShown()).toBe(false);

    guard.flush({});
    await settle();
    expect(loginScreen()).toBe(false);
    expect(router.url).toBe('/dashboard');
    await vi.advanceTimersByTimeAsync(199);
    expect(overlayShown()).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(overlayShown()).toBe(true);
    http.expectOne('/api/rmas/dashboard').flush({});
    await vi.advanceTimersByTimeAsync(400);
    expect(overlayShown()).toBe(false);
  });
});
