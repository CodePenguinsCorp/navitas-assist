import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import {
  ActivatedRouteSnapshot,
  Router,
  RouterStateSnapshot,
  UrlTree,
  provideRouter,
} from '@angular/router';
import { Observable, Subject, firstValueFrom, of } from 'rxjs';
import { UserSession } from '../core/models';
import { Permission } from '../core/permissions';
import { AuthService } from '../core/services/auth.service';
import { profilePermissions, providePermissions } from '../testing/permission-fixtures';
import { authGuard } from './auth.guard';
import { permissionGuard } from './permission.guard';

describe('route guards', () => {
  const granted = signal<readonly Permission[]>([]);
  const auth = {
    session: null as UserSession | null,
    restore: null as Observable<UserSession | null> | null,
    restoreSession: () => auth.restore ?? of(auth.session),
  };

  beforeEach(() => {
    auth.session = null;
    auth.restore = null;
    granted.set([]);
    TestBed.configureTestingModule({
      providers: [provideRouter([]), { provide: AuthService, useValue: auth }, providePermissions(granted)],
    });
  });

  it('redirects anonymous users to login while preserving the target URL', async () => {
    const result = await runGuard(authGuard, route(), state('/rmas'));

    expect(result).toBeInstanceOf(UrlTree);
    expect(TestBed.inject(Router).serializeUrl(result as UrlTree)).toBe(
      '/login?redirectTo=%2Frmas',
    );
  });

  it('allows authenticated users through the authentication guard', async () => {
    auth.session = session();
    await expect(runGuard(authGuard, route(), state('/dashboard'))).resolves.toBe(true);
  });

  it('allows configured profiles and redirects forbidden profiles to the dashboard', async () => {
    granted.set(profilePermissions('SERVICE_DESK'));
    await expect(
      runGuard(permissionGuard, route(['cadastros.ver', 'cadastros.editar']), state('/clientes')),
    ).resolves.toBe(true);

    granted.set(profilePermissions('VIEWER'));
    const result = await runGuard(permissionGuard, route(['usuarios.gerir']), state('/usuarios'));
    expect(serialize(result)).toBe('/dashboard');
  });

  it('allows when all route permissions are held', async () => {
    granted.set(['protocolos.ver', 'protocolos.catalogo']);
    await expect(
      runGuard(permissionGuard, route(['protocolos.ver', 'protocolos.catalogo']), state('/protocolos')),
    ).resolves.toBe(true);

    granted.set(['protocolos.ver']);
    const result = await runGuard(permissionGuard, route(['protocolos.ver', 'protocolos.catalogo']), state('/protocolos'));
    expect(result).toBeInstanceOf(UrlTree);
  });

  it('allows a route without permissions', async () => {
    await expect(runGuard(permissionGuard, route(), state('/notificacoes'))).resolves.toBe(true);
  });

  it('waits for session restore before deciding', async () => {
    const restore = new Subject<UserSession | null>();
    auth.restore = restore;
    let decided: boolean | UrlTree | undefined;
    const pending = runGuard(permissionGuard, route(['rma.ver']), state('/rmas')).then((result) => decided = result);

    await Promise.resolve();
    expect(decided).toBeUndefined();

    granted.set(['rma.ver']);
    restore.next(session());
    restore.complete();
    await pending;
    expect(decided).toBe(true);
  });

  it('redirects to the first allowed nav route', async () => {
    granted.set(['pecas.ver']);
    const result = await runGuard(permissionGuard, route(['rma.ver']), state('/dashboard'));
    expect(serialize(result)).toBe('/pecas');
  });

  it('redirects to notifications when no nav route is allowed', async () => {
    const result = await runGuard(permissionGuard, route(['rma.ver']), state('/dashboard'));
    expect(serialize(result)).toBe('/notificacoes');
  });
});

type Guard = typeof authGuard;

function runGuard(
  guard: Guard,
  activatedRoute: ActivatedRouteSnapshot,
  routerState: RouterStateSnapshot,
): Promise<boolean | UrlTree> {
  return TestBed.runInInjectionContext(() =>
    firstValueFrom(guard(activatedRoute, routerState) as Observable<boolean | UrlTree>),
  );
}

function serialize(result: boolean | UrlTree): string {
  expect(result).toBeInstanceOf(UrlTree);
  return TestBed.inject(Router).serializeUrl(result as UrlTree);
}

function route(permissions?: Permission[]): ActivatedRouteSnapshot {
  return { data: permissions ? { permissions } : {} } as unknown as ActivatedRouteSnapshot;
}

function state(url: string): RouterStateSnapshot {
  return { url } as RouterStateSnapshot;
}

function session(): UserSession {
  return { username: 'tester', name: 'Tester', profileName: 'Perfil', permissions: [] };
}
