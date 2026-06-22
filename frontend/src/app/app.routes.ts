import { Routes } from '@angular/router';
import { authGuard } from './guards/auth.guard';
import { roleGuard } from './guards/role.guard';
import { AppShellComponent } from './layout/app-shell.component';
import { DashboardComponent } from './pages/dashboard/dashboard.component';
import { LoginComponent } from './pages/login/login.component';
import { ClientsComponent } from './pages/clients/clients.component';
import { ProductsComponent } from './pages/products/products.component';
import { ReportsComponent } from './pages/reports/reports.component';
import { RmasComponent } from './pages/rmas/rmas.component';
import { UsersComponent } from './pages/users/users.component';

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
        component: DashboardComponent,
        title: 'Dashboard | Navitas Assist'
      },
      {
        path: 'rmas',
        component: RmasComponent,
        title: 'RMAs | Navitas Assist'
      },
      {
        path: 'cadastros',
        pathMatch: 'full',
        redirectTo: 'clientes'
      },
      {
        path: 'clientes',
        component: ClientsComponent,
        canActivate: [roleGuard],
        data: {
          roles: ['ADMIN', 'SERVICE_DESK']
        },
        title: 'Clientes | Navitas Assist'
      },
      {
        path: 'produtos',
        component: ProductsComponent,
        canActivate: [roleGuard],
        data: {
          roles: ['ADMIN', 'SERVICE_DESK']
        },
        title: 'Produtos | Navitas Assist'
      },
      {
        path: 'usuarios',
        component: UsersComponent,
        canActivate: [roleGuard],
        data: {
          roles: ['ADMIN']
        },
        title: 'Usuários | Navitas Assist'
      },
      {
        path: 'relatorios',
        component: ReportsComponent,
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
