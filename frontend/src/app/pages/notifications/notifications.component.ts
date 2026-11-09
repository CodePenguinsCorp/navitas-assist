import { IconComponent, IconName } from '../../shared/icon/icon.component';
import { Component, DestroyRef, ElementRef, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Router } from '@angular/router';
import { Observable, Subscription, finalize } from 'rxjs';
import { ROLE_LABELS, ROLE_OPTIONS } from '../../core/mock-data';
import {
  NotificationFailureResponse,
  NotificationPreferenceResponse,
  NotificationResponse,
  NotificationRuleRequest,
  NotificationRuleResponse,
  NotificationSeverity,
  UserRole
} from '../../core/models';
import { AuthService } from '../../core/services/auth.service';
import { SlaClockService } from '../../core/services/sla-clock.service';
import { PageHeaderComponent } from '../../shared/page-header/page-header.component';
import { CustomSelectComponent } from '../../shared/form-controls/custom-select/custom-select.component';
import { NotificationService } from '../../core/services/notification.service';
import { extractHttpErrorMessage } from '../../core/utils/catalog-ui';
import {
  NOTIFICATION_EVENT_LABELS,
  NOTIFICATION_SEVERITIES,
  NOTIFICATION_SEVERITY_LABELS,
  SNOOZE_OPTIONS,
  formatNotificationDateTime,
  internalRoute,
  severityClass
} from '../../core/utils/notification-ui';

type NotificationsTab = 'inbox' | 'preferences' | 'rules';
type PreferenceState = 'disabled' | 'mandatory' | 'muted' | 'receiving';

const PREFERENCE_STATE_LABELS: Record<PreferenceState, string> = {
  disabled: 'Desativado pela administração',
  mandatory: 'Obrigatório',
  muted: 'Silenciado',
  receiving: 'Recebendo'
};

@Component({
  selector: 'app-notifications',
  imports: [IconComponent, CustomSelectComponent, PageHeaderComponent],
  templateUrl: './notifications.component.html',
  styles: [`
    :host {
      display: block;
    }

    .notification-toolbar,
    .notification-actions,
    .rule-roles {
      display: flex;
      flex-wrap: wrap;
      gap: 0.5rem;
      align-items: center;
    }


    .notification-toolbar {
      gap: 0.25rem 1.25rem;
    }

    .rule-roles .checkbox-field {
      min-height: 28px;
      font-weight: 500;
    }

    .notification-toolbar .button-secondary {
      margin-left: auto;
    }

    .inbox-limit,
    .inbox-state {
      margin: var(--space-3) 0 0;
    }

    .inbox-state.alert-banner {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      justify-content: space-between;
      gap: var(--space-3);
    }

    .preferences-state {
      margin: var(--space-3) 0 0;
    }

    .preferences-state.alert-banner {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      justify-content: space-between;
      gap: var(--space-3);
    }

    .notification-list {
      display: grid;
      gap: 0.5rem;
      margin-top: 1rem;
    }

    .notification-item {
      position: relative;
      display: grid;
      grid-template-columns: auto minmax(0, 1fr) auto;
      align-items: center;
      gap: 0.75rem 1rem;
      padding: 0.85rem 1rem;
      border: 1px solid var(--line);
      border-radius: var(--radius-md);
      background: #ffffff;
    }

    .notification-item.is-unread {
      background: #f5f9fd;
    }

    .notification-item.is-unread::before {
      content: '';
      position: absolute;
      left: -1px;
      top: 12px;
      bottom: 12px;
      width: 3px;
      border-radius: 0 3px 3px 0;
      background: var(--brand-blue);
    }

    .notification-body {
      display: grid;
      gap: 0.3rem;
      min-width: 0;
    }

    .notification-meta {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 0.5rem;
    }

    .notification-meta .mini-chip {
      min-height: 22px;
      padding-inline: 0.55rem;
      font-size: 0.72rem;
    }

    .notification-event {
      font-size: 0.78rem;
      font-weight: 600;
      color: var(--brand-blue-deep);
    }

    .notification-time {
      font-size: 0.78rem;
      color: var(--muted);
      font-variant-numeric: tabular-nums;
    }

    .notification-title {
      font-size: 0.95rem;
      color: var(--text);
    }

    .notification-title.link-button {
      justify-self: start;
      min-height: var(--control-height-sm);
      color: var(--brand-blue);
      font-size: 0.95rem;
      text-align: left;
    }

    .inbox-feedback {
      margin-top: var(--space-3);
    }

    .notification-message {
      margin: 0;
      font-size: 0.88rem;
      line-height: 1.45;
      color: var(--muted);
    }

    .notification-actions {
      justify-content: flex-end;
      flex-wrap: nowrap;
    }

    @media (max-width: 720px) {
      .notification-item {
        grid-template-columns: 1fr;
      }

      .notification-actions {
        justify-content: flex-start;
        flex-wrap: wrap;
      }
    }
  `]
})
export class NotificationsComponent {
  private readonly notificationService = inject(NotificationService);
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  private readonly host: ElementRef<HTMLElement> = inject(ElementRef);
  private readonly clock = inject(SlaClockService);
  private inboxRequest?: Subscription;
  private preferencesRequest?: Subscription;

