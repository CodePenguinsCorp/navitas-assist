import { Injectable, InjectionToken, Signal, computed, inject } from '@angular/core';
import { Permission } from '../permissions';
import { AuthService } from './auth.service';

/** Origem das permissões da sessão. Os testes trocam por `providePermissions` (testing/permission-fixtures). */
export const PERMISSION_SOURCE = new InjectionToken<Signal<readonly Permission[]>>('PERMISSION_SOURCE', {
  providedIn: 'root',
  factory: () => {
    const auth = inject(AuthService);
    return computed(() => auth.currentUser()?.permissions ?? []);
  }
});

/** Único ponto de checagem de permissões nas telas. */
@Injectable({ providedIn: 'root' })
export class PermissionService {
  private readonly source = inject(PERMISSION_SOURCE);

  readonly permissions: Signal<ReadonlySet<Permission>> = computed(() => new Set(this.source()));

  hasPermission(permission: Permission): boolean {
    return this.permissions().has(permission);
  }

  /** Lista vazia vale como concedida. */
  hasAll(permissions: readonly Permission[]): boolean {
    const granted = this.permissions();
    return permissions.every((permission) => granted.has(permission));
  }

  /** Lista vazia não concede nada. */
  hasAny(permissions: readonly Permission[]): boolean {
    const granted = this.permissions();
    return permissions.some((permission) => granted.has(permission));
  }
}
