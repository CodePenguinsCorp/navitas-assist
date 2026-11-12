import { HttpClient, HttpContext } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import { Observable, catchError, finalize, map, of, shareReplay, switchMap, tap } from 'rxjs';
import { AuthUserResponse, LoginPayload, UserSession } from '../models';
import { SKIP_GLOBAL_LOADING } from '../interceptors/loading.interceptor';
import { isPermission } from '../permissions';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);
  private readonly sessionSignal = signal<UserSession | null>(null);
  private readonly initializedSignal = signal(false);
  private restoreRequest$: Observable<UserSession | null> | null = null;
  private refreshRequest$: Observable<UserSession | null> | null = null;

  readonly currentUser = this.sessionSignal.asReadonly();
  readonly isAuthenticated = computed(() => this.sessionSignal() !== null);

  login(payload: LoginPayload): Observable<UserSession> {
    return this.ensureCsrfToken().pipe(
      switchMap(() => this.http.post<AuthUserResponse>('/api/auth/login', {
        username: payload.username.trim(),
        password: payload.password
      })),
      map((user) => this.toSession(user)),
      tap((session) => {
        this.sessionSignal.set(session);
        this.initializedSignal.set(true);
      })
    );
  }

  logout(): Observable<void> {
    return this.ensureCsrfToken().pipe(
      switchMap(() => this.http.post<void>('/api/auth/logout', {})),
      tap(() => {
        this.sessionSignal.set(null);
        this.initializedSignal.set(true);
      })
    );
  }

  restoreSession(): Observable<UserSession | null> {
    if (this.initializedSignal()) {
      return of(this.sessionSignal());
    }

    if (!this.restoreRequest$) {
      this.restoreRequest$ = this.fetchCurrentUser().pipe(
        tap((session) => this.sessionSignal.set(session)),
        catchError(() => {
          this.sessionSignal.set(null);
          return of(null);
        }),
        finalize(() => this.initializedSignal.set(true)),
        shareReplay({ bufferSize: 1, refCount: false })
      );
    }

    return this.restoreRequest$;
  }

  /** Relê `/api/auth/me` (sem o pop-up global) e atualiza a sessão. Chamadas simultâneas compartilham a requisição. */
  refreshSession(): Observable<UserSession | null> {
    if (!this.refreshRequest$) {
      this.refreshRequest$ = this.fetchCurrentUser().pipe(
        tap((session) => this.sessionSignal.set(session)),
        // 401 já é tratado pelo authErrorInterceptor; nas demais falhas a sessão atual continua valendo.
        catchError(() => of(this.sessionSignal())),
        finalize(() => this.refreshRequest$ = null),
        shareReplay({ bufferSize: 1, refCount: false })
      );
    }

    return this.refreshRequest$;
  }

  /** Encerra a sessão local sem chamar a API (sessão já expirada no servidor). */
  clearSession(): void {
    this.sessionSignal.set(null);
    this.initializedSignal.set(true);
  }

  private ensureCsrfToken(): Observable<unknown> {
    return this.http.get('/api/auth/csrf');
  }

  private fetchCurrentUser(): Observable<UserSession> {
    return this.http.get<AuthUserResponse>('/api/auth/me', {
      context: new HttpContext().set(SKIP_GLOBAL_LOADING, true)
    }).pipe(map((user) => this.toSession(user)));
  }

  private toSession(user: AuthUserResponse): UserSession {
    return {
      username: user.username,
      name: user.fullName || user.username,
      profileName: user.profile?.name ?? '',
      permissions: (user.permissions ?? []).filter(isPermission)
    };
  }
}
