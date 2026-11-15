import { NotificationResponse } from '../../core/models';
import { businessDateInputValue } from '../../core/utils/date';

export function isBellNotification(notification: Pick<NotificationResponse, 'read' | 'createdAt'>, now: number): boolean {
  return !notification.read || businessDateInputValue(new Date(notification.createdAt)) === businessDateInputValue(new Date(now));
}
