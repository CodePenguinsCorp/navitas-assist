import { IconComponent } from '../shared/icon/icon.component';
import { NotificationBellComponent } from '../shared/notification-bell/notification-bell.component';
import { initialsOf } from '../core/utils/rma-ui';
import { Component, computed, effect, inject, signal, untracked } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRouteSnapshot, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { finalize, switchMap, timer } from 'rxjs';
import { NAV_GROUPS } from '../core/mock-data';
import { firstAllowedRoute } from '../core/navigation';
import { Permission } from '../core/permissions';
import { AuthService } from '../core/services/auth.service';
import { NotificationService } from '../core/services/notification.service';
import { PermissionService } from '../core/services/permission.service';

@Component({
  selector: 'app-shell',
  imports: [RouterLink, RouterLinkActive, RouterOutlet, IconComponent, NotificationBellComponent],
  templateUrl: './app-shell.component.html',
  styles: [':host { display: block; }']
})
export class AppShellComponent {
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);
  private readonly notificationService = inject(NotificationService);
  private readonly permissions = inject(PermissionService);

  protected readonly currentUser = this.authService.currentUser;
  protected readonly loggingOut = signal(false);
  protected readonly logoutError = signal('');
  protected readonly initials = initialsOf;
  protected readonly visibleNavGroups = computed(() =>
    NAV_GROUPS
      .map((group) => ({
        ...group,
        items: group.items.filter((item) => this.permissions.hasAll(item.permissions))
      }))
      .filter((group) => group.items.length > 0)
  );

  protected readonly currentProfileName = computed(() => this.currentUser()?.profileName ?? '');

  constructor() {
    timer(0, 60_000).pipe(
      switchMap(() => this.notificationService.refreshSummary()),
      takeUntilDestroyed()
    ).subscribe();
    // As permissões mudam após um 403 ou ao salvar o próprio perfil: a tela aberta é conferida de novo.
    effect(() => {
      this.permissions.permissions();
      untracked(() => this.leaveScreenIfForbidden());
    });
  }

  private leaveScreenIfForbidden(): void {
    let route: ActivatedRouteSnapshot | null = this.router.routerState.snapshot.root;
    const required: Permission[] = [];
    while (route) {
      required.push(...((route.data['permissions'] as Permission[] | undefined) ?? []));
      route = route.firstChild;
    }
    if (!this.permissions.hasAll(required)) {
      void this.router.navigateByUrl(firstAllowedRoute(this.permissions));
    }
  }

  protected logout(): void {
    if (this.loggingOut()) return;
    this.loggingOut.set(true);
    this.logoutError.set('');
    this.authService.logout().pipe(
      finalize(() => this.loggingOut.set(false))
    ).subscribe({
      complete: () => void this.router.navigateByUrl('/login'),
      error: () => this.logoutError.set('Não foi possível confirmar o encerramento da sessão. Tente novamente.')
    });
  }
}
