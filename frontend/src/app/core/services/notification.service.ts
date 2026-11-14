import { HttpClient, HttpContext, HttpParams } from '@angular/common/http';
import { Injectable, inject, signal } from '@angular/core';
import { Observable, catchError, defer, map, of, tap } from 'rxjs';
import { SKIP_GLOBAL_LOADING } from '../interceptors/loading.interceptor';
import {
  NotificationEventType,
  NotificationSeverity,
  NotificationEmailStatusResponse,
  NotificationEmailTestResponse,
  NotificationEmailActionResponse,
  NotificationFailureResponse,
  NotificationPreferenceResponse,
  NotificationResponse,
  NotificationRuleRequest,
  NotificationRuleResponse,
  NotificationSummaryResponse
} from '../models';

/** `silent` keeps the global loading overlay out of the call: the bell popover shows its own inline state. */
export interface NotificationRequestOptions { silent?: boolean }

function requestContext(options: NotificationRequestOptions): HttpContext {
  return new HttpContext().set(SKIP_GLOBAL_LOADING, options.silent === true);
}

@Injectable({ providedIn: 'root' })
export class NotificationService {
  private readonly http = inject(HttpClient);
  private readonly unreadSignal = signal(0);

  /** Unread count shared by the shell badge and the notification center. */
  readonly unreadCount = this.unreadSignal.asReadonly();
  private readonly summaryLoadedSignal = signal(false);
  private readonly summaryLoadFailedSignal = signal(false);
  private latestSummaryRequest = 0;

  /** True once a summary response succeeded; before that the count is unknown, not zero. */
  readonly summaryLoaded = this.summaryLoadedSignal.asReadonly();
  /** True while the most recent summary request failed; consumers hide the stale count. */
  readonly summaryLoadFailed = this.summaryLoadFailedSignal.asReadonly();

  list(options: { unreadOnly?: boolean; includeSnoozed?: boolean; eventType?: NotificationEventType; severity?: NotificationSeverity } & NotificationRequestOptions = {}): Observable<NotificationResponse[]> {
    let params = new HttpParams();
    if (options.unreadOnly) {
      params = params.set('unreadOnly', 'true');
    }
    if (options.includeSnoozed) {
      params = params.set('includeSnoozed', 'true');
    }

    if (options.eventType) params = params.set('eventType', options.eventType);
    if (options.severity) params = params.set('severity', options.severity);
    return this.http.get<NotificationResponse[]>('/api/notifications', { params, context: requestContext(options) });
  }

  /** Only the most recently started request updates the shared count and its state. */
  refreshSummary(): Observable<number> {
    return defer(() => {
      const request = ++this.latestSummaryRequest;
      const isLatest = () => request === this.latestSummaryRequest;
      return this.http.get<NotificationSummaryResponse>('/api/notifications/summary', {
        context: new HttpContext().set(SKIP_GLOBAL_LOADING, true)
      }).pipe(
        map((summary) => summary.unread),
        tap((unread) => {
          if (!isLatest()) return;
          this.unreadSignal.set(unread);
          this.summaryLoadedSignal.set(true);
          this.summaryLoadFailedSignal.set(false);
        }),
        catchError(() => {
          if (isLatest()) this.summaryLoadFailedSignal.set(true);
          return of(this.unreadSignal());
        })
      );
    });
  }

  markRead(id: number, options: NotificationRequestOptions = {}): Observable<NotificationResponse> {
    return this.http.post<NotificationResponse>(`/api/notifications/${id}/read`, {}, { context: requestContext(options) });
  }

  markAllRead(options: NotificationRequestOptions = {}): Observable<void> {
    return this.http.post<void>('/api/notifications/read-all', {}, { context: requestContext(options) });
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
  emailStatus(): Observable<NotificationEmailStatusResponse> {
    return this.http.get<NotificationEmailStatusResponse>('/api/notification-rules/email-status');
  }

  testEmail(): Observable<NotificationEmailTestResponse> {
    return this.http.post<NotificationEmailTestResponse>('/api/notification-rules/emails/test', {});
  }

  retryEmail(id: number): Observable<NotificationEmailActionResponse> {
    return this.http.post<NotificationEmailActionResponse>(`/api/notification-rules/emails/${id}/retry`, {});
  }

}
