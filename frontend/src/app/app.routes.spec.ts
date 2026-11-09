import { Route } from '@angular/router';
import { routes } from './app.routes';
import { authGuard } from './guards/auth.guard';
import { roleGuard } from './guards/role.guard';
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

    it('keeps titles, guards and roles of every page', () => {
      const expected: Record<string, { title: string; roles?: string[] }> = {
        dashboard: { title: 'Dashboard | Navitas Assist' },
        rmas: { title: 'RMAs | Navitas Assist' },
        kanban: { title: 'Kanban | Navitas Assist' },
        notificacoes: { title: 'Notificações | Navitas Assist' },
        pecas: { title: 'Peças | Navitas Assist' },
        clientes: { title: 'Clientes | Navitas Assist', roles: ['ADMIN', 'SERVICE_DESK'] },
        produtos: { title: 'Produtos | Navitas Assist', roles: ['ADMIN', 'SERVICE_DESK'] },
        protocolos: { title: 'Protocolos | Navitas Assist', roles: ['ADMIN'] },
        usuarios: { title: 'Usuários | Navitas Assist', roles: ['ADMIN'] },
        relatorios: { title: 'Relatórios | Navitas Assist', roles: ['ADMIN', 'TECHNICIAN', 'VIEWER'] },
      };
      for (const [path, { title, roles }] of Object.entries(expected)) {
        const route = child(path);
        expect(route.title, path).toBe(title);
        if (roles) {
          expect(route.canActivate, path).toEqual([roleGuard]);
          expect(route.data?.['roles'], path).toEqual(roles);
        } else {
          expect(route.canActivate, path).toBeUndefined();
        }
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
