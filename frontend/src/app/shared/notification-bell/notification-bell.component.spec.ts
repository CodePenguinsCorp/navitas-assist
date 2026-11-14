import { Component } from '@angular/core';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { Router, provideRouter } from '@angular/router';
import { NotificationResponse } from '../../core/models';
import { SKIP_GLOBAL_LOADING } from '../../core/interceptors/loading.interceptor';
import { LoadingService } from '../../core/services/loading.service';
import { ClockService } from '../../core/services/clock.service';
import { NotificationService } from '../../core/services/notification.service';
import { NotificationDetailModalComponent } from '../notification-detail-modal/notification-detail-modal.component';
import { NotificationBellComponent } from './notification-bell.component';

@Component({ template: '' })
class StubPageComponent {}

// America/Sao_Paulo is UTC-3 all year: fixed UTC instants keep the specs independent of the machine's time zone.
const SP_OFFSET = 3;
const NOW = Date.UTC(2026, 9, 24, 15 + SP_OFFSET, 0);
const at = (day: number, hour: number) => new Date(Date.UTC(2026, 9, day, hour + SP_OFFSET)).toISOString();
const NOTIFICATION: NotificationResponse = {
  id: 5, eventType: 'RMA_ASSIGNED', severity: 'CRITICAL', title: 'OS-2026-000007 atribuída', message: 'Cliente · Produto',
  rmaId: 7, rmaCode: 'OS-2026-000007', actionPath: '/rmas?rma=7', createdAt: at(24, 10), readAt: null, snoozedUntil: null, read: false
};
const READ: NotificationResponse = { ...NOTIFICATION, id: 6, severity: 'INFO', title: 'Peça pendente', createdAt: at(23, 9), read: true, readAt: at(23, 10) };
const OLD: NotificationResponse = { ...READ, id: 4, title: 'Antiga', createdAt: at(20, 9) };

