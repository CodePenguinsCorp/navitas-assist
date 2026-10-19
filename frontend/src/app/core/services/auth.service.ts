import { HttpClient } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import { Observable, catchError, finalize, map, of, shareReplay, switchMap, tap } from 'rxjs';
import { AuthUserResponse, LoginPayload, UserRole, UserSession } from '../models';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);
  private readonly sessionSignal = signal<UserSession | null>(null);
  private readonly initializedSignal = signal(false);
  private restoreRequest$: Observable<UserSession | null> | null = null;

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
      finalize(() => {
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
      this.restoreRequest$ = this.http.get<AuthUserResponse>('/api/auth/me').pipe(
        map((user) => this.toSession(user)),
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

  hasAnyRole(roles: UserRole[]): boolean {
    const session = this.sessionSignal();
    if (!session) {
      return false;
    }

    return roles.includes(session.role);
  }

  private ensureCsrfToken(): Observable<unknown> {
    return this.http.get('/api/auth/csrf');
  }

  private toSession(user: AuthUserResponse): UserSession {
    return {
      username: user.username,
      name: user.fullName || user.username,
      role: user.role
    };
  }
}
