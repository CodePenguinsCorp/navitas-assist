import { TestBed } from '@angular/core/testing';
import { LegacyProfileCode, profilePermissions, providePermissions } from '../testing/permission-fixtures';
import { NAV_GROUPS } from './mock-data';
import { firstAllowedRoute } from './navigation';
import { Permission } from './permissions';
import { PermissionService } from './services/permission.service';

function routeFor(permissions: readonly Permission[]): string {
  TestBed.configureTestingModule({ providers: [providePermissions(permissions)] });
  return firstAllowedRoute(TestBed.inject(PermissionService));
}

describe('firstAllowedRoute', () => {
  it('permite acessar cadastros somente com importacao sem edicao', () => {
    expect(routeFor(['cadastros.importar' as Permission])).toBe('/clientes');
  });
  it.each(['ADMIN', 'SERVICE_DESK', 'TECHNICIAN', 'VIEWER'] as LegacyProfileCode[])(
    'sends the %s profile to the dashboard',
    (code) => {
      expect(routeFor(profilePermissions(code))).toBe('/dashboard');
    },
  );

  it('ignores nav items without permissions', () => {
    // Notificações vem antes de Peças e Relatórios no menu, mas não exige permissão.
    expect(routeFor(['relatorios.ver'])).toBe('/relatorios');
  });

  it('follows the menu order', () => {
    expect(routeFor(['relatorios.ver', 'pecas.ver'])).toBe('/pecas');
  });

  it('requires every permission of the item', () => {
    expect(routeFor(['cadastros.ver'])).toBe('/notificacoes');
  });

  it('accepts an item once all of its permissions are held', () => {
    expect(routeFor(['cadastros.ver', 'cadastros.editar'])).toBe('/clientes');
  });

  it('falls back to notifications when nothing is allowed', () => {
    expect(routeFor([])).toBe('/notificacoes');
  });
});

describe('NAV_GROUPS', () => {
  it('lists the menu with the permissions of spec §3.2', () => {
    const menu = NAV_GROUPS.map((group) => [group.label, group.items.map((item) => [item.route, item.icon, item.permissions])]);
    expect(menu).toEqual([
      ['Operação', [
        ['/dashboard', 'dashboard', ['rma.ver']],
        ['/rmas', 'clipboard', ['rma.ver']],
        ['/kanban', 'columns', ['rma.ver']],
        ['/notificacoes', 'bell', []],
        ['/pecas', 'chip', ['pecas.ver']],
      ]],
      ['Cadastros', [
        ['/clientes', 'building', ['cadastros.ver', 'cadastros.editar']],
        ['/produtos', 'box', ['cadastros.ver', 'cadastros.editar']],
        ['/protocolos', 'checklist', ['protocolos.ver', 'protocolos.catalogo']],
        ['/usuarios', 'users', ['usuarios.gerir']],
        ['/perfis', 'shield', ['perfis.gerir']],
        ['/auditoria', 'checklist', ['auditoria.ver']],
      ]],
      ['Relatórios', [
        ['/relatorios', 'chart', ['relatorios.ver']],
      ]],
    ]);
    expect(NAV_GROUPS[1].items.at(-1)?.label).toBe('Auditoria');
  });
});