  protected readonly activeTab = signal<NotificationsTab>('inbox');
  protected readonly inboxLoading = signal(false);
  protected readonly inboxLoadFailed = signal(false);
  protected readonly inboxHasLoaded = signal(false);
  protected readonly inboxLoadErrorMessage = signal('');
  protected readonly preferencesLoading = signal(false);
  protected readonly preferencesLoadFailed = signal(false);
  protected readonly preferencesHasLoaded = signal(false);
  protected readonly preferencesLoadErrorMessage = signal('');
  protected readonly rulesLoading = signal(false);
  protected readonly busy = signal(false);
  protected readonly errorMessage = signal('');
  protected readonly successMessage = signal('');
  protected readonly unreadOnly = signal(false);
  protected readonly includeSnoozed = signal(false);
  protected readonly notifications = signal<NotificationResponse[]>([]);
  protected readonly preferences = signal<NotificationPreferenceResponse[]>([]);
  protected readonly rules = signal<NotificationRuleResponse[]>([]);
  protected readonly failures = signal<NotificationFailureResponse[]>([]);

  protected readonly eventLabels = NOTIFICATION_EVENT_LABELS;
  protected readonly severityLabels = NOTIFICATION_SEVERITY_LABELS;
  protected readonly severities = NOTIFICATION_SEVERITIES;
  protected readonly severityOptions = NOTIFICATION_SEVERITIES.map((severity) => ({ value: severity, label: NOTIFICATION_SEVERITY_LABELS[severity] }));
  protected severityIcon(severity: NotificationSeverity): IconName {
    return severity === 'CRITICAL' ? 'alert' : severity === 'WARNING' ? 'clock' : 'info';
  }

  protected severityTone(severity: NotificationSeverity): string {
    return severity === 'CRITICAL' ? 'tone-danger' : severity === 'WARNING' ? 'tone-warning' : 'tone-sky';
  }
  protected readonly snoozeOptions = SNOOZE_OPTIONS;
  protected readonly roleOptions = ROLE_OPTIONS;
  protected readonly roleLabels = ROLE_LABELS;
  protected readonly severityClass = severityClass;
  protected readonly dateTime = formatNotificationDateTime;

  protected readonly isAdmin = computed(() => this.authService.hasAnyRole(['ADMIN']));
  protected readonly unreadCount = this.notificationService.unreadCount;
  protected readonly hasUnread = computed(() => this.notifications().some((notification) => !notification.read));
  protected readonly tabs = computed<NotificationsTab[]>(() => this.isAdmin() ? ['inbox', 'preferences', 'rules'] : ['inbox', 'preferences']);

  constructor() {
    this.loadInbox();
  }

  protected selectTab(tab: NotificationsTab): void {
    this.activeTab.set(tab);
    this.clearMessages();
    if (tab === 'inbox') {
      this.loadInbox();
    } else if (tab === 'preferences') {
      this.loadPreferences();
    } else if (this.isAdmin()) {
      this.loadRules();
    }
  }

  protected unreadTabLabel(): string {
    const count = this.unreadCount();
    if (count === 0) return 'Caixa de entrada';
    return `Caixa de entrada (${count} ${count === 1 ? 'não lida' : 'não lidas'})`;
  }

