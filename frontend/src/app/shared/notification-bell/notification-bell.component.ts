import { Component, DestroyRef, ElementRef, Injector, afterNextRender, computed, inject, signal, viewChild } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NavigationStart, Router, RouterLink } from '@angular/router';
import { Observable, Subscription, filter, finalize } from 'rxjs';
import { NotificationResponse } from '../../core/models';
import { ClockService } from '../../core/services/clock.service';
import { NotificationService } from '../../core/services/notification.service';
import { extractHttpErrorMessage } from '../../core/utils/catalog-ui';
import {
  NOTIFICATION_SEVERITY_LABELS,
  formatNotificationDateTime,
  formatNotificationTime,
  followNotification,
  groupNotificationsByDay,
  severityClass
} from '../../core/utils/notification-ui';
import { NotificationDetailModalComponent } from '../notification-detail-modal/notification-detail-modal.component';
import { IconComponent } from '../icon/icon.component';
import { RowActionComponent } from '../row-action/row-action.component';

const UNREAD_UNAVAILABLE = 'Contagem de não lidas indisponível';
/** The popover is a glance at the latest items; the full inbox lives at /notificacoes. */
const RECENT_LIMIT = 20;
/** The popover must stay open: its calls never raise the global loading dialog, which would steal focus and close it. */
const SILENT = { silent: true } as const;

let nextPanelId = 0;

/**
 * Shell bell: shows the shared unread count and opens a popover with the recent notifications.
 * The count itself is refreshed by the shell polling; the popover only reads and acts on it.
 */
@Component({
  selector: 'app-notification-bell',
  imports: [IconComponent, NotificationDetailModalComponent, RowActionComponent, RouterLink],
  templateUrl: './notification-bell.component.html',
  styleUrl: './notification-bell.component.css',
  host: {
    '(document:pointerdown)': 'onDocumentPointerDown($event)',
    '(document:keydown.escape)': 'onEscape()',
    '(focusout)': 'onFocusOut($event)'
  }
})
export class NotificationBellComponent {
  private readonly notificationService = inject(NotificationService);
  private readonly router = inject(Router);
  private readonly clock = inject(ClockService);
  private readonly host: ElementRef<HTMLElement> = inject(ElementRef);
  private readonly injector = inject(Injector);
  private readonly destroyRef = inject(DestroyRef);
  private readonly trigger = viewChild.required<ElementRef<HTMLButtonElement>>('trigger');
  private readonly panel = viewChild<ElementRef<HTMLElement>>('panel');
  private listRequest?: Subscription;

  protected readonly panelId = `notification-bell-panel-${nextPanelId++}`;
  protected readonly open = signal(false);
  protected readonly unreadOnly = signal(false);
  protected readonly loading = signal(false);
  protected readonly loaded = signal(false);
  protected readonly loadError = signal('');
  protected readonly actionError = signal('');
  protected readonly busy = signal(false);
  protected readonly notifications = signal<NotificationResponse[]>([]);
  /** Notification shown in the detail dialog; a snapshot kept in sync by the actions that change it. */
  protected readonly selected = signal<NotificationResponse | null>(null);
  protected readonly bellElement = computed(() => this.trigger().nativeElement);

  protected readonly unreadCount = this.notificationService.unreadCount;
  /** The count is shown only when the latest summary succeeded; otherwise it is unknown, not zero. */
  protected readonly unreadKnown = computed(() =>
    this.notificationService.summaryLoaded() && !this.notificationService.summaryLoadFailed());
  protected readonly unreadUnavailable = this.notificationService.summaryLoadFailed;
  protected readonly label = computed(() => {
    if (this.unreadUnavailable()) return `Notificações: ${UNREAD_UNAVAILABLE}`;
    if (!this.unreadKnown()) return 'Notificações';
    return `Notificações: ${this.unreadCount()} não lida(s)`;
  });
  protected readonly unreadUnavailableMessage = UNREAD_UNAVAILABLE;
  protected readonly groups = computed(() => {
    const recent = [...this.notifications()]
      .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
      .slice(0, RECENT_LIMIT);
    return groupNotificationsByDay(recent, this.clock.now());
  });
  private readonly visibleItems = computed(() => this.groups().flatMap((group) => group.items));
  private readonly selectedIndex = computed(() => {
    const current = this.selected();
    return current ? this.visibleItems().findIndex((item) => item.id === current.id) : -1;
  });
  protected readonly hasPreviousSelected = computed(() => this.selectedIndex() > 0);
  protected readonly hasNextSelected = computed(() => this.selectedIndex() >= 0 && this.selectedIndex() < this.visibleItems().length - 1);
  /** Same rule as the inbox: the server summary decides, unless the list still shows an unread row. */
  protected readonly canMarkAll = computed(() =>
    !this.busy() && !this.notificationService.markingAll() && (!this.unreadKnown() || this.unreadCount() > 0 || this.notifications().some((item) => !item.read)));

  protected readonly severityLabels = NOTIFICATION_SEVERITY_LABELS;
  protected readonly severityClass = severityClass;
  protected readonly timeOf = formatNotificationTime;
  protected readonly dateTime = formatNotificationDateTime;

