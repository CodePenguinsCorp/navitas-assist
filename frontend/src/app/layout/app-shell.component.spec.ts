import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting, TestRequest } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { AuthUserResponse } from '../core/models';
import { AuthService } from '../core/services/auth.service';
import { AppShellComponent } from './app-shell.component';

const AUTH_USER: AuthUserResponse = {
  id: 1, username: 'admin', fullName: 'Administrador', role: 'ADMIN', active: true,
  createdAt: '2026-10-20T12:00:00Z', updatedAt: '2026-10-20T12:00:00Z'
};

describe('AppShellComponent logout', () => {
  let fixture: ComponentFixture<AppShellComponent>;
  let http: HttpTestingController;
  let auth: AuthService;
  let router: Router;
  let page: HTMLElement;
  const feedback = 'Não foi possível confirmar o encerramento da sessão. Tente novamente.';

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AppShellComponent],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])]
    }).compileComponents();
    http = TestBed.inject(HttpTestingController);
    auth = TestBed.inject(AuthService);
    auth.restoreSession().subscribe();
    http.expectOne('/api/auth/me').flush(AUTH_USER);
    router = TestBed.inject(Router);
    vi.spyOn(router, 'navigateByUrl').mockResolvedValue(true);
    fixture = TestBed.createComponent(AppShellComponent);
    fixture.detectChanges();
    page = fixture.nativeElement as HTMLElement;
  });

  afterEach(() => http.verify());

  function button(): HTMLButtonElement {
    return page.querySelector<HTMLButtonElement>('.shell-logout')!;
  }

  function fail(request: TestRequest, kind: 'network' | number): void {
    if (kind === 'network') request.error(new ProgressEvent('error'));
    else request.flush({ message: 'internal upstream detail' }, { status: kind, statusText: 'Request failed' });
    fixture.detectChanges();
  }

  it('sends one attempt before DOM updates, stays pending through both stages and navigates on success', () => {
    button().click();
    button().click();
    fixture.detectChanges();
    const csrfDisabled = button().disabled;
    const pendingLabel = button().textContent;
    const pendingUser = auth.currentUser();
    const csrfRequests = http.match({ method: 'GET', url: '/api/auth/csrf' });
    for (const request of csrfRequests) request.flush(null, { status: 204, statusText: 'No Content' });
    fixture.detectChanges();
    const postDisabled = button().disabled;
    const logoutRequests = http.match({ method: 'POST', url: '/api/auth/logout' });
    for (const request of logoutRequests) request.flush(null, { status: 204, statusText: 'No Content' });
    fixture.detectChanges();

    expect(csrfDisabled).toBe(true);
    expect(postDisabled).toBe(true);
    expect(pendingLabel).toContain('Saindo...');
    expect(pendingUser?.username).toBe('admin');
    expect(csrfRequests).toHaveLength(1);
    expect(logoutRequests).toHaveLength(1);
    expect(auth.currentUser()).toBeNull();
    expect(router.navigateByUrl).toHaveBeenCalledExactlyOnceWith('/login');
    expect(page.querySelector('[role="alert"]')).toBeNull();
  });

  describe.each(['csrf', 'logout'] as const)('%s failure', (stage) => {
    it.each(['network', 401, 403, 500] as const)('shows confirmation failure %s and permits a successful manual retry', (kind) => {
      button().click();
      fixture.detectChanges();
      let request = http.expectOne({ method: 'GET', url: '/api/auth/csrf' });
      if (stage === 'logout') {
        request.flush(null, { status: 204, statusText: 'No Content' });
        request = http.expectOne({ method: 'POST', url: '/api/auth/logout' });
      }
      fail(request, kind);
      http.expectNone('/api/auth/logout');
      expect(page.querySelector('[role="alert"]')?.textContent).toContain(feedback);
      expect(page.textContent).not.toContain('internal upstream detail');
      expect(page.querySelector('.top-user__meta strong')?.textContent).toContain('Administrador');
      expect(auth.isAuthenticated()).toBe(true);
      expect(router.navigateByUrl).not.toHaveBeenCalled();
      expect(button().disabled).toBe(false);

      button().click();
      fixture.detectChanges();
      expect(page.querySelector('[role="alert"]')).toBeNull();
      expect(button().disabled).toBe(true);
      http.expectOne('/api/auth/csrf').flush(null, { status: 204, statusText: 'No Content' });
      http.expectOne({ method: 'POST', url: '/api/auth/logout' }).flush(null, { status: 204, statusText: 'No Content' });
      fixture.detectChanges();
      expect(auth.currentUser()).toBeNull();
      expect(button().disabled).toBe(false);
      expect(router.navigateByUrl).toHaveBeenCalledExactlyOnceWith('/login');
    });
  });
});
