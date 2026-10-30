import { TestBed } from '@angular/core/testing';
import {
  ActivatedRouteSnapshot,
  Router,
  RouterStateSnapshot,
  UrlTree,
  provideRouter,
} from '@angular/router';
import { Observable, firstValueFrom, of } from 'rxjs';
import { UserRole, UserSession } from '../core/models';
import { AuthService } from '../core/services/auth.service';
import { authGuard } from './auth.guard';
import { roleGuard } from './role.guard';

describe('route guards', () => {
  const auth = {
    session: null as UserSession | null,
    restoreSession: () => of(auth.session),
    hasAnyRole: (roles: UserRole[]) => auth.session !== null && roles.includes(auth.session.role),
  };

  beforeEach(() => {
    auth.session = null;
    TestBed.configureTestingModule({
      providers: [provideRouter([]), { provide: AuthService, useValue: auth }],
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
    auth.session = session('VIEWER');
    await expect(runGuard(authGuard, route(), state('/dashboard'))).resolves.toBe(true);
  });

  it('allows configured roles and redirects forbidden roles to the dashboard', async () => {
    auth.session = session('SERVICE_DESK');
    await expect(
      runGuard(roleGuard, route(['ADMIN', 'SERVICE_DESK']), state('/clientes')),
    ).resolves.toBe(true);

    auth.session = session('VIEWER');
    const result = await runGuard(roleGuard, route(['ADMIN']), state('/usuarios'));
    expect(TestBed.inject(Router).serializeUrl(result as UrlTree)).toBe('/dashboard');
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

function route(roles: UserRole[] = []): ActivatedRouteSnapshot {
  return { data: { roles } } as unknown as ActivatedRouteSnapshot;
}

function state(url: string): RouterStateSnapshot {
  return { url } as RouterStateSnapshot;
}

function session(role: UserRole): UserSession {
  return { username: 'tester', name: 'Tester', role };
}