  constructor() {
    this.router.events.pipe(
      filter((event) => event instanceof NavigationStart),
      takeUntilDestroyed()
    ).subscribe(() => {
      this.close(false);
      this.selected.set(null);
    });
  }

  protected toggle(): void {
    if (this.open()) {
      this.close(true);
      return;
    }
    this.open.set(true);
    this.actionError.set('');
    this.load();
    afterNextRender(() => this.panel()?.nativeElement.focus(), { injector: this.injector });
  }

  protected toggleUnreadOnly(): void {
    this.unreadOnly.update((value) => !value);
    this.load();
  }

  protected retry(): void {
    if (!this.loading()) this.load();
  }

  /** The dialog opens over the page and the popover closes; closing the dialog returns focus to the bell. */
  protected select(notification: NotificationResponse): void {
    this.close(false);
    this.show(notification);
  }

  protected closeDetail(): void {
    this.selected.set(null);
  }

  protected openDetailAction(): void {
    const current = this.selected();
    if (current && followNotification(current, this.router)) this.closeDetail();
  }

  protected step(delta: number): void {
    const target = this.visibleItems()[this.selectedIndex() + delta];
    if (target) this.show(target);
  }

  protected markSelectedRead(): void {
    const current = this.selected();
    if (current) this.markRead(current);
  }

  protected snoozeSelected(minutes: number): void {
    const current = this.selected();
    if (!current) return;
    this.run(this.notificationService.snooze(current.id, minutes, SILENT), () => {
      this.closeDetail();
      this.notificationService.refreshSummary().subscribe();
    });
  }

  /** Seeing a notification counts as reading it. */
  private show(notification: NotificationResponse): void {
    this.actionError.set('');
    this.selected.set(notification);
    if (!notification.read) this.markRead(notification);
  }

  protected markRead(notification: NotificationResponse): void {
    this.run(this.notificationService.markRead(notification.id, SILENT), () => {
      this.replaceRead(notification.id);
      this.selected.update((current) => current?.id === notification.id ? { ...current, read: true } : current);
      this.notificationService.refreshSummary().subscribe();
    });
  }

  protected markAllRead(): void {
    if (!this.canMarkAll()) return;
    this.run(this.notificationService.markAllRead(), (batch) => {
      // The bell does not show undo, so it must not leave a hidden batch active.
      if (batch.undoToken) this.notificationService.dismissReadAll(batch.undoToken).subscribe({ error: () => undefined });
      if (!this.destroyRef.destroyed) this.load();
    });
  }

  /** Arrows, Home and End move between the items; Tab keeps its natural order. */
  protected onPanelKeydown(event: KeyboardEvent): void {
    const items = Array.from(this.panel()?.nativeElement.querySelectorAll<HTMLElement>('.bell-item__main') ?? []);
    if (!items.length) return;
    const current = items.indexOf(document.activeElement as HTMLElement);
    let next: number;
    switch (event.key) {
      case 'ArrowDown': next = current < 0 ? 0 : (current + 1) % items.length; break;
      case 'ArrowUp': next = current < 0 ? items.length - 1 : (current - 1 + items.length) % items.length; break;
      case 'Home': next = 0; break;
      case 'End': next = items.length - 1; break;
      default: return;
    }
    event.preventDefault();
    items[next].focus();
  }

  protected onDocumentPointerDown(event: Event): void {
    if (this.open() && !this.host.nativeElement.contains(event.target as Node)) this.close(false);
  }

  protected onEscape(): void {
    if (this.open()) this.close(true);
  }

  /** Tabbing out of the popover closes it; focus stays where the user moved it. */
  protected onFocusOut(event: FocusEvent): void {
    const next = event.relatedTarget as Node | null;
    if (this.open() && next && !this.host.nativeElement.contains(next)) this.close(false);
  }

  private close(restoreFocus: boolean): void {
    if (!this.open()) return;
    this.open.set(false);
    this.listRequest?.unsubscribe();
    if (restoreFocus) this.trigger().nativeElement.focus();
  }

  private load(): void {
    this.listRequest?.unsubscribe();
    this.loading.set(true);
    this.loadError.set('');
    this.listRequest = this.notificationService.list({ unreadOnly: this.unreadOnly(), ...SILENT }).pipe(
      takeUntilDestroyed(this.destroyRef),
      finalize(() => this.loading.set(false))
    ).subscribe({
      next: (notifications) => {
        this.notifications.set(notifications);
        this.loaded.set(true);
      },
      error: (error) => {
        this.notifications.set([]);
        this.loaded.set(false);
        this.loadError.set(extractHttpErrorMessage(error, 'Não foi possível carregar as notificações.'));
      }
    });
    this.notificationService.refreshSummary().subscribe();
  }

  private run<T>(request$: Observable<T>, onSuccess: (result: T) => void): void {
    if (this.busy()) return;
    this.busy.set(true);
    this.actionError.set('');
    request$.pipe(finalize(() => this.busy.set(false))).subscribe({
      next: onSuccess,
      error: (error) => this.actionError.set(extractHttpErrorMessage(error, 'Não foi possível concluir a ação agora.'))
    });
  }

  private replaceRead(id: number): void {
    this.notifications.update((items) => items.map((item) => item.id === id ? { ...item, read: true } : item));
  }
}
