import { Component, computed, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { switchMap, timer } from 'rxjs';
import { NAV_GROUPS, ROLE_LABELS } from '../core/mock-data';
import { AuthService } from '../core/services/auth.service';
import { NotificationService } from '../core/services/notification.service';

@Component({
  selector: 'app-shell',
  imports: [RouterLink, RouterLinkActive, RouterOutlet],
  templateUrl: './app-shell.component.html',
  styles: [':host { display: block; }']
})
export class AppShellComponent {
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);
  private readonly notificationService = inject(NotificationService);

  protected readonly currentUser = this.authService.currentUser;
  protected readonly unreadNotifications = this.notificationService.unreadCount;
  protected readonly visibleNavGroups = computed(() =>
    NAV_GROUPS
      .map((group) => ({
        ...group,
        items: group.items.filter((item) => this.authService.hasAnyRole(item.roles))
      }))
      .filter((group) => group.items.length > 0)
  );

  protected readonly currentRoleLabel = computed(() => {
    const currentUser = this.currentUser();
    return currentUser ? ROLE_LABELS[currentUser.role] : ROLE_LABELS.VIEWER;
  });

  constructor() {
    timer(0, 60_000).pipe(
      switchMap(() => this.notificationService.refreshSummary()),
      takeUntilDestroyed()
    ).subscribe();
  }

  protected logout(): void {
    this.authService.logout().subscribe({
      complete: () => void this.router.navigateByUrl('/login'),
      error: () => void this.router.navigateByUrl('/login')
    });
  }
}
