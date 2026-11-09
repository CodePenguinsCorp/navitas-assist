import { Routes } from '@angular/router';
import { authGuard } from './guards/auth.guard';
import { roleGuard } from './guards/role.guard';
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
        title: 'Dashboard | Navitas Assist'
      },
      {
        path: 'rmas',
        loadComponent: () => import('./pages/rmas/rmas.component').then((module) => module.RmasComponent),
        title: 'RMAs | Navitas Assist'
      },
      {
        path: 'kanban',
        loadComponent: () => import('./pages/kanban/kanban.component').then((module) => module.KanbanComponent),
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
        canActivate: [roleGuard],
        data: {
          roles: ['ADMIN', 'SERVICE_DESK']
        },
        title: 'Clientes | Navitas Assist'
      },
      {
        path: 'produtos',
        loadComponent: () => import('./pages/products/products.component').then((module) => module.ProductsComponent),
        canActivate: [roleGuard],
        data: {
          roles: ['ADMIN', 'SERVICE_DESK']
        },
        title: 'Produtos | Navitas Assist'
      },
      {
        path: 'protocolos',
        loadComponent: () => import('./pages/protocols/protocols.component').then((module) => module.ProtocolsComponent),
        canActivate: [roleGuard],
        data: {
          roles: ['ADMIN']
        },
        title: 'Protocolos | Navitas Assist'
      },
      {
        path: 'usuarios',
        loadComponent: () => import('./pages/users/users.component').then((module) => module.UsersComponent),
        canActivate: [roleGuard],
        data: {
          roles: ['ADMIN']
        },
        title: 'Usuários | Navitas Assist'
      },
      {
        path: 'relatorios',
        loadComponent: () => import('./pages/reports/reports.component').then((module) => module.ReportsComponent),
        canActivate: [roleGuard],
        data: {
          roles: ['ADMIN', 'TECHNICIAN', 'VIEWER']
        },
        title: 'Relatórios | Navitas Assist'
      }
    ]
  },
  {
    path: '**',
    redirectTo: ''
  }
];
