import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { authErrorInterceptor } from '../core/interceptors/auth-error.interceptor';
import { AuthUserResponse } from '../core/models';
import { Permission } from '../core/permissions';
import { AuthService } from '../core/services/auth.service';
import { ProfilesComponent } from '../pages/profiles/profiles.component';
import { PERMISSION_CATALOG, buildProfile, buildProfilePage } from '../testing/profile-fixtures';
import { profilePermissions } from '../testing/permission-fixtures';
import { AppShellComponent } from './app-shell.component';

@Component({ selector: 'app-stub-page', template: '<p class="stub-page">página</p>' })
class StubPageComponent {}

const user = (permissions: readonly Permission[]): AuthUserResponse => ({
  username: 'admin', fullName: 'Administrador', profileName: 'Administrador', permissions: [...permissions]
});

describe('AppShellComponent revalidates the current screen when permissions change', () => {
  let http: HttpTestingController;
  let harness: RouterTestingHarness;

  async function start(permissions: readonly Permission[], url: string): Promise<void> {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([authErrorInterceptor])),
        provideHttpClientTesting(),
        provideRouter([{
          path: '',
          component: AppShellComponent,
          children: [
            { path: 'dashboard', component: StubPageComponent, data: { permissions: ['rma.ver'] } },
            { path: 'pecas', component: StubPageComponent, data: { permissions: ['pecas.ver'] } },
            { path: 'perfis', component: ProfilesComponent, data: { permissions: ['perfis.gerir'] } },
            { path: 'notificacoes', component: StubPageComponent }
          ]
        }])
      ]
    });
    http = TestBed.inject(HttpTestingController);
    TestBed.inject(AuthService).restoreSession().subscribe();
    http.expectOne('/api/auth/me').flush(user(permissions));
    harness = await RouterTestingHarness.create(url);
    flushSummaries();
  }

  function flushSummaries(): void {
    http.match('/api/notifications/summary').forEach((request) => request.flush({ unread: 0 }));
  }

  async function settle(): Promise<void> {
    harness.detectChanges();
    await harness.fixture.whenStable();
    harness.detectChanges();
    flushSummaries();
  }

  afterEach(() => http.verify());

  it('leaves the screen for the first allowed route after a 403 and a /me without the permission', async () => {
    await start(['rma.ver', 'pecas.ver'], '/pecas');
    const router = TestBed.inject(Router);
    expect(router.url).toBe('/pecas');

    TestBed.inject(HttpClient).get('/api/parts').subscribe({ error: () => undefined });
    http.expectOne('/api/parts').flush({ message: 'Acesso negado' }, { status: 403, statusText: 'Forbidden' });
    http.expectOne('/api/auth/me').flush(user(['rma.ver']));
    await settle();

    expect(router.url).toBe('/dashboard');
  });

  it('stays on the screen when the new permissions still grant it', async () => {
    await start(['rma.ver', 'pecas.ver'], '/pecas');
    const router = TestBed.inject(Router);

    TestBed.inject(HttpClient).get('/api/parts').subscribe({ error: () => undefined });
    http.expectOne('/api/parts').flush({ message: 'Acesso negado' }, { status: 403, statusText: 'Forbidden' });
    http.expectOne('/api/auth/me').flush(user(['pecas.ver']));
    await settle();

    expect(router.url).toBe('/pecas');
  });

  it('takes an administrator who removes perfis.gerir from his own profile out of /perfis without success and error banners', async () => {
    const admin = profilePermissions('ADMIN');
    const own = buildProfile({ id: 1, name: 'Administrador', permissions: [...admin], userCount: 1 });
    await start(admin, '/perfis');
    http.expectOne((request) => request.url === '/api/profiles').flush(buildProfilePage([own]));
    await settle();

    const page = harness.routeNativeElement!;
    const editButton = [...page.querySelectorAll<HTMLButtonElement>('button')]
      .find((button) => button.getAttribute('aria-label')?.includes('Editar') || button.textContent?.includes('Editar'))!;
    editButton.click();
    await settle();
    http.expectOne('/api/permissions').flush(PERMISSION_CATALOG);
    await settle();
    const dialog = page.querySelector<HTMLElement>('[role="dialog"]')!;
    const perfisBox = [...dialog.querySelectorAll<HTMLLabelElement>('label.permission-row')]
      .find((label) => label.textContent?.trim() === 'Gerenciar perfis e permissões')!
      .querySelector<HTMLInputElement>('input')!;
    perfisBox.click();
    await settle();
    dialog.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await settle();

    const withoutPerfis = admin.filter((permission) => permission !== 'perfis.gerir');
    http.expectOne({ method: 'PUT', url: '/api/profiles/1' }).flush({ ...own, permissions: withoutPerfis });
    http.expectOne((request) => request.url === '/api/profiles')
      .flush({ message: 'Acesso negado' }, { status: 403, statusText: 'Forbidden' });
    http.match('/api/auth/me').forEach((request) => request.flush(user(withoutPerfis)));
    await settle();

    expect(TestBed.inject(Router).url).toBe('/dashboard');
    const shell = harness.fixture.nativeElement as HTMLElement;
    expect(shell.textContent).not.toContain('atualizado com sucesso');
    expect(shell.textContent).not.toContain('Não foi possível carregar os perfis');
  });
});
