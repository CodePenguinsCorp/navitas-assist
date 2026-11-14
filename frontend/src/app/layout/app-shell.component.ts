import { DOCUMENT } from '@angular/common';
import { IconComponent } from '../shared/icon/icon.component';
import { NotificationBellComponent } from '../shared/notification-bell/notification-bell.component';
import { initialsOf } from '../core/utils/rma-ui';
import { Component, ElementRef, computed, effect, inject, signal, untracked, viewChild } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRouteSnapshot, NavigationEnd, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { EMPTY, distinctUntilChanged, filter, finalize, fromEvent, map, startWith, switchMap, timer } from 'rxjs';
import { NAV_GROUPS } from '../core/mock-data';
import { allowsPermissions, firstAllowedRoute } from '../core/navigation';
import { Permission } from '../core/permissions';
import { AuthService } from '../core/services/auth.service';
import { NotificationService } from '../core/services/notification.service';
import { PermissionService } from '../core/services/permission.service';

/** Same width as the CSS breakpoint where the expanded menu floats over the content. */
const NARROW_QUERY = '(max-width: 900px)';
const SIDEBAR_STORAGE_KEY = 'navitas.sidebar';

function readSidebarChoice(): boolean | null {
  try {
    const value = localStorage.getItem(SIDEBAR_STORAGE_KEY);
    return value === 'expanded' ? true : value === 'collapsed' ? false : null;
  } catch {
    return null;
  }
}

function writeSidebarChoice(expanded: boolean): void {
  try {
    localStorage.setItem(SIDEBAR_STORAGE_KEY, expanded ? 'expanded' : 'collapsed');
  } catch {
    // Storage unavailable: the choice lasts until the page is closed.
  }
}

@Component({
  selector: 'app-shell',
  imports: [RouterLink, RouterLinkActive, RouterOutlet, IconComponent, NotificationBellComponent],
  templateUrl: './app-shell.component.html',
  styles: [':host { display: block; }'],
  host: { '(document:keydown.escape)': 'closeOverlay(true)' }
})
export class AppShellComponent {
  private readonly document = inject(DOCUMENT);
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
        items: group.items.filter((item) => allowsPermissions(this.permissions, item.permissions, item.alternativePermissions))
      }))
      .filter((group) => group.items.length > 0)
  );

  protected readonly currentProfileName = computed(() => this.currentUser()?.profileName ?? '');

  private readonly toggleButton = viewChild<ElementRef<HTMLButtonElement>>('sidebarToggle');
  private readonly narrowQuery = this.document.defaultView?.matchMedia?.(NARROW_QUERY) ?? null;
  /** Up to 900px the menu is a rail; expanding it opens an overlay that closes on its own. */
  protected readonly narrow = signal(this.narrowQuery?.matches ?? false);
  private readonly wideExpanded = signal(readSidebarChoice() ?? true);
  private readonly overlayOpen = signal(false);
  protected readonly expanded = computed(() => this.narrow() ? this.overlayOpen() : this.wideExpanded());

  constructor() {
    fromEvent(this.document, 'visibilitychange').pipe(
      startWith(null),
      map(() => this.document.visibilityState === 'visible'),
      distinctUntilChanged(),
      switchMap((visible) => visible
        ? timer(0, 60_000).pipe(switchMap(() => this.notificationService.refreshSummary()))
        : EMPTY),
      takeUntilDestroyed()
    ).subscribe();
    if (this.narrowQuery) {
      fromEvent<MediaQueryListEvent>(this.narrowQuery, 'change').pipe(takeUntilDestroyed()).subscribe((event) => {
        this.overlayOpen.set(false);
        this.narrow.set(event.matches);
      });
    }
    this.router.events.pipe(
      filter((event) => event instanceof NavigationEnd),
      takeUntilDestroyed()
    ).subscribe(() => this.closeOverlay());
    // As permissões mudam após um 403 ou ao salvar o próprio perfil: a tela aberta é conferida de novo.
    effect(() => {
      this.permissions.permissions();
      untracked(() => this.leaveScreenIfForbidden());
    });
  }

  private leaveScreenIfForbidden(): void {
    let route: ActivatedRouteSnapshot | null = this.router.routerState.snapshot.root;
    while (route) {
      const required = (route.data['permissions'] as Permission[] | undefined) ?? [];
      const alternatives = (route.data['alternativePermissions'] as Permission[] | undefined) ?? [];
      if (!allowsPermissions(this.permissions, required, alternatives)) {
        void this.router.navigateByUrl(firstAllowedRoute(this.permissions));
        return;
      }
      route = route.firstChild;
    }
  }

  protected toggleSidebar(): void {
    if (this.narrow()) {
      this.overlayOpen.update((open) => !open);
      return;
    }
    const next = !this.wideExpanded();
    this.wideExpanded.set(next);
    writeSidebarChoice(next);
  }

  /** Closes the narrow-screen overlay (no-op on wide screens); Escape hands the focus back to the toggle. */
  protected closeOverlay(returnFocus = false): void {
    if (!this.overlayOpen()) return;
    this.overlayOpen.set(false);
    if (returnFocus) this.toggleButton()?.nativeElement.focus();
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
