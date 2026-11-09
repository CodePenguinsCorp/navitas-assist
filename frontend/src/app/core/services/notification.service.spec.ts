import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { SKIP_GLOBAL_LOADING, loadingInterceptor } from '../interceptors/loading.interceptor';
import { NotificationRuleRequest } from '../models';
import { LoadingService } from './loading.service';
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

  describe('summary state', () => {
    const fail = () => httpTesting.expectOne('/api/notifications/summary').flush({ message: 'erro' }, { status: 500, statusText: 'Server Error' });

    // Vermelho: não existem signals de estado do resumo; antes da resposta não há como distinguir "sem carga" de zero.
    it('is neither loaded nor failed before the first response', () => {
      expect(service.summaryLoaded()).toBe(false);
      expect(service.summaryLoadFailed()).toBe(false);
      service.refreshSummary().subscribe();
      expect(service.summaryLoaded()).toBe(false);
      expect(service.summaryLoadFailed()).toBe(false);
      httpTesting.expectOne('/api/notifications/summary').flush({ unread: 0 });
      expect(service.summaryLoaded()).toBe(true);
      expect(service.summaryLoadFailed()).toBe(false);
    });

    // Vermelho: a primeira falha não é registrada.
    it('marks a first failure without inventing a loaded count', () => {
      let emitted: number | undefined;
      service.refreshSummary().subscribe((value) => (emitted = value));
      fail();
      expect(service.summaryLoaded()).toBe(false);
      expect(service.summaryLoadFailed()).toBe(true);
      expect(emitted).toBe(0);
    });

    // Vermelho: sucesso → falha → recuperação não muda nenhum estado observável além do número.
    it('flags failure after success and clears it on recovery', () => {
      service.refreshSummary().subscribe();
      httpTesting.expectOne('/api/notifications/summary').flush({ unread: 3 });
      service.refreshSummary().subscribe();
      expect(service.summaryLoadFailed()).toBe(false);
      expect(service.unreadCount()).toBe(3);
      fail();
      expect(service.summaryLoadFailed()).toBe(true);
      service.refreshSummary().subscribe();
      httpTesting.expectOne('/api/notifications/summary').flush({ unread: 4 });
      expect(service.summaryLoaded()).toBe(true);
      expect(service.summaryLoadFailed()).toBe(false);
      expect(service.unreadCount()).toBe(4);
    });

    // Vermelho: a resposta atrasada da requisição anterior sobrescreve a mais recente.
    it('ignores an out-of-order response from an older request', () => {
      service.refreshSummary().subscribe();
      service.refreshSummary().subscribe();
      const [older, newer] = httpTesting.match('/api/notifications/summary');
      newer.flush({ unread: 5 });
      older.flush({ unread: 2 });
      expect(service.unreadCount()).toBe(5);

      service.refreshSummary().subscribe();
      service.refreshSummary().subscribe();
      const [olderFailure, newest] = httpTesting.match('/api/notifications/summary');
      newest.flush({ unread: 6 });
      olderFailure.flush({ message: 'erro' }, { status: 500, statusText: 'Server Error' });
      expect(service.unreadCount()).toBe(6);
      expect(service.summaryLoadFailed()).toBe(false);
    });
  });

  describe('summary preservation', () => {
    it('requests the summary outside the global loading overlay', () => {
      service.refreshSummary().subscribe();
      const request = httpTesting.expectOne('/api/notifications/summary');
      expect(request.request.context.get(SKIP_GLOBAL_LOADING)).toBe(true);
      request.flush({ unread: 1 });
    });

    it('does not start the global loading counter through the interceptor', () => {
      TestBed.resetTestingModule();
      TestBed.configureTestingModule({
        providers: [provideHttpClient(withInterceptors([loadingInterceptor])), provideHttpClientTesting()],
      });
      const intercepted = TestBed.inject(NotificationService);
      const loading = TestBed.inject(LoadingService);
      httpTesting = TestBed.inject(HttpTestingController);
      intercepted.refreshSummary().subscribe();
      expect(loading.pendingCount()).toBe(0);
      httpTesting.expectOne('/api/notifications/summary').flush({ unread: 1 });
      expect(loading.pendingCount()).toBe(0);
    });
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
