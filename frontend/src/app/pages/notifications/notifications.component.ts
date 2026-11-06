import { Component, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { Observable, finalize } from 'rxjs';
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

@Component({
  selector: 'app-notifications',
  imports: [CustomSelectComponent],
  templateUrl: './notifications.component.html',
  styles: [`
    :host {
      display: block;
    }

    .notification-tabs,
    .notification-toolbar,
    .notification-actions,
    .rule-roles {
      display: flex;
      flex-wrap: wrap;
      gap: 0.5rem;
      align-items: center;
    }

    .notification-tabs {
      margin-bottom: 1rem;
    }

    .notification-tabs .is-active {
      background: var(--brand-blue-deep);
      color: #ffffff;
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

    .notification-list {
      display: grid;
      gap: 0.5rem;
      margin-top: 1rem;
    }

    .notification-item {
      position: relative;
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto;
      align-items: center;
      gap: 0.75rem 1.5rem;
      padding: 0.85rem 1rem 0.85rem 1.25rem;
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
      left: 0.5rem;
      top: 1.1rem;
      width: 6px;
      height: 6px;
      border-radius: 999px;
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

  protected readonly activeTab = signal<NotificationsTab>('inbox');
  protected readonly loading = signal(false);
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
  protected readonly snoozeOptions = SNOOZE_OPTIONS;
  protected readonly roleOptions = ROLE_OPTIONS;
  protected readonly roleLabels = ROLE_LABELS;
  protected readonly severityClass = severityClass;
  protected readonly dateTime = formatNotificationDateTime;

  protected readonly isAdmin = computed(() => this.authService.hasAnyRole(['ADMIN']));
  protected readonly unreadCount = this.notificationService.unreadCount;
  protected readonly hasUnread = computed(() => this.notifications().some((notification) => !notification.read));

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

  protected toggleUnreadOnly(): void {
    this.unreadOnly.update((value) => !value);
    this.loadInbox();
  }

  protected toggleIncludeSnoozed(): void {
    this.includeSnoozed.update((value) => !value);
    this.loadInbox();
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
      this.successMessage.set('Todas as notificações foram marcadas como lidas.');
      this.loadInbox();
    });
  }

  protected snooze(notification: NotificationResponse, minutes: string | number): void {
    const value = Number(minutes);
    if (!value) {
      return;
    }

    this.run(this.notificationService.snooze(notification.id, value), () => {
      this.successMessage.set('Notificação adiada.');
      this.loadInbox();
    });
  }

  protected toggleMute(preference: NotificationPreferenceResponse): void {
    this.run(this.notificationService.updatePreference(preference.eventType, !preference.muted), (updated) => {
      this.preferences.update((items) => items.map((item) => item.eventType === updated.eventType ? updated : item));
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

  private loadInbox(): void {
    this.loading.set(true);
    this.notificationService.list({ unreadOnly: this.unreadOnly(), includeSnoozed: this.includeSnoozed() }).pipe(
      finalize(() => this.loading.set(false))
    ).subscribe({
      next: (notifications) => this.notifications.set(notifications),
      error: (error) => this.errorMessage.set(extractHttpErrorMessage(error, 'Não foi possível carregar as notificações.'))
    });
    this.refreshSummary();
  }

  private loadPreferences(): void {
    this.loading.set(true);
    this.notificationService.listPreferences().pipe(
      finalize(() => this.loading.set(false))
    ).subscribe({
      next: (preferences) => this.preferences.set(preferences),
      error: (error) => this.errorMessage.set(extractHttpErrorMessage(error, 'Não foi possível carregar as preferências.'))
    });
  }

  private loadRules(): void {
    this.loading.set(true);
    this.notificationService.listRules().pipe(
      finalize(() => this.loading.set(false))
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

  private clearMessages(): void {
    this.errorMessage.set('');
    this.successMessage.set('');
  }
}
