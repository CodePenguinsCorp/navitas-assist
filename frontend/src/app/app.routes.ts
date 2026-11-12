import { Routes } from '@angular/router';
import { authGuard } from './guards/auth.guard';
import { permissionGuard } from './guards/permission.guard';
import { AppShellComponent } from './layout/app-shell.component';
import { LoginComponent } from './pages/login/login.component';

export const routes: Routes = [
  {
    path: 'login',
    component: LoginComponent,
    title: 'Entrar | Navitas Assist'
  },
  {
    path: '',
    component: AppShellComponent,
    canActivate: [authGuard],
    children: [
      {
        path: '',
        pathMatch: 'full',
        redirectTo: 'dashboard'
      },
      {
        path: 'dashboard',
        loadComponent: () => import('./pages/dashboard/dashboard.component').then((module) => module.DashboardComponent),
        canActivate: [permissionGuard],
        data: { permissions: ['rma.ver'] },
        title: 'Dashboard | Navitas Assist'
      },
      {
        path: 'rmas',
        loadComponent: () => import('./pages/rmas/rmas.component').then((module) => module.RmasComponent),
        canActivate: [permissionGuard],
        data: { permissions: ['rma.ver'] },
        title: 'RMAs | Navitas Assist'
      },
      {
        path: 'kanban',
        loadComponent: () => import('./pages/kanban/kanban.component').then((module) => module.KanbanComponent),
        canActivate: [permissionGuard],
        data: { permissions: ['rma.ver'] },
        title: 'Kanban | Navitas Assist'
      },
      {
        path: 'notificacoes',
        loadComponent: () => import('./pages/notifications/notifications.component').then((module) => module.NotificationsComponent),
        title: 'Notificações | Navitas Assist'
      },
      {
        path: 'pecas',
        loadComponent: () => import('./pages/parts/parts.component').then((module) => module.PartsComponent),
        canActivate: [permissionGuard],
        data: { permissions: ['pecas.ver'] },
        title: 'Peças | Navitas Assist'
      },
      {
        path: 'cadastros',
        pathMatch: 'full',
        redirectTo: 'clientes'
      },
      {
        path: 'clientes',
        loadComponent: () => import('./pages/clients/clients.component').then((module) => module.ClientsComponent),
        canActivate: [permissionGuard],
        data: { permissions: ['cadastros.ver', 'cadastros.editar'] },
        title: 'Clientes | Navitas Assist'
      },
      {
        path: 'produtos',
        loadComponent: () => import('./pages/products/products.component').then((module) => module.ProductsComponent),
        canActivate: [permissionGuard],
        data: { permissions: ['cadastros.ver', 'cadastros.editar'] },
        title: 'Produtos | Navitas Assist'
      },
      {
        path: 'protocolos',
        loadComponent: () => import('./pages/protocols/protocols.component').then((module) => module.ProtocolsComponent),
        canActivate: [permissionGuard],
        data: { permissions: ['protocolos.ver', 'protocolos.catalogo'] },
        title: 'Protocolos | Navitas Assist'
      },
      {
        path: 'usuarios',
        loadComponent: () => import('./pages/users/users.component').then((module) => module.UsersComponent),
        canActivate: [permissionGuard],
        data: { permissions: ['usuarios.gerir'] },
        title: 'Usuários | Navitas Assist'
      },
      {
        path: 'relatorios',
        loadComponent: () => import('./pages/reports/reports.component').then((module) => module.ReportsComponent),
        canActivate: [permissionGuard],
        data: { permissions: ['relatorios.ver'] },
        title: 'Relatórios | Navitas Assist'
      }
    ]
  },
  {
    path: '**',
    redirectTo: ''
  }
];
