import { Component, computed, inject, input, output } from '@angular/core';
import { NotificationResponse } from '../../core/models';
import { ClockService } from '../../core/services/clock.service';
import {
  NOTIFICATION_EVENT_LABELS,
  NOTIFICATION_SEVERITY_LABELS,
  SNOOZE_OPTIONS,
  formatNotificationDateTime,
  formatNotificationFullDateTime,
  formatTimeAgo,
  internalRoute,
  severityClass
} from '../../core/utils/notification-ui';
import { CustomSelectComponent } from '../form-controls/custom-select/custom-select.component';
import { IconComponent } from '../icon/icon.component';
import { ModalFocusDirective } from '../modal-focus/modal-focus.directive';

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
  protected readonly fullDateTime = formatNotificationFullDateTime;

  protected readonly ago = computed(() => formatTimeAgo(this.notification().createdAt, this.clock.now()));
  /** Only an active snooze is shown: the server returns an expired one as visible again. */
  protected readonly snoozedUntil = computed(() => {
    const until = this.notification().snoozedUntil;
    return until && Date.parse(until) > this.clock.now() ? until : null;
  });
  protected readonly canOpen = computed(() => internalRoute(this.notification().actionPath) !== null);

  protected snooze(minutes: string | number): void {
    const value = Number(minutes);
    if (value) this.snoozed.emit(value);
  }
}