  /** Tab keyboard contract: arrows move with wrap-around, Home/End jump to the ends; selection follows focus. */
  protected onTabKeydown(event: KeyboardEvent): void {
    const tabs = this.tabs();
    const current = tabs.indexOf(this.activeTab());
    let next: number;
    switch (event.key) {
      case 'ArrowRight': next = (current + 1) % tabs.length; break;
      case 'ArrowLeft': next = (current - 1 + tabs.length) % tabs.length; break;
      case 'Home': next = 0; break;
      case 'End': next = tabs.length - 1; break;
      default: return;
    }
    event.preventDefault();
    this.selectTab(tabs[next]);
    this.host.nativeElement.querySelector<HTMLElement>(`#notifications-tab-${tabs[next]}`)?.focus();
  }

  protected canOpen(notification: NotificationResponse): boolean {
    return internalRoute(notification.actionPath) !== null;
  }

  /** An expired snooze is returned by the server as visible again, so it is not shown as active. */
  protected isSnoozed(notification: NotificationResponse): boolean {
    return notification.snoozedUntil !== null && Date.parse(notification.snoozedUntil) > this.clock.now();
  }

  protected toggleUnreadOnly(): void {
    this.unreadOnly.update((value) => !value);
    this.reloadInboxForNewFilters();
  }

  protected toggleIncludeSnoozed(): void {
    this.includeSnoozed.update((value) => !value);
    this.reloadInboxForNewFilters();
  }

  protected clearInboxFilters(): void {
    this.unreadOnly.set(false);
    this.reloadInboxForNewFilters();
  }

  protected retryInbox(): void {
    if (!this.inboxLoading()) this.loadInbox();
  }

  protected open(notification: NotificationResponse): void {
    const route = internalRoute(notification.actionPath);
    if (!notification.read) {
      this.notificationService.markRead(notification.id).subscribe({ next: () => this.refreshSummary() });
    }
    if (route) {
      void this.router.navigate([route.path], { queryParams: route.queryParams });
    }
  }

  protected markRead(notification: NotificationResponse): void {
    this.run(this.notificationService.markRead(notification.id), () => {
      this.replace(notification.id, (current) => ({ ...current, read: true }));
      this.refreshSummary();
    });
  }

  protected markAllRead(): void {
    this.run(this.notificationService.markAllRead(), () => {
      this.successMessage.set('Todas as notificações, inclusive as adiadas, foram marcadas como lidas.');
      this.loadInbox();
    });
  }

  protected snooze(notification: NotificationResponse, minutes: string | number): void {
    const value = Number(minutes);
    if (!value) {
      return;
    }

    this.run(this.notificationService.snooze(notification.id, value), (updated) => {
      this.successMessage.set(updated.snoozedUntil ? `Notificação adiada até ${formatNotificationDateTime(updated.snoozedUntil)}.` : 'Notificação adiada.');
      this.loadInbox();
    });
  }

  protected retryPreferences(): void {
    if (!this.preferencesLoading()) this.loadPreferences();
  }

  /**
   * One state per preference, in precedence order. "Obrigatório" means the user cannot mute the alert
   * (an old mute is ignored while they are a recipient of an active rule); it does not promise delivery.
   */
  protected preferenceState(preference: NotificationPreferenceResponse): PreferenceState {
    if (!preference.enabled) return 'disabled';
    if (!preference.userMutable) return 'mandatory';
    return preference.muted ? 'muted' : 'receiving';
  }

  protected preferenceStateLabel(preference: NotificationPreferenceResponse): string {
    return PREFERENCE_STATE_LABELS[this.preferenceState(preference)];
  }

  protected toggleMute(preference: NotificationPreferenceResponse): void {
    this.run(this.notificationService.updatePreference(preference.eventType, !preference.muted), (updated) => {
      this.preferences.update((items) => items.map((item) => item.eventType === updated.eventType ? updated : item));
      this.successMessage.set(`${NOTIFICATION_EVENT_LABELS[updated.eventType]} ${updated.muted ? 'silenciado' : 'reativado'}.`);
    });
  }

  protected updateRule(rule: NotificationRuleResponse, change: Partial<NotificationRuleRequest>): void {
    const payload: NotificationRuleRequest = {
      enabled: rule.enabled,
      severity: rule.severity,
      recipientRoles: rule.recipientRoles,
      notifyAssignee: rule.notifyAssignee,
      emailEnabled: rule.emailEnabled,
      userMutable: rule.userMutable,
      ...change
    };

    this.run(this.notificationService.updateRule(rule.eventType, payload), (updated) => {
      this.rules.update((items) => items.map((item) => item.eventType === updated.eventType ? updated : item));
      this.successMessage.set(`Regra "${NOTIFICATION_EVENT_LABELS[updated.eventType]}" atualizada.`);
    });
  }

