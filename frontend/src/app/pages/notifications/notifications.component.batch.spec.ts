import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ChangeDetectorRef, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { NotificationResponse } from '../../core/models';
import { ProfileService } from '../../core/services/profile.service';
import { NotificationService } from '../../core/services/notification.service';
import { loadingInterceptor } from '../../core/interceptors/loading.interceptor';
import { LoadingService } from '../../core/services/loading.service';
import { ClockService } from '../../core/services/clock.service';
import { profilePermissions, providePermissions } from '../../testing/permission-fixtures';
import { NotificationsComponent } from './notifications.component';

const NOW = Date.parse('2026-11-12T12:00:00Z');
const ROW: NotificationResponse = {
  id: 1, eventType: 'RMA_CREATED', severity: 'INFO', title: 'Notificação 1', message: 'Cliente · Produto',
  rmaId: null, rmaCode: null, actionPath: null, createdAt: '2026-11-12T10:00:00Z',
  readAt: null, snoozedUntil: null, read: false
};
const TOKEN = '11111111-1111-4111-8111-111111111111';
const NEXT_TOKEN = '22222222-2222-4222-8222-222222222222';

describe('Notifications inbox ordering and batch undo', () => {
  let fixture: ComponentFixture<NotificationsComponent>;
  let http: HttpTestingController;
  const root = () => fixture.nativeElement as HTMLElement;
  const render = () => { fixture.componentRef.injector.get(ChangeDetectorRef).markForCheck(); fixture.detectChanges(); };
  const button = (text: string) => Array.from(root().querySelectorAll<HTMLButtonElement>('button'))
    .find(b => b.textContent?.trim() === text || b.getAttribute('aria-label') === text)!;
  const click = (text: string) => { button(text).click(); render(); };
  const titles = () => Array.from(root().querySelectorAll('.notification-title')).map(e => e.textContent?.trim());
  const rows = (ids: number[]) => ids.map(id => ({ ...ROW, id, title: `Notificação ${id}` }));
  const flushInbox = (items = [ROW], unread = 1) => {
    http.expectOne(r => r.url === '/api/notifications').flush(items);
    http.expectOne('/api/notifications/summary').flush({ unread }); render();
  };
  const mark = (count = 105, token = TOKEN, remaining = 4000) => {
    click('Marcar todas como lidas');
    http.expectOne('/api/notifications/read-all').flush({ markedCount: count, undoToken: count ? token : null,
      expiresAt: count ? new Date(Date.now() + remaining).toISOString() : null });
    flushInbox([{ ...ROW, read: true, readAt: new Date(NOW).toISOString() }], 0);
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [NotificationsComponent],
      providers: [provideRouter([]), provideHttpClient(withInterceptors([loadingInterceptor])), provideHttpClientTesting(),
        providePermissions(profilePermissions('ADMIN')),
        { provide: ProfileService, useValue: { options: () => of([]), invalidateOptions: () => undefined } },
        { provide: ClockService, useValue: { now: signal(NOW) } }]
    }).compileComponents();
    vi.useFakeTimers({ toFake: ['Date', 'setTimeout', 'clearTimeout'] });
    vi.setSystemTime(NOW);
    http = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(NotificationsComponent);
    flushInbox();
  });

  afterEach(() => {
    fixture.destroy();
    for (const request of http.match('/api/notifications/read-all/dismiss')) request.flush(null);
    http.verify(); vi.useRealTimers();
  });

  it('reverses dates and tie-breaking IDs without replacing the latest 100 rows or making a request', () => {
    // The loaded set is always chosen by the server; a local toggle must not fetch archive rows.
    const initial = rows([1, ...Array.from({ length: 99 }, (_, i) => 100 - i)]);
    initial[0].createdAt = '2026-11-12T11:00:00Z';
    button('Caixa de entrada (1 não lida)').click(); flushInbox(initial, 100);
    expect(titles().slice(0, 3)).toEqual(['Notificação 1', 'Notificação 100', 'Notificação 99']);
    const toggle = button('Ordem: mais recentes primeiro. Inverter ordem');
    expect(toggle).toBeDefined(); toggle.focus(); toggle.click(); render();
    expect(titles().slice(0, 2)).toEqual(['Notificação 2', 'Notificação 3']);
    expect(titles().at(-1)).toBe('Notificação 1'); expect(titles()).toHaveLength(100);
    expect(document.activeElement).toBe(toggle);
    expect(toggle.querySelector('app-icon path')?.getAttribute('d')).toBe('M5 20V4');
    click('Ordem: mais antigas primeiro. Inverter ordem');
    expect(titles()[0]).toBe('Notificação 1');
    expect(root().textContent).toContain('Mostra as 100 notificações mais recentes, dentro dos filtros selecionados.');
  });

  it('preserves the selected order and filters across marking and undo reloads', () => {
    click('Ordem: mais recentes primeiro. Inverter ordem');
    button('Somente não lidas').click();
    const filtered = http.expectOne(r => r.url === '/api/notifications');
    expect(filtered.request.params.get('unreadOnly')).toBe('true'); filtered.flush(rows([3, 2]));
    http.expectOne('/api/notifications/summary').flush({ unread: 2 }); render();
    expect(titles()).toEqual(['Notificação 2', 'Notificação 3']);
    mark(2);
    click('Desmarcar mensagens');
    const undo = http.expectOne('/api/notifications/read-all/undo');
    expect(undo.request.body).toEqual({ token: TOKEN }); undo.flush({ restoredCount: 2 });
    const reloaded = http.expectOne(r => r.url === '/api/notifications');
    expect(reloaded.request.params.get('unreadOnly')).toBe('true'); reloaded.flush(rows([3, 2]));
    http.expectOne('/api/notifications/summary').flush({ unread: 2 }); render();
    expect(titles()).toEqual(['Notificação 2', 'Notificação 3']);
    expect(root().querySelectorAll('.notification-item.is-unread')).toHaveLength(2);
    expect(root().querySelector('.read-batch-toast')).toBeNull();
  });

  it('announces the server count and closes exactly at four seconds without moving focus', () => {
    const markButton = button('Marcar todas como lidas'); markButton.focus(); mark();
    const popup = root().querySelector('.read-batch-toast')!;
    expect(popup.textContent).toContain('105 mensagens marcada(s) como lida');
    expect(popup.querySelector('[role="status"]')).not.toBeNull();
    expect(button('Fechar aviso de leitura')).toBeDefined();
    expect(document.activeElement).toBe(markButton);
    vi.advanceTimersByTime(3999); render(); expect(root().querySelector('.read-batch-toast')).not.toBeNull();
    vi.advanceTimersByTime(1); render(); expect(root().querySelector('.read-batch-toast')).toBeNull();
    vi.advanceTimersByTime(1000); render(); expect(root().querySelector('.read-batch-toast')).toBeNull();
  });

  it('uses the remaining server validity instead of extending a delayed response by another four seconds', () => {
    mark(1, TOKEN, 1200);
    vi.advanceTimersByTime(1199); render(); expect(button('Desmarcar mensagens')).toBeDefined();
    vi.advanceTimersByTime(1); render(); expect(root().querySelector('.read-batch-toast')).toBeNull();
  });

  it('runs the countdown for the remaining popup lifetime and restarts it for a new batch', () => {
    mark(1, TOKEN, 1200);
    const first = root().querySelector<HTMLElement>('.read-batch-progress');
    expect(first).not.toBeNull();
    expect(first!.style.animationDuration).toBe('1200ms');
    vi.advanceTimersByTime(500);
    button('Caixa de entrada').click(); flushInbox(); mark(1, NEXT_TOKEN);
    const next = root().querySelector<HTMLElement>('.read-batch-progress');
    expect(next).not.toBe(first);
    expect(next!.style.animationDuration).toBe('4000ms');
    expect(next!.getAttribute('aria-hidden')).toBe('true');
    vi.advanceTimersByTime(3999); render(); expect(root().querySelector('.read-batch-progress')).toBe(next);
    vi.advanceTimersByTime(1); render(); expect(root().querySelector('.read-batch-progress')).toBeNull();
  });

  it('does not offer an already expired response or a zero-change undo', () => {
    mark(1, TOKEN, 0); expect(root().querySelector('.read-batch-toast')).toBeNull();
    button('Caixa de entrada').click(); flushInbox(); mark(0);
    expect(root().querySelector('.read-batch-toast')).toBeNull();
    expect(root().textContent).not.toContain('mensagens marcada(s)');
  });

  it('invalidates on close and prevents duplicate submissions while pending', () => {
    click('Marcar todas como lidas'); click('Marcar todas como lidas');
    http.expectOne('/api/notifications/read-all').flush({ markedCount: 1, undoToken: TOKEN, expiresAt: new Date(NOW + 4000).toISOString() });
    flushInbox([{ ...ROW, read: true }], 0);
    click('Fechar aviso de leitura');
    const dismiss = http.expectOne('/api/notifications/read-all/dismiss'); expect(dismiss.request.body).toEqual({ token: TOKEN });
    expect(button('Desmarcar mensagens').disabled).toBe(true);
    click('Fechar aviso de leitura'); http.expectNone('/api/notifications/read-all/dismiss');
    dismiss.flush(null); render(); expect(root().querySelector('.read-batch-toast')).toBeNull();
  });

  it('replaces the last batch and its timer; the old timeout cannot close the new popup', () => {
    mark(1); vi.advanceTimersByTime(3000);
    button('Caixa de entrada').click(); flushInbox(); mark(2, NEXT_TOKEN);
    vi.advanceTimersByTime(1000); render(); expect(root().textContent).toContain('2 mensagens marcada(s) como lida');
    click('Desmarcar mensagens');
    const undo = http.expectOne('/api/notifications/read-all/undo'); expect(undo.request.body).toEqual({ token: NEXT_TOKEN });
    click('Desmarcar mensagens'); http.expectNone('/api/notifications/read-all/undo');
    undo.flush({ restoredCount: 2 }); flushInbox(rows([1, 2]), 2);
    expect(root().querySelector('.read-batch-toast')).toBeNull();
    vi.advanceTimersByTime(4000); render(); expect(root().querySelector('.read-batch-toast')).toBeNull();
  });

  it('reports failures without announcing success and keeps close eligible until the server accepts it', () => {
    click('Marcar todas como lidas');
    http.expectOne('/api/notifications/read-all').flush({}, { status: 500, statusText: 'Error' }); render();
    expect(root().querySelector('.read-batch-toast')).toBeNull();
    expect(root().querySelector('[role="alert"]')).not.toBeNull();
    mark(1); click('Fechar aviso de leitura');
    http.expectOne('/api/notifications/read-all/dismiss').flush({}, { status: 500, statusText: 'Error' }); render();
    expect(button('Desmarcar mensagens').disabled).toBe(false);
    click('Desmarcar mensagens');
    http.expectOne('/api/notifications/read-all/undo').flush({}, { status: 400, statusText: 'Expired' }); render();
    expect(root().textContent).not.toContain('Leitura desfeita');
    expect(root().querySelector('[role="alert"]')).not.toBeNull();
  });

  it('allows the global action when the visible set is empty and the summary still has unread rows', () => {
    button('Caixa de entrada (1 não lida)').click(); flushInbox([], 5);
    expect(button('Marcar todas como lidas').disabled).toBe(false);
    mark(5); expect(root().textContent).toContain('5 mensagens marcada(s) como lida');
  });

  it('allows a global batch when all unread messages are hidden by snooze and the summary is zero', () => {
    button('Caixa de entrada (1 não lida)').click(); flushInbox([], 0);
    expect(button('Marcar todas como lidas').disabled).toBe(false);
    mark(1); expect(root().textContent).toContain('1 mensagens marcada(s) como lida');
  });

  it('keeps the undo popup nonmodal during slow batch requests and the subsequent inbox refresh', () => {
    const loading = TestBed.inject(LoadingService);
    click('Marcar todas como lidas');
    const markRequest = http.expectOne('/api/notifications/read-all');
    vi.advanceTimersByTime(300); render(); expect(loading.visible()).toBe(false);
    markRequest.flush({ markedCount: 1, undoToken: TOKEN, expiresAt: new Date(Date.now() + 4000).toISOString() });
    const slowRefresh = http.expectOne(r => r.url === '/api/notifications');
    http.expectOne('/api/notifications/summary').flush({ unread: 0 });
    vi.advanceTimersByTime(3000); render();
    expect(loading.pendingCount()).toBe(0); expect(loading.visible()).toBe(false);
    expect(button('Desmarcar mensagens').disabled).toBe(false);
    click('Desmarcar mensagens');
    const undo = http.expectOne('/api/notifications/read-all/undo');
    vi.advanceTimersByTime(300); render(); expect(loading.visible()).toBe(false);
    undo.flush({ restoredCount: 1 });
    expect(slowRefresh.cancelled).toBe(true);
    flushInbox(); expect(root().querySelector('.read-batch-toast')).toBeNull();
  });

  it('clears its timer and invalidates the outstanding batch when leaving the page', () => {
    mark(1); fixture.destroy();
    const dismiss = http.expectOne('/api/notifications/read-all/dismiss'); expect(dismiss.request.body).toEqual({ token: TOKEN }); dismiss.flush(null);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('dismisses a late mark-all after navigation without opening a popup or refreshing the destroyed page', () => {
    click('Marcar todas como lidas');
    const pending = http.expectOne('/api/notifications/read-all');
    fixture.destroy();
    expect(pending.cancelled).toBe(false);
    pending.flush({ markedCount: 1, undoToken: TOKEN, expiresAt: new Date(NOW + 4000).toISOString() });
    http.expectOne('/api/notifications/read-all/dismiss').flush(null);
    expect(vi.getTimerCount()).toBe(0);
    http.expectNone('/api/notifications');
    http.expectNone('/api/notifications/read-all/dismiss');
  });

  it('cancels a pending undo on navigation and invalidates the current batch once', () => {
    mark(1); click('Desmarcar mensagens');
    const pending = http.expectOne('/api/notifications/read-all/undo');
    fixture.destroy();
    expect(pending.cancelled).toBe(true);
    const dismiss = http.expectOne('/api/notifications/read-all/dismiss');
    expect(dismiss.request.body).toEqual({ token: TOKEN }); dismiss.flush(null);
    expect(vi.getTimerCount()).toBe(0);
    http.expectNone('/api/notifications');
  });

  it('lets an in-flight dismissal finish after navigation without issuing a duplicate', () => {
    mark(1); click('Fechar aviso de leitura');
    const pending = http.expectOne('/api/notifications/read-all/dismiss');
    fixture.destroy();
    expect(pending.cancelled).toBe(false);
    http.expectNone('/api/notifications/read-all/dismiss');
    pending.flush(null);
    expect(vi.getTimerCount()).toBe(0);
    http.expectNone('/api/notifications');
  });

  it('keeps an expired popup closed while an already-submitted undo finishes', () => {
    mark(1); click('Desmarcar mensagens');
    const pending = http.expectOne('/api/notifications/read-all/undo');
    vi.advanceTimersByTime(4000); render();
    expect(root().querySelector('.read-batch-toast')).toBeNull();
    pending.flush({ restoredCount: 1 }); flushInbox();
    expect(root().querySelector('.read-batch-toast')).toBeNull();
    expect(root().textContent).toContain('Leitura desfeita.');
  });

  it('does not offer undo when the mark-all response arrives after its deadline', () => {
    click('Marcar todas como lidas');
    const pending = http.expectOne('/api/notifications/read-all');
    vi.advanceTimersByTime(5000);
    pending.flush({ markedCount: 1, undoToken: TOKEN, expiresAt: new Date(NOW + 4000).toISOString() });
    flushInbox([{ ...ROW, read: true }], 0);
    expect(root().querySelector('.read-batch-toast')).toBeNull();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('invalidates the page undo and refreshes rows after a newer batch from the bell', () => {
    mark(1);
    TestBed.inject(NotificationService).markAllRead().subscribe();
    http.expectOne('/api/notifications/read-all').flush({ markedCount: 1, undoToken: NEXT_TOKEN, expiresAt: new Date(NOW + 4000).toISOString() });
    render(); flushInbox([{ ...ROW, read: true }], 0);
    expect(root().querySelector('.read-batch-toast')).toBeNull();
    expect(vi.getTimerCount()).toBe(0);
    http.expectNone('/api/notifications/read-all/undo');
  });

  it('refreshes the page when the bell batch and its dismissal finish before the next render', () => {
    mark(1);
    const service = TestBed.inject(NotificationService);
    service.markAllRead().subscribe();
    http.expectOne('/api/notifications/read-all').flush({ markedCount: 1, undoToken: NEXT_TOKEN, expiresAt: new Date(NOW + 4000).toISOString() });
    service.dismissReadAll(NEXT_TOKEN).subscribe();
    http.expectOne('/api/notifications/read-all/dismiss').flush(null);
    render(); flushInbox([{ ...ROW, read: true }], 0);
    expect(root().querySelector('.read-batch-toast')).toBeNull();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('reverses day groups together with their compact rows and keeps the filter toggles', () => {
    const initial = [
      { ...ROW, id: 3, title: 'Hoje 3', createdAt: '2026-11-12T10:00:00Z' },
      { ...ROW, id: 2, title: 'Ontem 2', createdAt: '2026-11-11T11:00:00Z' },
      { ...ROW, id: 1, title: 'Ontem 1', createdAt: '2026-11-11T10:00:00Z' }
    ];
    button('Caixa de entrada (1 não lida)').click(); flushInbox(initial, 3);
    expect(Array.from(root().querySelectorAll('.notification-day')).map(e => e.textContent)).toEqual(['Hoje', 'Ontem']);
    click('Ordem: mais recentes primeiro. Inverter ordem');
    expect(Array.from(root().querySelectorAll('.notification-day')).map(e => e.textContent)).toEqual(['Ontem', 'Hoje']);
    expect(titles()).toEqual(['Ontem 1', 'Ontem 2', 'Hoje 3']);
    expect(root().querySelectorAll('.inbox-toggle[aria-pressed]')).toHaveLength(2);
    expect(root().querySelectorAll('.notification-rows li')).toHaveLength(3);
  });
});