describe('NotificationBellComponent', () => {
  let fixture: ComponentFixture<NotificationBellComponent>;
  let http: HttpTestingController;
  let router: Router;

  const host = (): HTMLElement => fixture.nativeElement;
  const bell = () => host().querySelector<HTMLButtonElement>('button.shell-notifications')!;
  const panel = () => host().querySelector<HTMLElement>('.bell-panel');
  const dialog = () => host().querySelector<HTMLElement>('app-notification-detail-modal [role="dialog"]');
  const dialogButton = (label: string) => Array.from(dialog()!.querySelectorAll('button')).find((item) => item.textContent?.trim() === label);
  const dialogText = () => dialog()!.textContent!.replace(/[\s\u00a0]+/g, ' ').trim();
  const text = () => panel()!.textContent!.replace(/\s+/g, ' ').trim();
  const items = () => Array.from(host().querySelectorAll<HTMLButtonElement>('.bell-item__main'));
  const buttonByText = (label: string) => Array.from(panel()!.querySelectorAll('button')).find((item) => item.textContent?.trim() === label)!;
  const unreadSwitch = () => panel()!.querySelector<HTMLInputElement>('input[role="switch"]')!;
  const render = async () => { fixture.detectChanges(); await fixture.whenStable(); fixture.detectChanges(); };
  const flushSummary = (unread: number) => http.match('/api/notifications/summary').forEach((request) => request.flush({ unread }));
  const listRequest = () => http.expectOne((request) => request.url === '/api/notifications');

  async function openWith(list: NotificationResponse[] | 'fail', unread = 1) {
    bell().click();
    await render();
    const request = listRequest();
    if (list === 'fail') request.flush({ message: 'Falhou' }, { status: 500, statusText: 'Server Error' });
    else request.flush(list);
    flushSummary(unread);
    await render();
  }

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [NotificationBellComponent],
      providers: [
        provideHttpClient(), provideHttpClientTesting(),
        provideRouter([{ path: 'rmas', component: StubPageComponent }, { path: 'notificacoes', component: StubPageComponent }]),
        { provide: ClockService, useValue: { now: () => NOW } }
      ]
    }).compileComponents();
    http = TestBed.inject(HttpTestingController);
    router = TestBed.inject(Router);
    fixture = TestBed.createComponent(NotificationBellComponent);
    document.body.appendChild(host());
    await render();
  });

  afterEach(() => {
    host().remove();
    http.verify();
  });

  it('is a popup button, closed by default, keeping the unread badge from the shared summary', async () => {
    expect(bell().getAttribute('aria-haspopup')).toBe('dialog');
    expect(bell().getAttribute('aria-expanded')).toBe('false');
    expect(panel()).toBeNull();
    expect(bell().getAttribute('aria-label')).toBe('Notificações');

    TestBed.inject(NotificationService).refreshSummary().subscribe();
    flushSummary(120);
    await render();
    expect(bell().querySelector('.count-badge')?.textContent?.trim()).toBe('99+');
    expect(bell().getAttribute('aria-label')).toBe('Notificações: 120 não lida(s)');
  });

  it('opens the panel without leaving the page, focuses it and lists recent items grouped by day', async () => {
    const navigate = vi.spyOn(router, 'navigate');
    await openWith([OLD, NOTIFICATION, READ]);

    expect(navigate).not.toHaveBeenCalled();
    expect(bell().getAttribute('aria-expanded')).toBe('true');
    expect(bell().getAttribute('aria-controls')).toBe(panel()!.id);
    expect(document.activeElement).toBe(panel());
    expect(Array.from(host().querySelectorAll('.bell-day')).map((day) => day.textContent?.trim())).toEqual(['Hoje', 'Ontem', '20/10/2026']);
    expect(items().map((item) => item.querySelector('.bell-item__title')?.textContent?.trim())).toEqual([NOTIFICATION.title, READ.title, OLD.title]);
    expect(items()[0].querySelector('.mini-chip')?.textContent?.trim()).toBe('Crítico');
    expect(host().querySelector('.bell-item time')?.textContent?.trim()).toBe('10:00');
    expect(host().querySelectorAll('.bell-item.is-unread').length).toBe(1);
    expect(panel()!.querySelector<HTMLAnchorElement>('a[href="/notificacoes"]')?.textContent?.trim()).toBe('Ver todas');
  });

  it('never opens the global loading while the panel loads or acts', async () => {
    const loading = TestBed.inject(LoadingService);
    bell().click();
    await render();
    const request = listRequest();
    expect(request.request.context.get(SKIP_GLOBAL_LOADING)).toBe(true);
    const summary = http.expectOne('/api/notifications/summary');
    expect(loading.pendingCount()).toBe(0);
    expect(panel()!.textContent).toContain('Carregando notificações...');
    request.flush([NOTIFICATION]);
    summary.flush({ unread: 1 });
    await render();

    panel()!.querySelector<HTMLButtonElement>('button[aria-label="Marcar como lida OS-2026-000007 atribuída"]')!.click();
    const read = http.expectOne({ method: 'POST', url: '/api/notifications/5/read' });
    expect(read.request.context.get(SKIP_GLOBAL_LOADING)).toBe(true);
    read.flush({ ...NOTIFICATION, read: true });
    flushSummary(0);
    await render();

    buttonByText('Marcar todas como lidas').disabled = false;
    unreadSwitch().click();
    await render();
    expect(listRequest().request.context.get(SKIP_GLOBAL_LOADING)).toBe(true);
    flushSummary(0);
    expect(loading.pendingCount()).toBe(0);
    expect(panel()).not.toBeNull();
  });

  it('keeps the action column in read and unread rows so the time stays aligned', async () => {
    await openWith([NOTIFICATION, READ]);
    const rows = Array.from(host().querySelectorAll<HTMLElement>('.bell-item'));
    const slots = rows.map((row) => row.querySelector('.bell-item__action'));
    expect(slots.every(Boolean)).toBe(true);
    expect(slots[0]!.querySelector('button')).not.toBeNull();
    expect(slots[1]!.querySelector('button')).toBeNull();
    expect(slots[1]!.getAttribute('aria-hidden')).toBe('true');
  });

  it('reloads with only unread items when the switch is turned on', async () => {
    await openWith([NOTIFICATION, READ]);
    unreadSwitch().click();
    await render();
    const request = listRequest();
    expect(request.request.params.get('unreadOnly')).toBe('true');
    request.flush([]);
    flushSummary(1);
    await render();
    expect(unreadSwitch().checked).toBe(true);
    expect(panel()!.querySelector('.empty-state')?.textContent).toContain('Nenhuma notificação não lida');
  });

  it('shows the summary beside the severity, without repeating the event type', async () => {
    await openWith([NOTIFICATION]);
    const meta = items()[0].querySelector<HTMLElement>('.bell-item__meta')!;
    expect(meta.querySelector('.mini-chip')!.textContent!.trim()).toBe('Crítico');
    expect(meta.querySelector('.bell-item__summary')!.textContent!.trim()).toBe('Cliente · Produto');
    expect(meta.textContent).not.toContain('Nova atribuição');
  });

  describe('detail dialog', () => {
    async function openDetail(list: NotificationResponse[] = [NOTIFICATION]) {
      await openWith(list);
      items()[0].click();
      await render();
    }

    async function settleRead(item: NotificationResponse = NOTIFICATION) {
      const read = http.expectOne({ method: 'POST', url: `/api/notifications/${item.id}/read` });
      expect(read.request.context.get(SKIP_GLOBAL_LOADING)).toBe(true);
      read.flush({ ...item, read: true });
      flushSummary(0);
      await render();
    }

    afterEach(() => { document.body.style.overflow = ''; });

    it('opens over the page with the full content, closes the popover, marks it read silently and does not navigate', async () => {
      const navigate = vi.spyOn(router, 'navigate');
      const loading = TestBed.inject(LoadingService);
      await openDetail([{ ...NOTIFICATION, message: 'Linha 1\nLinha 2' }]);

      expect(dialog()).not.toBeNull();
      expect(panel()).toBeNull();
      expect(dialog()!.querySelector('h3')!.textContent).toBe(NOTIFICATION.title);
      expect(dialogText()).toContain('Crítico');
      expect(dialogText()).toContain('Nova atribuição');
      expect(dialogText()).toContain('24 de outubro de 2026 às 10:00');
      expect(dialogText()).toContain('(há 5 h)');
      expect(dialogText()).toContain('Não lida');
      expect(dialog()!.querySelector('.notification-detail__message')!.textContent).toBe('Linha 1\nLinha 2');
      expect(loading.pendingCount()).toBe(0);
      await settleRead();
      expect(dialogText()).toContain('Lida');
      expect(dialogButton('Marcar como lida')).toBeUndefined();
      expect(navigate).not.toHaveBeenCalled();
    });

    it('Abrir OS is the only action that navigates, to the internal path, and closes the dialog', async () => {
      await openDetail();
      await settleRead();
      dialogButton('Abrir OS')!.click();
      await render();
      expect(router.url).toBe('/rmas?rma=7');
      expect(dialog()).toBeNull();
    });

    it('rejects an external path: no Abrir OS and no navigation', async () => {
      const navigate = vi.spyOn(router, 'navigate');
      await openDetail([{ ...NOTIFICATION, actionPath: 'https://externo' }]);
      await settleRead();
      expect(dialog()).not.toBeNull();
      expect(dialogButton('Abrir OS')).toBeUndefined();
      expect(navigate).not.toHaveBeenCalled();
    });

    it('closes with Escape and returns focus to the bell', async () => {
      bell().focus();
      await openDetail();
      await settleRead();
      expect(document.activeElement).toBe(dialog()!.querySelector('h3'));
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      await render();
      expect(dialog()).toBeNull();
      expect(document.activeElement).toBe(bell());
    });

    it('closes with Fechar and keeps the read state in the list', async () => {
      await openDetail();
      await settleRead();
      dialogButton('Fechar')!.click();
      await render();
      expect(dialog()).toBeNull();
      bell().click();
      await render();
      listRequest().flush([{ ...NOTIFICATION, read: true }]);
      flushSummary(0);
      await render();
      expect(host().querySelectorAll('.bell-item.is-unread').length).toBe(0);
    });

    it('snoozes silently from the dialog and closes it', async () => {
      await openDetail();
      await settleRead();
      fixture.debugElement.query(By.directive(NotificationDetailModalComponent)).componentInstance.snoozed.emit(60);
      const snooze = http.expectOne({ method: 'POST', url: '/api/notifications/5/snooze' });
      expect(snooze.request.body).toEqual({ minutes: 60 });
      expect(snooze.request.context.get(SKIP_GLOBAL_LOADING)).toBe(true);
      snooze.flush({ ...NOTIFICATION, read: true, snoozedUntil: at(24, 16) });
      flushSummary(0);
      await render();
      expect(dialog()).toBeNull();
    });

    it('walks through the listed notifications with Anterior and Próxima', async () => {
      await openDetail([NOTIFICATION, READ]);
      await settleRead();
      const next = dialog()!.querySelector<HTMLButtonElement>('button[aria-label="Próxima notificação"]')!;
      expect(dialog()!.querySelector<HTMLButtonElement>('button[aria-label="Notificação anterior"]')!.disabled).toBe(true);
      next.click();
      await render();
      expect(dialog()!.querySelector('h3')!.textContent).toBe(READ.title);
      expect(next.disabled).toBe(true);
    });

    it('the row icon marks as read without opening the dialog', async () => {
      await openWith([NOTIFICATION]);
      panel()!.querySelector<HTMLButtonElement>('button[aria-label="Marcar como lida OS-2026-000007 atribuída"]')!.click();
      await settleRead();
      expect(dialog()).toBeNull();
      expect(panel()).not.toBeNull();
    });

    it('closes when the route changes', async () => {
      await openDetail([READ]);
      await router.navigateByUrl('/notificacoes');
      await render();
      expect(dialog()).toBeNull();
    });
  });

  it('marks a single item as read from its row action and keeps the panel open', async () => {
    await openWith([NOTIFICATION, READ]);
    panel()!.querySelector<HTMLButtonElement>('button[aria-label="Marcar como lida OS-2026-000007 atribuída"]')!.click();
    http.expectOne({ method: 'POST', url: '/api/notifications/5/read' }).flush({ ...NOTIFICATION, read: true });
    flushSummary(0);
    await render();
    expect(host().querySelectorAll('.bell-item.is-unread').length).toBe(0);
    expect(panel()).not.toBeNull();
  });

  it('marks all as read, reloads the list and is disabled when nothing is unread', async () => {
    await openWith([NOTIFICATION]);
    buttonByText('Marcar todas como lidas').click();
    http.expectOne({ method: 'POST', url: '/api/notifications/read-all' }).flush(null);
    await render();
    listRequest().flush([{ ...NOTIFICATION, read: true }]);
    flushSummary(0);
    await render();
    expect(buttonByText('Marcar todas como lidas').disabled).toBe(true);
  });

  it('shows the empty and error states, with retry', async () => {
    await openWith('fail');
    expect(panel()!.querySelector('.empty-state[role="alert"]')?.textContent).toContain('Falhou');
    buttonByText('Tentar novamente').click();
    await render();
    listRequest().flush([]);
    flushSummary(0);
    await render();
    expect(panel()!.querySelector('.empty-state')?.textContent).toContain('Nenhuma notificação');
  });

  it('closes with Escape and returns focus to the bell', async () => {
    await openWith([NOTIFICATION]);
    panel()!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await render();
    expect(panel()).toBeNull();
    expect(bell().getAttribute('aria-expanded')).toBe('false');
    expect(document.activeElement).toBe(bell());
  });

  it('closes on a click outside and when the route changes', async () => {
    await openWith([NOTIFICATION]);
    document.body.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }));
    await render();
    expect(panel()).toBeNull();

    await openWith([NOTIFICATION]);
    panel()!.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }));
    await render();
    expect(panel()).not.toBeNull();
    await router.navigateByUrl('/notificacoes');
    await render();
    expect(panel()).toBeNull();
  });

  it('moves focus between items with the arrow keys', async () => {
    await openWith([NOTIFICATION, READ, OLD]);
    const key = (name: string) => (document.activeElement as HTMLElement).dispatchEvent(new KeyboardEvent('keydown', { key: name, bubbles: true }));
    key('ArrowDown');
    expect(document.activeElement).toBe(items()[0]);
    key('ArrowDown');
    expect(document.activeElement).toBe(items()[1]);
    key('ArrowUp');
    key('ArrowUp');
    expect(document.activeElement).toBe(items()[2]);
    key('Home');
    expect(document.activeElement).toBe(items()[0]);
    key('End');
    expect(document.activeElement).toBe(items()[2]);
  });

  it('toggles closed from the bell itself', async () => {
    await openWith([]);
    bell().click();
    await render();
    expect(panel()).toBeNull();
  });
});
