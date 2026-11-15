import { Component, computed, inject, input, output } from '@angular/core';
import { NotificationEventType, NotificationResponse } from '../../core/models';
import { RMA_STATUS_LABELS } from '../../core/mock-data';
import { initialsOf } from '../../core/utils/rma-ui';
import { ClockService } from '../../core/services/clock.service';
import {
  NOTIFICATION_EVENT_LABELS,
  NOTIFICATION_SEVERITY_LABELS,
  SNOOZE_OPTIONS,
  activeSnoozeUntil,
  canSnooze,
  formatNotificationDateTime,
  formatTimeAgo,
  internalRoute,
  severityClass
} from '../../core/utils/notification-ui';
import { CustomSelectComponent } from '../form-controls/custom-select/custom-select.component';
import { IconComponent, IconName } from '../icon/icon.component';
import { ModalFocusDirective } from '../modal-focus/modal-focus.directive';
import { notificationDetailContent } from './notification-detail-content';

let nextId = 0;

/**
 * Full detail of one notification. It only presents and emits: the owner marks it read, snoozes it,
 * follows its link and decides what happens to its own list.
 */
@Component({
  selector: 'app-notification-detail-modal',
  imports: [CustomSelectComponent, IconComponent, ModalFocusDirective],
  templateUrl: './notification-detail-modal.component.html',
  styleUrl: './notification-detail-modal.component.css'
})
export class NotificationDetailModalComponent {
  private readonly clock = inject(ClockService);

  readonly notification = input.required<NotificationResponse>();
  readonly busy = input(false);
  readonly error = input('');
  readonly hasPrevious = input(false);
  readonly hasNext = input(false);
  readonly position = input<number | null>(null);
  readonly total = input<number | null>(null);
  /** Where focus goes when the opening row no longer exists (for example the bell panel closed). */
  readonly fallbackFocus = input<HTMLElement | null>(null);

  readonly closed = output<void>();
  readonly openAction = output<void>();
  readonly markRead = output<void>();
  readonly snoozed = output<number>();
  readonly previous = output<void>();
  readonly next = output<void>();

  protected readonly titleId = `notification-detail-title-${nextId++}`;
  protected readonly eventLabels = NOTIFICATION_EVENT_LABELS;
  protected readonly severityLabels = NOTIFICATION_SEVERITY_LABELS;
  protected readonly snoozeOptions = SNOOZE_OPTIONS;
  protected readonly severityClass = severityClass;
  protected readonly dateTime = formatNotificationDateTime;
  protected readonly initialsOf = initialsOf;
  protected readonly eventIcons: Record<NotificationEventType, IconName> = {
    RMA_CREATED: 'clipboard', RMA_ASSIGNED: 'users', RMA_BLOCKED: 'lock', TEST_FAILED: 'alert'
  };
  protected readonly stages: Record<string, string> = Object.fromEntries(Object.entries(RMA_STATUS_LABELS).map(([code, label]) => [label, code]));
  protected readonly reasonLabels = ['Motivo do impedimento', 'Pendência da peça', 'Item reprovado'];
  protected readonly priorities: Record<string, string> = { alta: 'HIGH', média: 'MEDIUM', baixa: 'LOW' };

  protected readonly headline = computed(() => this.notification().eventType === 'RMA_BLOCKED' ? 'Impedimento' : this.eventLabels[this.notification().eventType]);
  protected readonly content = computed(() => notificationDetailContent(this.notification()));
  protected readonly ago = computed(() => formatTimeAgo(this.notification().createdAt, this.clock.now()));
  /** Adiar exists only for notifications that ask for action; informative ones are never snoozed. */
  protected readonly canSnooze = computed(() => canSnooze(this.notification()));
  /** Only an active snooze is shown: the server returns an expired one as visible again. */
  protected readonly snoozedUntil = computed(() => activeSnoozeUntil(this.notification(), this.clock.now()));
  protected readonly canOpen = computed(() => internalRoute(this.notification().actionPath) !== null);

  protected snooze(minutes: string | number): void {
    const value = Number(minutes);
    if (value && this.canSnooze() && !this.busy()) this.snoozed.emit(value);
  }

  protected onKeydown(event: KeyboardEvent): void {
    if (event.defaultPrevented || this.busy() || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
    const target = event.target;
    if (target instanceof Element && target.closest('app-custom-select, input, textarea, select, [contenteditable]')) return;
    if (event.key === 'ArrowLeft' && this.hasPrevious()) {
      event.preventDefault();
      this.previous.emit();
    } else if (event.key === 'ArrowRight' && this.hasNext()) {
      event.preventDefault();
      this.next.emit();
    }
  }
}
