import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import { Observable } from 'rxjs';
import { map, tap } from 'rxjs/operators';
import { AuthUserResponse, LoginPayload, UserRole, UserSession } from '../models';

const STORAGE_KEY = 'navitas-assist.session';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);
  private readonly sessionSignal = signal<UserSession | null>(this.restoreSession());

  readonly currentUser = this.sessionSignal.asReadonly();
  readonly isAuthenticated = computed(() => this.sessionSignal() !== null);

  login(payload: LoginPayload): Observable<UserSession> {
    const username = payload.username.trim();
    const authHeader = this.createBasicAuthHeader(username, payload.password);

    return this.http.get<AuthUserResponse>('/api/auth/me', {
      headers: new HttpHeaders({
        Authorization: authHeader
      })
    }).pipe(
      map((user) => ({
        username: user.username,
        name: user.fullName || user.username,
        role: user.role,
        authHeader
      })),
      tap((session) => this.persistSession(session))
    );
  }

  logout(): void {
    this.sessionSignal.set(null);
    localStorage.removeItem(STORAGE_KEY);
  }

  hasAnyRole(roles: UserRole[]): boolean {
    const session = this.sessionSignal();
    if (!session) {
      return false;
    }

    return roles.includes(session.role);
  }

  getAuthorizationHeader(): string | null {
    return this.sessionSignal()?.authHeader ?? null;
  }

  private persistSession(session: UserSession): void {
    this.sessionSignal.set(session);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
  }

  private restoreSession(): UserSession | null {
    const rawValue = localStorage.getItem(STORAGE_KEY);
    if (!rawValue) {
      return null;
    }

    try {
      return JSON.parse(rawValue) as UserSession;
    } catch {
      localStorage.removeItem(STORAGE_KEY);
      return null;
    }
  }

  private createBasicAuthHeader(username: string, password: string): string {
    return `Basic ${btoa(`${username}:${password}`)}`;
  }
}
