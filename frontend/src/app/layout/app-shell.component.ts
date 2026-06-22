import { Component, computed, inject } from '@angular/core';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { NAV_GROUPS, ROLE_LABELS } from '../core/mock-data';
import { AuthService } from '../core/services/auth.service';

@Component({
  selector: 'app-shell',
  imports: [RouterLink, RouterLinkActive, RouterOutlet],
  templateUrl: './app-shell.component.html',
  styles: [':host { display: block; }']
})
export class AppShellComponent {
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);

  protected readonly currentUser = this.authService.currentUser;
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

  protected logout(): void {
    this.authService.logout();
    void this.router.navigateByUrl('/login');
  }
}