  protected toggleRole(rule: NotificationRuleResponse, role: UserRole): void {
    const roles = rule.recipientRoles.includes(role) ? rule.recipientRoles.filter((current) => current !== role) : [...rule.recipientRoles, role];
    this.updateRule(rule, { recipientRoles: roles });
  }

  protected updateSeverity(rule: NotificationRuleResponse, severity: string): void {
    this.updateRule(rule, { severity: severity as NotificationSeverity });
  }

  /** The previous result belongs to other filters: drop it and its failure, then start a first load. */
  private reloadInboxForNewFilters(): void {
    this.inboxLoadFailed.set(false);
    this.inboxLoadErrorMessage.set('');
    this.inboxHasLoaded.set(false);
    this.notifications.set([]);
    this.loadInbox();
  }

  private loadInbox(): void {
    this.inboxRequest?.unsubscribe();
    this.inboxLoading.set(true);
    this.inboxRequest = this.notificationService.list({ unreadOnly: this.unreadOnly(), includeSnoozed: this.includeSnoozed() }).pipe(
      takeUntilDestroyed(this.destroyRef),
      finalize(() => this.inboxLoading.set(false))
    ).subscribe({
      next: (notifications) => {
        this.notifications.set(notifications);
        this.inboxHasLoaded.set(true);
        this.inboxLoadFailed.set(false);
        this.inboxLoadErrorMessage.set('');
      },
      error: (error) => {
        this.notifications.set([]);
        this.inboxHasLoaded.set(false);
        this.inboxLoadFailed.set(true);
        this.inboxLoadErrorMessage.set(extractHttpErrorMessage(error, 'Não foi possível carregar as notificações.'));
      }
    });
    this.refreshSummary();
  }

  private loadPreferences(): void {
    this.preferencesRequest?.unsubscribe();
    this.preferencesLoading.set(true);
    this.preferencesRequest = this.notificationService.listPreferences().pipe(
      takeUntilDestroyed(this.destroyRef),
      finalize(() => this.preferencesLoading.set(false))
    ).subscribe({
      next: (preferences) => {
        this.preferences.set(preferences);
        this.preferencesHasLoaded.set(true);
        this.preferencesLoadFailed.set(false);
        this.preferencesLoadErrorMessage.set('');
      },
      error: (error) => {
        this.preferences.set([]);
        this.preferencesHasLoaded.set(false);
        this.preferencesLoadFailed.set(true);
        this.preferencesLoadErrorMessage.set(extractHttpErrorMessage(error, 'Não foi possível carregar as preferências.'));
      }
    });
  }

  private loadRules(): void {
    this.rulesLoading.set(true);
    this.notificationService.listRules().pipe(
      finalize(() => this.rulesLoading.set(false))
    ).subscribe({
      next: (rules) => this.rules.set(rules),
      error: (error) => this.errorMessage.set(extractHttpErrorMessage(error, 'Não foi possível carregar as regras.'))
    });
    this.notificationService.listFailures().subscribe({ next: (failures) => this.failures.set(failures), error: () => this.failures.set([]) });
  }

  private run<T>(request$: Observable<T>, onSuccess: (result: T) => void): void {
    if (this.busy()) {
      return;
    }

    this.busy.set(true);
    this.clearMessages();
    request$.pipe(
      finalize(() => this.busy.set(false))
    ).subscribe({
      next: onSuccess,
      error: (error) => this.errorMessage.set(extractHttpErrorMessage(error, 'Não foi possível concluir a ação agora.'))
    });
  }

  private replace(id: number, update: (notification: NotificationResponse) => NotificationResponse): void {
    this.notifications.update((items) => items.map((item) => item.id === id ? update(item) : item));
  }

  private refreshSummary(): void {
    this.notificationService.refreshSummary().subscribe();
  }

  /** Clears action feedback only; load failures keep their own signals. */
  private clearMessages(): void {
    this.errorMessage.set('');
    this.successMessage.set('');
  }
}
