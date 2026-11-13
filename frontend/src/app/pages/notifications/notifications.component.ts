import { IconComponent, IconName } from '../../shared/icon/icon.component';
import { Component, DestroyRef, ElementRef, computed, effect, inject, signal, untracked, viewChild } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { Observable, Subscription, finalize } from 'rxjs';
import {
  NotificationFailureResponse,
  NotificationEventType,
  NotificationEmailStatusResponse,
  NotificationPreferenceResponse,
  NotificationResponse,
  NotificationRuleRequest,
  NotificationRuleResponse,
  NotificationSeverity,
  ProfileOption
} from '../../core/models';
import { AuthService } from '../../core/services/auth.service';
import { PermissionService } from '../../core/services/permission.service';
import { ProfileService } from '../../core/services/profile.service';
import { ClockService } from '../../core/services/clock.service';
import { ModalFocusDirective } from '../../shared/modal-focus/modal-focus.directive';
import { PageHeaderComponent } from '../../shared/page-header/page-header.component';
import { RowActionComponent } from '../../shared/row-action/row-action.component';
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
  disabled: 'Desligado',
  mandatory: 'Obrigatório',
  muted: 'Silenciado',
  receiving: 'Recebendo'
};

@Component({
  selector: 'app-notifications',
  imports: [IconComponent, CustomSelectComponent, ModalFocusDirective, PageHeaderComponent, RowActionComponent, ReactiveFormsModule],
  templateUrl: './notifications.component.html',
  styles: [`
    :host {
      display: block;
    }

    .notification-toolbar .filter-field { flex: 1 1 160px; min-width: 0; max-width: 260px; }
    .notification-day { margin: var(--space-3) 0 0; font-size: var(--font-size-sm); color: var(--muted); }
    .email-failure-row { display: flex; flex-wrap: wrap; align-items: center; gap: var(--space-2) var(--space-4); padding-block: var(--space-3); border-bottom: 1px solid var(--line); }
    .email-failure-row > * { min-width: 0; overflow-wrap: anywhere; }
    .email-failure-row .failure-error { flex: 1 1 180px; }
    .notification-title, .notification-message { overflow-wrap: anywhere; }
    .notification-toolbar,
    .notification-actions {
      display: flex;
      flex-wrap: wrap;
      gap: var(--space-2);
      align-items: center;
    }


    .notification-toolbar {
      gap: var(--space-1) var(--space-5);
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

    .preferences-state,
    .rules-state,
    .failures-state {
      margin: var(--space-3) 0 0;
    }

    .preferences-state.alert-banner,
    .rules-state.alert-banner,
    .failures-state.alert-banner {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      justify-content: space-between;
      gap: var(--space-3);
    }

    .failures-section .field-hint {
      margin: var(--space-1) 0 0;
    }

    .rule-no-recipients {
      display: block;
      margin-top: var(--space-1);
    }

    .failure-error {
      white-space: pre-wrap;
      overflow-wrap: anywhere;
    }

    .notification-list {
      display: grid;
      gap: var(--space-2);
      margin-top: var(--space-4);
    }

    .notification-item {
      position: relative;
      display: grid;
      grid-template-columns: auto minmax(0, 1fr) auto;
      align-items: center;
      gap: var(--space-3) var(--space-4);
      padding: var(--space-3) var(--space-4);
      border-bottom: 1px solid var(--line);
      border-radius: 0;
      background: var(--surface);
    }

    .notification-item.is-unread {
      background: var(--surface-alt);
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
      gap: var(--space-1);
      min-width: 0;
    }

    .notification-meta {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: var(--space-2);
    }

    .notification-meta .mini-chip {
      min-height: 22px;
      padding-inline: var(--space-2);
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
      min-height: var(--control-height);
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

    @media (max-width: 600px) {
      .table-wrap { overflow: visible; }
      table, tbody, tr, td { display: block; width: auto; min-width: 0; }
      thead { display: none; }
      tbody tr { padding-block: var(--space-3); border-bottom: 1px solid var(--line); }
      td { border: 0; padding: var(--space-1) 0; overflow-wrap: anywhere; }
      td[data-label]::before { content: attr(data-label) ': '; color: var(--muted); }
      .notification-toolbar .filter-field { max-width: none; }
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
  private readonly permissions = inject(PermissionService);
  protected readonly auth = inject(AuthService);
  private readonly profileService = inject(ProfileService);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  private readonly host: ElementRef<HTMLElement> = inject(ElementRef);
  /** Page target for the rule editor's focus return when its row button is gone. */
  protected readonly rulesPanel = viewChild<ElementRef<HTMLElement>>('rulesPanel');
  private readonly clock = inject(ClockService);
  private readonly fb = inject(FormBuilder);
  private inboxRequest?: Subscription;
  private preferencesRequest?: Subscription;
  private rulesRequest?: Subscription;
  private failuresRequest?: Subscription;

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
  protected readonly rulesLoadFailed = signal(false);
  protected readonly rulesHasLoaded = signal(false);
  protected readonly rulesLoadErrorMessage = signal('');
  protected readonly failuresLoading = signal(false);
  protected readonly failuresLoadFailed = signal(false);
  protected readonly failuresHasLoaded = signal(false);
  protected readonly failuresLoadErrorMessage = signal('');
  protected readonly busy = signal(false);
  protected readonly errorMessage = signal('');
  protected readonly successMessage = signal('');
  protected readonly unreadOnly = signal(false);
  protected readonly includeSnoozed = signal(false);
  protected readonly eventFilter = signal<NotificationEventType | ''>('');
  protected readonly severityFilter = signal<NotificationSeverity | ''>('');
  protected readonly eventFilterOptions = [{ value: '', label: 'Todos' }, ...Object.entries(NOTIFICATION_EVENT_LABELS).map(([value, label]) => ({ value, label }))];
  protected readonly severityFilterOptions = [{ value: '', label: 'Todas' }, ...NOTIFICATION_SEVERITIES.map(value => ({ value, label: NOTIFICATION_SEVERITY_LABELS[value] }))];
  protected readonly notificationGroups = computed(() => {
    const today = new Date(this.clock.now()); today.setHours(0, 0, 0, 0);
    const yesterday = new Date(today); yesterday.setDate(yesterday.getDate() - 1);
    const groups = new Map<string, { label: string; items: NotificationResponse[] }>();
    for (const notification of this.notifications()) {
      const day = new Date(notification.createdAt); day.setHours(0, 0, 0, 0);
      const key = String(day.getTime());
      const label = day.getTime() === today.getTime() ? 'Hoje' : day.getTime() === yesterday.getTime() ? 'Ontem' : day.toLocaleDateString('pt-BR');
      if (!groups.has(key)) groups.set(key, { label, items: [] });
      groups.get(key)!.items.push(notification);
    }
    return [...groups.values()];
  });
  protected readonly notifications = signal<NotificationResponse[]>([]);
  protected readonly preferences = signal<NotificationPreferenceResponse[]>([]);
  protected readonly rules = signal<NotificationRuleResponse[]>([]);
  protected readonly failures = signal<NotificationFailureResponse[]>([]);
  protected readonly emailStatus = signal<NotificationEmailStatusResponse | null>(null);
  protected readonly emailStatusLoading = signal(false);
  protected readonly emailStatusError = signal('');
  protected readonly emailTestBusy = signal(false);
  protected readonly emailFeedback = signal('');
  protected readonly emailError = signal('');
  protected readonly retryingEmails = signal<ReadonlySet<number>>(new Set());
  protected readonly retryErrors = signal<Record<number, string>>({});
  protected readonly emailFailures = computed(() => this.failures().filter(item => item.source === 'EMAIL'));
  protected readonly eventFailures = computed(() => this.failures().filter(item => item.source === 'EVENT'));
  private adminEpoch = 0;
  protected readonly editingRule = signal<NotificationRuleResponse | null>(null);
  protected readonly ruleSubmitting = signal(false);
  protected readonly ruleErrorMessage = signal('');
  protected readonly ruleForm = this.fb.nonNullable.group({
    enabled: false,
    severity: 'INFO' as NotificationSeverity,
    notifyAssignee: false,
    appEnabled: true,
    emailEnabled: false,
    userMutable: false,
    profiles: this.fb.nonNullable.control<number[]>([])
  });
  protected readonly profileOptions = signal<ProfileOption[]>([]);
  protected readonly profileOptionsState = signal<'idle' | 'loading' | 'ready' | 'failed'>('idle');

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
  protected readonly severityClass = severityClass;
  protected readonly dateTime = formatNotificationDateTime;

  protected readonly canManageRules = computed(() => this.permissions.hasPermission('notificacoes.regras'));
  protected readonly unreadCount = this.notificationService.unreadCount;
  /** The summary count is real only after its latest request succeeded; the inbox list is not a total. */
  protected readonly unreadKnown = computed(() =>
    this.notificationService.summaryLoaded() && !this.notificationService.summaryLoadFailed());
  protected readonly unreadUnavailable = this.notificationService.summaryLoadFailed;
  protected readonly hasUnread = computed(() => this.notifications().some((notification) => !notification.read));
  protected readonly tabs = computed<NotificationsTab[]>(() => this.canManageRules() ? ['inbox', 'preferences', 'rules'] : ['inbox', 'preferences']);

  /** O cache de opções de perfil vale o app inteiro: a primeira abertura da aba Regras busca a lista atual. */
  private rulesOpened = false;

  constructor() {
    this.loadInbox();
    // Sem a permissão (após um 403 ou ao mudar o próprio perfil), a aba Regras some: volta para a caixa de entrada.
    effect(() => {
      if (!this.canManageRules()) untracked(() => {
        this.adminEpoch++;
        this.rulesRequest?.unsubscribe(); this.failuresRequest?.unsubscribe();
        this.rules.set([]); this.failures.set([]); this.emailStatus.set(null);
        this.editingRule.set(null); this.emailError.set(''); this.emailFeedback.set('');
        this.retryErrors.set({});
        if (this.activeTab() === 'rules') this.selectTab('inbox');
      });
    });
  }

  protected selectTab(tab: NotificationsTab): void {
    if (tab === 'rules' && !this.canManageRules()) return;
    this.activeTab.set(tab);
    this.clearMessages();
    if (tab === 'inbox') {
      this.loadInbox();
    } else if (tab === 'preferences') {
      this.loadPreferences();
    } else if (this.canManageRules()) {
      if (!this.rulesOpened) {
        this.rulesOpened = true;
        this.profileService.invalidateOptions();
      }
      this.loadRules();
      this.loadEmailStatus();
      this.loadProfileOptions();
    }
  }

  protected unreadTabLabel(): string {
    const count = this.unreadCount();
    if (!this.unreadKnown() || count === 0) return 'Caixa de entrada';
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
    this.includeSnoozed.set(false);
    this.eventFilter.set('');
    this.severityFilter.set('');
    this.reloadInboxForNewFilters();
  }

  protected updateEventFilter(value: NotificationEventType | ''): void {
    this.eventFilter.set(value); this.reloadInboxForNewFilters();
  }

  protected updateSeverityFilter(value: NotificationSeverity | ''): void {
    this.severityFilter.set(value); this.reloadInboxForNewFilters();
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
    if (this.busy()) return;
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
    if (!preference.userMutable || this.busy()) return;
    this.run(this.notificationService.updatePreference(preference.eventType, !preference.muted), (updated) => {
      this.preferences.update((items) => items.map((item) => item.eventType === updated.eventType ? updated : item));
      this.successMessage.set(`${NOTIFICATION_EVENT_LABELS[updated.eventType]} ${updated.muted ? 'silenciado' : 'reativado'}.`);
    });
  }

  protected retryRules(): void {
    if (!this.rulesLoading()) this.loadRules();
  }

  protected retryFailures(): void {
    if (!this.failuresLoading()) this.loadFailures();
  }

  protected loadEmailStatus(): void {
    if (!this.canManageRules()) return;
    const epoch = this.adminEpoch;
    this.emailStatusLoading.set(true); this.emailStatusError.set(''); this.emailStatus.set(null);
    this.notificationService.emailStatus().pipe(takeUntilDestroyed(this.destroyRef), finalize(() => this.emailStatusLoading.set(false))).subscribe({
      next: status => { if (this.canManageRules() && epoch === this.adminEpoch) this.emailStatus.set(status); },
      error: error => { if (this.canManageRules() && epoch === this.adminEpoch) this.emailStatusError.set(extractHttpErrorMessage(error, 'Não foi possível consultar o canal.')); }
    });
  }

  protected sendTestEmail(): void {
    if (!this.canManageRules() || this.emailTestBusy() || !this.emailStatus()?.enabled) return;
    const epoch = this.adminEpoch;
    this.emailTestBusy.set(true); this.emailError.set(''); this.emailFeedback.set('');
    this.notificationService.testEmail().pipe(takeUntilDestroyed(this.destroyRef), finalize(() => this.emailTestBusy.set(false))).subscribe({
      next: result => {
        if (this.canManageRules() && epoch === this.adminEpoch) this.emailFeedback.set(result.status === 'simulado' ? 'Simulação registrada' : 'Teste enviado');
      },
      error: error => { if (this.canManageRules() && epoch === this.adminEpoch) this.emailError.set(extractHttpErrorMessage(error, 'Não foi possível enviar o teste.')); }
    });
  }

  protected canRetryEmail(failure: NotificationFailureResponse): boolean {
    return this.canManageRules() && failure.source === 'EMAIL' && failure.status === 'FAILED' && failure.retryAllowed === true && failure.notificationId != null;
  }

  protected retryEmail(failure: NotificationFailureResponse): void {
    const id = failure.notificationId;
    if (id == null || !this.canRetryEmail(failure) || this.retryingEmails().has(id)) return;
    const epoch = this.adminEpoch;
    this.retryingEmails.update(ids => new Set([...ids, id]));
    this.emailError.set(''); this.emailFeedback.set('');
    this.retryErrors.update(errors => ({ ...errors, [id]: '' }));
    this.notificationService.retryEmail(id).pipe(takeUntilDestroyed(this.destroyRef), finalize(() => {
      this.retryingEmails.update(ids => { const next = new Set(ids); next.delete(id); return next; });
    })).subscribe({
      next: () => {
        if (!this.canManageRules() || epoch !== this.adminEpoch) return;
        this.emailFeedback.set('Reenvio agendado'); this.loadFailures();
      },
      error: error => {
        if (!this.canManageRules() || epoch !== this.adminEpoch) return;
        const message = extractHttpErrorMessage(error, 'Não foi possível reenviar.');
        this.retryErrors.update(errors => ({ ...errors, [id]: message }));
        if (error.status === 409) {
          this.emailError.set(message);
          this.loadFailures();
        }
      }
    });
  }

  protected failureSource(failure: NotificationFailureResponse): string {
    return failure.source === 'EMAIL' ? 'Envio de e-mail' : 'Processamento do evento';
  }

  /** Recipients as a fact: configured profiles plus the RMA assignee, without judging the result. */
  protected recipientsSummary(rule: NotificationRuleResponse): string {
    const roles = rule.recipientProfiles.map((profile) => profile.name).join(', ');
    if (roles && rule.notifyAssignee) return `${roles} + responsável pelo RMA`;
    if (roles) return roles;
    return rule.notifyAssignee ? 'Responsável pelo RMA' : 'Nenhum destinatário';
  }

  protected hasNoRecipients(rule: { recipientCount: number; notifyAssignee: boolean }): boolean {
    return rule.recipientCount === 0 && !rule.notifyAssignee;
  }

  protected ruleHasNoRecipients(rule: NotificationRuleResponse): boolean {
    return this.hasNoRecipients({ recipientCount: rule.recipientProfiles.length, notifyAssignee: rule.notifyAssignee });
  }

  protected isRecipient(profileId: number): boolean {
    return this.ruleForm.controls.profiles.value.includes(profileId);
  }

  /** Mantém os ids na ordem das opções (por nome), como a API devolve. */
  protected toggleRecipient(profileId: number, checked: boolean): void {
    const chosen = new Set(this.ruleForm.controls.profiles.value);
    if (checked) chosen.add(profileId); else chosen.delete(profileId);
    const ordered = this.profileOptions().map((option) => option.id).filter((id) => chosen.has(id));
    const unknown = [...chosen].filter((id) => !ordered.includes(id));
    this.ruleForm.controls.profiles.setValue([...ordered, ...unknown]);
  }

  /** Same check on the editor's current values; it informs without blocking the save. */
  protected editorHasNoRecipients(): boolean {
    const { profiles, notifyAssignee } = this.ruleForm.getRawValue();
    return this.hasNoRecipients({ recipientCount: profiles.length, notifyAssignee });
  }

  /** Every control is reset from the rule, so nothing is carried over from the previously edited one. */
  protected openRuleEditor(rule: NotificationRuleResponse): void {
    if (this.ruleSubmitting() || !this.canManageRules()) return;
    this.ruleForm.reset({
      enabled: rule.enabled,
      severity: rule.severity,
      notifyAssignee: rule.notifyAssignee,
      appEnabled: rule.appEnabled ?? true,
      emailEnabled: rule.emailEnabled,
      userMutable: rule.userMutable,
      profiles: rule.recipientProfiles.map((profile) => profile.id)
    });
    this.ruleErrorMessage.set('');
    this.editingRule.set(rule);
  }

  protected closeRuleEditor(): void {
    if (this.ruleSubmitting()) return;
    this.resetRuleEditor();
  }

  /** Salva os canais e destinatários no contrato da regra. */
  protected saveRule(): void {
    const rule = this.editingRule();
    if (!rule || rule.supported === false || !this.canManageRules() || this.ruleSubmitting() || this.profileOptionsState() !== 'ready') return;

    const { enabled, appEnabled, severity, profiles, notifyAssignee, emailEnabled, userMutable } = this.ruleForm.getRawValue();
    const payload: NotificationRuleRequest = {
      enabled,
      appEnabled,
      severity,
      recipientProfileIds: profiles,
      notifyAssignee,
      emailEnabled,
      userMutable
    };
    const epoch = this.adminEpoch;

    this.ruleSubmitting.set(true);
    this.ruleErrorMessage.set('');
    this.clearMessages();
    this.notificationService.updateRule(rule.eventType, payload).pipe(
      takeUntilDestroyed(this.destroyRef),
      finalize(() => this.ruleSubmitting.set(false))
    ).subscribe({
      next: (updated) => {
        if (!this.canManageRules() || epoch !== this.adminEpoch) return;
        this.rules.update((items) => items.map((item) => item.eventType === updated.eventType ? updated : item));
        this.successMessage.set(`Regra "${NOTIFICATION_EVENT_LABELS[updated.eventType]}" atualizada.`);
        this.resetRuleEditor();
      },
      error: (error) => {
        if (this.canManageRules() && epoch === this.adminEpoch) this.ruleErrorMessage.set(extractHttpErrorMessage(error, 'Não foi possível salvar a regra.'));
      }
    });
  }

  protected retryProfileOptions(): void {
    this.loadProfileOptions();
  }

  private resetRuleEditor(): void {
    this.editingRule.set(null);
    this.ruleErrorMessage.set('');
    // Uma falha nas opções aparece no editor aberto; a próxima abertura já encontra a nova tentativa.
    if (this.profileOptionsState() === 'failed') this.loadProfileOptions();
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
    this.inboxRequest = this.notificationService.list({ unreadOnly: this.unreadOnly(), includeSnoozed: this.includeSnoozed(), ...(this.eventFilter() ? { eventType: this.eventFilter() as NotificationEventType } : {}), ...(this.severityFilter() ? { severity: this.severityFilter() as NotificationSeverity } : {}) }).pipe(
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

  /** As opções de perfil são buscadas uma vez por tela (o serviço as guarda); depois de uma falha, de novo no próximo editor. */
  private loadProfileOptions(): void {
    if (this.profileOptionsState() === 'ready' || this.profileOptionsState() === 'loading') return;
    this.profileOptionsState.set('loading');
    this.profileService.options().pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (options) => {
        this.profileOptions.set(options);
        this.profileOptionsState.set('ready');
      },
      error: () => this.profileOptionsState.set('failed')
    });
  }

  private loadRules(): void {
    this.rulesRequest?.unsubscribe();
    this.rulesLoading.set(true);
    this.rulesRequest = this.notificationService.listRules().pipe(
      takeUntilDestroyed(this.destroyRef),
      finalize(() => this.rulesLoading.set(false))
    ).subscribe({
      next: (rules) => {
        if (!this.canManageRules()) return;
        this.rules.set(rules);
        this.rulesHasLoaded.set(true);
        this.rulesLoadFailed.set(false);
        this.rulesLoadErrorMessage.set('');
      },
      error: (error) => {
        this.rules.set([]);
        this.rulesHasLoaded.set(false);
        this.rulesLoadFailed.set(true);
        this.rulesLoadErrorMessage.set(extractHttpErrorMessage(error, 'Não foi possível carregar as regras.'));
      }
    });
    this.loadFailures();
  }

  private loadFailures(): void {
    this.failuresRequest?.unsubscribe();
    this.failuresLoading.set(true);
    this.failuresRequest = this.notificationService.listFailures().pipe(
      takeUntilDestroyed(this.destroyRef),
      finalize(() => this.failuresLoading.set(false))
    ).subscribe({
      next: (failures) => {
        if (!this.canManageRules()) return;
        this.failures.set(failures);
        this.failuresHasLoaded.set(true);
        this.failuresLoadFailed.set(false);
        this.failuresLoadErrorMessage.set('');
      },
      error: (error) => {
        this.failures.set([]);
        this.failuresHasLoaded.set(false);
        this.failuresLoadFailed.set(true);
        this.failuresLoadErrorMessage.set(extractHttpErrorMessage(error, 'Não foi possível carregar as falhas de processamento.'));
      }
    });
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
