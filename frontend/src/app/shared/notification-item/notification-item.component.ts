import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { NotificationResponse } from '../../core/models';
import { formatNotificationDateTime, formatNotificationTime, NOTIFICATION_SEVERITY_LABELS, severityClass } from '../../core/utils/notification-ui';
import { IconComponent } from '../icon/icon.component';
import { TipDirective } from '../tip/tip.directive';

@Component({
  selector: 'app-notification-item',
  standalone: true,
  imports: [IconComponent, TipDirective],
  templateUrl: './notification-item.component.html',
  styleUrl: './notification-item.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '[class.is-unread]': '!notification().read' }
})
export class NotificationItemComponent {
  readonly notification = input.required<NotificationResponse>();
  readonly headline = input.required<string>();
  readonly summary = input.required<string>();
  readonly select = output<void>();
  protected readonly severityLabels = NOTIFICATION_SEVERITY_LABELS;
  protected readonly severityClass = severityClass;
  protected readonly timeOf = formatNotificationTime;
  protected readonly dateTime = formatNotificationDateTime;
}
