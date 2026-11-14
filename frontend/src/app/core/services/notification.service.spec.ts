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

  it('envia evento e severidade para filtro antes do limite no servidor', () => {
    service.list({ eventType: 'RMA_CREATED', severity: 'CRITICAL' }).subscribe();
    const request = httpTesting.expectOne(r => r.url === '/api/notifications');
    expect(request.request.params.get('eventType')).toBe('RMA_CREATED');
    expect(request.request.params.get('severity')).toBe('CRITICAL');
    request.flush([]);
  });

  it('consulta status e testa sem destinatério ou payload', () => {
    const status = { enabled: true, provider: 'smtp', sentToday: 3, dailyLimit: 100, sentThisMonth: 9, monthlyLimit: 3000, limitReached: false };
    service.emailStatus().subscribe(value => expect(value).toEqual(status));
    httpTesting.expectOne('/api/notification-rules/email-status').flush(status);
    service.testEmail().subscribe(value => expect(value.status).toBe('simulado'));
    const request = httpTesting.expectOne('/api/notification-rules/emails/test');
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual({});
    request.flush({ status: 'simulado', provider: 'fake' });
  });

  it('reenvia somente a notificação selecionada', () => {
    service.retryEmail(42).subscribe();
    const request = httpTesting.expectOne('/api/notification-rules/emails/42/retry');
    expect(request.request.method).toBe('POST');
    request.flush({ notificationId: 42, status: 'PENDING', provider: 'fake' });
  });

  it('sends list filters only when enabled', () => {
    service.list({ unreadOnly: true }).subscribe();
    const request = httpTesting.expectOne((candidate) => candidate.url === '/api/notifications');
    expect(request.request.params.get('unreadOnly')).toBe('true');
    expect(request.request.params.has('includeSnoozed')).toBe(false);
    request.flush([]);
  });

  it('preserves every list filter during a background inbox refresh', () => {
    service.list({ unreadOnly: true, includeSnoozed: true, eventType: 'RMA_CREATED', severity: 'WARNING', silent: true }).subscribe();
    const request = httpTesting.expectOne((candidate) => candidate.url === '/api/notifications');
    expect(request.request.params.toString()).toBe('unreadOnly=true&includeSnoozed=true&eventType=RMA_CREATED&severity=WARNING');
    expect(request.request.context.get(SKIP_GLOBAL_LOADING)).toBe(true);
    request.flush([]);
  });

  describe('reversible read-all batch', () => {
    it('serializes mark-all requests shared by the inbox and bell and releases the lock after an error', () => {
      service.markAllRead().subscribe({ error: () => undefined });
      expect(service.markingAll()).toBe(true);
      service.markAllRead().subscribe();
      httpTesting.expectOne('/api/notifications/read-all').flush({}, { status: 500, statusText: 'Error' });
      expect(service.markingAll()).toBe(false);
      service.markAllRead().subscribe();
      httpTesting.expectOne('/api/notifications/read-all').flush({ markedCount: 0, undoToken: null, expiresAt: null });
      expect(service.markingAll()).toBe(false);
    });
    const first = { markedCount: 2, undoToken: 'first-token', expiresAt: '2026-11-13T18:00:04Z' };
    const second = { markedCount: 1, undoToken: 'second-token', expiresAt: '2026-11-13T18:00:05Z' };
    const mark = (response = first) => {
      service.markAllRead().subscribe((batch) => expect(batch).toEqual(response));
      const request = httpTesting.expectOne({ method: 'POST', url: '/api/notifications/read-all' });
      expect(request.request.body).toEqual({});
      expect(request.request.context.get(SKIP_GLOBAL_LOADING)).toBe(true);
      request.flush(response);
    };

    it('shares the latest batch and restores only its token through the background endpoint', () => {
      expect(service.latestReadAll()).toBeNull();
      mark();
      expect(service.latestReadAll()).toEqual(first);
      service.undoReadAll(first.undoToken).subscribe((response) => expect(response.restoredCount).toBe(2));
      const undo = httpTesting.expectOne({ method: 'POST', url: '/api/notifications/read-all/undo' });
      expect(undo.request.body).toEqual({ token: first.undoToken });
      expect(undo.request.context.get(SKIP_GLOBAL_LOADING)).toBe(true);
      undo.flush({ restoredCount: 2 });
      expect(service.latestReadAll()).toBeNull();
    });

    it('does not clear a newer batch when an older dismiss response arrives', () => {
      mark();
      service.dismissReadAll(first.undoToken).subscribe();
      const dismiss = httpTesting.expectOne({ method: 'POST', url: '/api/notifications/read-all/dismiss' });
      expect(dismiss.request.body).toEqual({ token: first.undoToken });
      expect(dismiss.request.context.get(SKIP_GLOBAL_LOADING)).toBe(true);
      mark(second);
      dismiss.flush(null);
      expect(service.latestReadAll()).toEqual(second);
      service.dismissReadAll(second.undoToken).subscribe();
      httpTesting.expectOne('/api/notifications/read-all/dismiss').flush(null);
      expect(service.latestReadAll()).toBeNull();
    });

    it('retains the active batch when a later mark-all request fails', () => {
      mark();
      service.markAllRead().subscribe({ error: () => {} });
      httpTesting.expectOne('/api/notifications/read-all').flush({}, { status: 500, statusText: 'Server Error' });
      expect(service.latestReadAll()).toEqual(first);
    });
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

  describe('silent requests (bell popover)', () => {
    it('keeps the global loading overlay only for non-silent calls', () => {
      service.list({ unreadOnly: true, silent: true }).subscribe();
      const silent = httpTesting.expectOne(r => r.url === '/api/notifications');
      expect(silent.request.params.get('unreadOnly')).toBe('true');
      expect(silent.request.params.has('silent')).toBe(false);
      expect(silent.request.context.get(SKIP_GLOBAL_LOADING)).toBe(true);
      silent.flush([]);

      service.list().subscribe();
      const regular = httpTesting.expectOne(r => r.url === '/api/notifications');
      expect(regular.request.context.get(SKIP_GLOBAL_LOADING)).toBe(false);
      regular.flush([]);
    });

    it('marks one and all as read without the overlay when silent', () => {
      service.markRead(3, { silent: true }).subscribe();
      const one = httpTesting.expectOne('/api/notifications/3/read');
      expect(one.request.context.get(SKIP_GLOBAL_LOADING)).toBe(true);
      one.flush({});
      service.markAllRead().subscribe();
      const all = httpTesting.expectOne('/api/notifications/read-all');
      expect(all.request.context.get(SKIP_GLOBAL_LOADING)).toBe(true);
      all.flush({ markedCount: 0, undoToken: null, expiresAt: null });
      service.markRead(4).subscribe();
      const regular = httpTesting.expectOne('/api/notifications/4/read');
      expect(regular.request.context.get(SKIP_GLOBAL_LOADING)).toBe(false);
      regular.flush({});
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

    const rule: NotificationRuleRequest = { enabled: false, severity: 'CRITICAL', recipientProfileIds: [1], notifyAssignee: true, emailEnabled: false, userMutable: false };
    service.updateRule('RMA_ASSIGNED', rule).subscribe();
    const update = httpTesting.expectOne('/api/notification-rules/RMA_ASSIGNED');
    expect(update.request.method).toBe('PUT');
    expect(update.request.body).toEqual(rule);
    update.flush({});
  });
});
