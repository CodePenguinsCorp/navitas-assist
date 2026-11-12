import { IconComponent } from '../shared/icon/icon.component';
import { initialsOf } from '../core/utils/rma-ui';
import { Component, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { finalize, switchMap, timer } from 'rxjs';
import { NAV_GROUPS } from '../core/mock-data';
import { AuthService } from '../core/services/auth.service';
import { NotificationService } from '../core/services/notification.service';
import { PermissionService } from '../core/services/permission.service';

const UNREAD_UNAVAILABLE = 'Contagem de não lidas indisponível';

@Component({
  selector: 'app-shell',
  imports: [RouterLink, RouterLinkActive, RouterOutlet, IconComponent],
  templateUrl: './app-shell.component.html',
  styles: [':host { display: block; }']
})
export class AppShellComponent {
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);
  private readonly notificationService = inject(NotificationService);
  private readonly permissions = inject(PermissionService);

  protected readonly currentUser = this.authService.currentUser;
  protected readonly unreadNotifications = this.notificationService.unreadCount;
  /** The count is shown only when the latest summary succeeded; otherwise it is unknown, not zero. */
  protected readonly unreadKnown = computed(() =>
    this.notificationService.summaryLoaded() && !this.notificationService.summaryLoadFailed());
  protected readonly unreadUnavailable = this.notificationService.summaryLoadFailed;
  protected readonly notificationsLabel = computed(() => {
    if (this.unreadUnavailable()) return `Notificações: ${UNREAD_UNAVAILABLE}`;
    if (!this.unreadKnown()) return 'Notificações';
    return `Notificações: ${this.unreadNotifications()} não lida(s)`;
  });
  protected readonly unreadUnavailableMessage = UNREAD_UNAVAILABLE;
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
