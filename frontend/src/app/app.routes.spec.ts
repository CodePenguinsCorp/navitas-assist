import { Route } from '@angular/router';
import { routes } from './app.routes';
import { authGuard } from './guards/auth.guard';
import { permissionGuard } from './guards/permission.guard';
import { NAV_GROUPS } from './core/mock-data';
import { AppShellComponent } from './layout/app-shell.component';
import { LoginComponent } from './pages/login/login.component';

// Page classes are compared by name so this fixture never imports the lazy pages statically.
const shell = () => routes.find((route) => route.path === '' && route.children)!;
const child = (path: string) => shell().children!.find((route) => route.path === path)!;

async function resolveLazy(route: Route): Promise<string> {
  const loaded = await (route.loadComponent as () => Promise<{ name: string }>)();
  return loaded.name.replace(/^_+/, '');
}

describe('app routes', () => {
  describe('new: pages load on demand', () => {
    it.each([
      ['dashboard', 'DashboardComponent'],
      ['rmas', 'RmasComponent'],
      ['kanban', 'KanbanComponent'],
      ['clientes', 'ClientsComponent'],
      ['produtos', 'ProductsComponent'],
      ['usuarios', 'UsersComponent'],
      ['perfis', 'ProfilesComponent'],
    ])('resolves %s lazily to %s', async (path, componentName) => {
      const route = child(path);
      expect(route.component).toBeUndefined();
      expect(typeof route.loadComponent).toBe('function');
      expect(await resolveLazy(route)).toBe(componentName);
    });
  });

  describe('preservation', () => {
    it('keeps login and the authenticated shell eager', () => {
      const login = routes.find((route) => route.path === 'login')!;
      expect(login.component).toBe(LoginComponent);
      expect(login.title).toBe('Entrar | Navitas Assist');
      expect(shell().component).toBe(AppShellComponent);
      expect(shell().canActivate).toEqual([authGuard]);
    });

    it('keeps titles and guards every page with the permissions of spec §3.2', () => {
      const expected: Record<string, { title: string; permissions?: string[] }> = {
        dashboard: { title: 'Dashboard | Navitas Assist', permissions: ['rma.ver'] },
        rmas: { title: 'RMAs | Navitas Assist', permissions: ['rma.ver'] },
        kanban: { title: 'Kanban | Navitas Assist', permissions: ['rma.ver'] },
        notificacoes: { title: 'Notificações | Navitas Assist' },
        pecas: { title: 'Peças | Navitas Assist', permissions: ['pecas.ver'] },
        clientes: { title: 'Clientes | Navitas Assist', permissions: ['cadastros.ver', 'cadastros.editar'] },
        produtos: { title: 'Produtos | Navitas Assist', permissions: ['cadastros.ver', 'cadastros.editar'] },
        protocolos: { title: 'Protocolos | Navitas Assist', permissions: ['protocolos.ver', 'protocolos.catalogo'] },
        usuarios: { title: 'Usuários | Navitas Assist', permissions: ['usuarios.gerir'] },
        perfis: { title: 'Perfis | Navitas Assist', permissions: ['perfis.gerir'] },
        relatorios: { title: 'Relatórios | Navitas Assist', permissions: ['relatorios.ver'] },
      };
      for (const [path, { title, permissions }] of Object.entries(expected)) {
        const route = child(path);
        expect(route.title, path).toBe(title);
        if (permissions) {
          expect(route.canActivate, path).toEqual([permissionGuard]);
          expect(route.data, path).toEqual({ permissions });
        } else {
          expect(route.canActivate, path).toBeUndefined();
          expect(route.data, path).toBeUndefined();
        }
      }
    });

    it('guards each page with the same permissions as its menu item', () => {
      // O guard redireciona para o primeiro item do menu permitido; se menu e rota divergissem, haveria laço.
      for (const item of NAV_GROUPS.flatMap((group) => group.items)) {
        const route = shell().children!.find((candidate) => `/${candidate.path}` === item.route);
        if (!route) continue;
        expect(route.data?.['permissions'] ?? [], item.route).toEqual(item.permissions);
      }
    });

    it('keeps the redirects', () => {
      expect(child('')).toMatchObject({ pathMatch: 'full', redirectTo: 'dashboard' });
      expect(child('cadastros')).toMatchObject({ pathMatch: 'full', redirectTo: 'clientes' });
      expect(routes.at(-1)).toEqual({ path: '**', redirectTo: '' });
    });

    it.each([
      ['notificacoes', 'NotificationsComponent'],
      ['pecas', 'PartsComponent'],
      ['protocolos', 'ProtocolsComponent'],
      ['relatorios', 'ReportsComponent'],
    ])('keeps %s lazy', async (path, componentName) => {
      expect(await resolveLazy(child(path))).toBe(componentName);
    });
  });
});
