import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { NotificationRuleRequest } from '../models';
import { NotificationService } from './notification.service';

describe('NotificationService', () => {
  let service: NotificationService;
  let httpTesting: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(NotificationService);
    httpTesting = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpTesting.verify());

  it('sends list filters only when enabled', () => {
    service.list({ unreadOnly: true }).subscribe();
    const request = httpTesting.expectOne((candidate) => candidate.url === '/api/notifications');
    expect(request.request.params.get('unreadOnly')).toBe('true');
    expect(request.request.params.has('includeSnoozed')).toBe(false);
    request.flush([]);
  });

  it('keeps the shared unread count in sync with the summary endpoint', () => {
    service.refreshSummary().subscribe();
    httpTesting.expectOne('/api/notifications/summary').flush({ unread: 3 });
    expect(service.unreadCount()).toBe(3);

    service.refreshSummary().subscribe();
    httpTesting.expectOne('/api/notifications/summary').flush({ message: 'erro' }, { status: 500, statusText: 'Server Error' });
    expect(service.unreadCount()).toBe(3);
  });

  it('posts snooze, preference and rule changes to their endpoints', () => {
    service.snooze(4, 60).subscribe();
    const snooze = httpTesting.expectOne('/api/notifications/4/snooze');
    expect(snooze.request.method).toBe('POST');
    expect(snooze.request.body).toEqual({ minutes: 60 });
    snooze.flush({});

    service.updatePreference('RMA_CREATED', true).subscribe();
    const preference = httpTesting.expectOne('/api/notifications/preferences/RMA_CREATED');
    expect(preference.request.method).toBe('PUT');
    expect(preference.request.body).toEqual({ muted: true });
    preference.flush({});

    const rule: NotificationRuleRequest = { enabled: false, severity: 'CRITICAL', recipientRoles: ['ADMIN'], notifyAssignee: true, emailEnabled: false, userMutable: false };
    service.updateRule('SLA_OVERDUE', rule).subscribe();
    const update = httpTesting.expectOne('/api/notification-rules/SLA_OVERDUE');
    expect(update.request.method).toBe('PUT');
    expect(update.request.body).toEqual(rule);
    update.flush({});
  });
});
