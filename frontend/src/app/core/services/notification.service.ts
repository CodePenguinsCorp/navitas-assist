import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject, signal } from '@angular/core';
import { Observable, catchError, map, of, tap } from 'rxjs';
import {
  NotificationEventType,
  NotificationFailureResponse,
  NotificationPreferenceResponse,
  NotificationResponse,
  NotificationRuleRequest,
  NotificationRuleResponse,
  NotificationSummaryResponse
} from '../models';

@Injectable({ providedIn: 'root' })
export class NotificationService {
  private readonly http = inject(HttpClient);
  private readonly unreadSignal = signal(0);

  /** Unread count shared by the shell badge and the notification center. */
  readonly unreadCount = this.unreadSignal.asReadonly();

  list(options: { unreadOnly?: boolean; includeSnoozed?: boolean } = {}): Observable<NotificationResponse[]> {
    let params = new HttpParams();
    if (options.unreadOnly) {
      params = params.set('unreadOnly', 'true');
    }
    if (options.includeSnoozed) {
      params = params.set('includeSnoozed', 'true');
    }

    return this.http.get<NotificationResponse[]>('/api/notifications', { params });
  }

  refreshSummary(): Observable<number> {
    return this.http.get<NotificationSummaryResponse>('/api/notifications/summary').pipe(
      map((summary) => summary.unread),
      tap((unread) => this.unreadSignal.set(unread)),
      catchError(() => of(this.unreadSignal()))
    );
  }

  markRead(id: number): Observable<NotificationResponse> {
    return this.http.post<NotificationResponse>(`/api/notifications/${id}/read`, {});
  }

  markAllRead(): Observable<void> {
    return this.http.post<void>('/api/notifications/read-all', {});
  }

  snooze(id: number, minutes: number): Observable<NotificationResponse> {
    return this.http.post<NotificationResponse>(`/api/notifications/${id}/snooze`, { minutes });
  }

  listPreferences(): Observable<NotificationPreferenceResponse[]> {
    return this.http.get<NotificationPreferenceResponse[]>('/api/notifications/preferences');
  }

  updatePreference(eventType: NotificationEventType, muted: boolean): Observable<NotificationPreferenceResponse> {
    return this.http.put<NotificationPreferenceResponse>(`/api/notifications/preferences/${eventType}`, { muted });
  }

  listRules(): Observable<NotificationRuleResponse[]> {
    return this.http.get<NotificationRuleResponse[]>('/api/notification-rules');
  }

  updateRule(eventType: NotificationEventType, payload: NotificationRuleRequest): Observable<NotificationRuleResponse> {
    return this.http.put<NotificationRuleResponse>(`/api/notification-rules/${eventType}`, payload);
  }

  listFailures(): Observable<NotificationFailureResponse[]> {
    return this.http.get<NotificationFailureResponse[]>('/api/notification-rules/failures');
  }
}
