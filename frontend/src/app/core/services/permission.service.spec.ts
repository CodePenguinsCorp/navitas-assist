import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { UserSession } from '../models';
import { Permission } from '../permissions';
import { AuthService } from './auth.service';
import { PermissionService } from './permission.service';

describe('PermissionService', () => {
  const session = signal<UserSession | null>(null);

  function service(): PermissionService {
    TestBed.configureTestingModule({
      providers: [{ provide: AuthService, useValue: { currentUser: session.asReadonly() } }],
    });
    return TestBed.inject(PermissionService);
  }

  function login(permissions: Permission[]): void {
    session.set({ username: 'tester', name: 'Tester', profileName: 'Perfil', permissions });
  }

  beforeEach(() => session.set(null));

  it('grants nothing without a session', () => {
    const permissions = service();

    expect(permissions.permissions().size).toBe(0);
    expect(permissions.hasPermission('rma.ver')).toBe(false);
    expect(permissions.hasAny(['rma.ver', 'pecas.ver'])).toBe(false);
    expect(permissions.hasAll(['rma.ver'])).toBe(false);
  });

  it('treats an empty list as all granted and none matched', () => {
    const permissions = service();

    expect(permissions.hasAll([])).toBe(true);
    expect(permissions.hasAny([])).toBe(false);
  });

  it('checks a partial set of permissions', () => {
    login(['rma.ver', 'pecas.ver']);
    const permissions = service();

    expect([...permissions.permissions()]).toEqual(['rma.ver', 'pecas.ver']);
    expect(permissions.hasPermission('pecas.ver')).toBe(true);
    expect(permissions.hasPermission('rma.abrir')).toBe(false);
    expect(permissions.hasAll(['rma.ver', 'pecas.ver'])).toBe(true);
    expect(permissions.hasAll(['rma.ver', 'rma.abrir'])).toBe(false);
    expect(permissions.hasAny(['rma.abrir', 'pecas.ver'])).toBe(true);
    expect(permissions.hasAny(['rma.abrir', 'rma.editar'])).toBe(false);
  });

  it('reacts to session changes', () => {
    const permissions = service();
    login(['rma.ver']);
    expect(permissions.hasPermission('rma.ver')).toBe(true);

    login(['relatorios.ver']);
    expect(permissions.hasPermission('rma.ver')).toBe(false);
    expect(permissions.hasPermission('relatorios.ver')).toBe(true);

    session.set(null);
    expect(permissions.permissions().size).toBe(0);
  });
});
