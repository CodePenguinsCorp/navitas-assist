import { Component } from '@angular/core';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { NotificationResponse } from '../../core/models';
import { SKIP_GLOBAL_LOADING } from '../../core/interceptors/loading.interceptor';
import { LoadingService } from '../../core/services/loading.service';
import { ClockService } from '../../core/services/clock.service';
import { NotificationService } from '../../core/services/notification.service';
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
const READ: NotificationResponse = { ...NOTIFICATION, id: 6, severity: 'INFO', title: 'Peça pendente', createdAt: at(24, 9), read: true, readAt: at(24, 10) };
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

  it('considera a virada do dia em São Paulo, mesmo com a data UTC de hoje', async () => {
    await openWith([
      { ...READ, id: 40, createdAt: '2026-10-24T02:59:59Z' },
      { ...READ, id: 41, createdAt: '2026-10-24T03:00:00Z' }
    ]);
    expect(items()).toHaveLength(1);
    expect(host().querySelector('time')?.getAttribute('datetime')).toBe('2026-10-24T03:00:00Z');
  });

  it('mantém a navegação no modal após ler uma antiga que sai do sino', async () => {
    await openWith([{ ...OLD, read: false }, { ...READ, createdAt: at(19, 9), read: false }]);
    items()[0].click(); await render();
    http.expectOne({ method: 'POST', url: '/api/notifications/4/read' }).flush({ ...OLD, read: true });
    flushSummary(1); await render();
    const next = dialog()!.querySelector<HTMLButtonElement>('button[aria-label="Próxima notificação"]')!;
    expect(next.disabled).toBe(false);
    next.click(); await render();
    http.expectOne({ method: 'POST', url: '/api/notifications/6/read' }).flush({ ...READ, read: true });
    flushSummary(0); await render();
    const previous = dialog()!.querySelector<HTMLButtonElement>('button[aria-label="Notificação anterior"]')!;
    expect(previous.disabled).toBe(false);
    previous.click(); await render();
    http.expectNone((request) => request.url.endsWith('/read'));
  });

  it('mantém antigas não lidas e exclui lidas anteriores a hoje', async () => {
    await openWith([OLD, { ...OLD, id: 30, read: false }, READ]);
    expect(items()).toHaveLength(2);
    expect(host().querySelectorAll('.bell-item.is-unread')).toHaveLength(1);
    expect(items().every(item => item.querySelector('.bell-item__chevron'))).toBe(true);
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
    expect(Array.from(host().querySelectorAll('.bell-day')).map((day) => day.textContent?.trim())).toEqual(['Hoje']);
    expect(items().map((item) => item.querySelector('.bell-item__title')?.textContent?.trim()))
      .toEqual([NOTIFICATION.title, 'Peça pendente · OS-2026-000007']);
    expect(items()[0].querySelector('.bell-item__head .mini-chip')?.textContent?.trim()).toBe('Crítico');
    expect(host().querySelector('.bell-item time')?.textContent?.trim()).toBe('10:00');
    expect(host().querySelectorAll('.bell-item.is-unread').length).toBe(1);
    expect(panel()!.querySelector<HTMLAnchorElement>('a[href="/notificacoes"]')?.textContent?.trim()).toBe('Ver todas');
  });

  it('opens detail from the shared scroll area and marks the notification read', async () => {
    await openWith([NOTIFICATION, READ]);
    const body = panel()!.querySelector('.bell-panel__body.app-scroll')!;
    expect(body.querySelectorAll('.bell-item__main')).toHaveLength(2);
    body.querySelector<HTMLButtonElement>('.bell-item__main')!.click();
    await render();
    expect(panel()).toBeNull();
    expect(dialog()).not.toBeNull();
    http.expectOne({ method: 'POST', url: '/api/notifications/5/read' }).flush({ ...NOTIFICATION, read: true });
    flushSummary(0);
    await render();
    expect(dialog()!.querySelector('[aria-label="Não lida"]')).toBeNull();
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

    items()[0].click();
    await render();
    const read = http.expectOne({ method: 'POST', url: '/api/notifications/5/read' });
    expect(read.request.context.get(SKIP_GLOBAL_LOADING)).toBe(true);
    read.flush({ ...NOTIFICATION, read: true });
    flushSummary(0);
    await render();

    dialog()!.querySelector<HTMLButtonElement>('button[aria-label="Fechar"]')!.click();
    await render();
    bell().click();
    await render();
    listRequest().flush([{ ...NOTIFICATION, read: true }]);
    flushSummary(0);
    await render();
    unreadSwitch().click();
    await render();
    const filtered = listRequest();
    expect(filtered.request.context.get(SKIP_GLOBAL_LOADING)).toBe(true);
    filtered.flush([]);
    flushSummary(0);
    expect(loading.pendingCount()).toBe(0);
    expect(panel()).not.toBeNull();
  });

  it('keeps timestamps beside both read and unread notifications', async () => {
    await openWith([NOTIFICATION, READ]);
    const rows = Array.from(host().querySelectorAll<HTMLElement>('.bell-item'));
    expect(rows.map((row) => row.querySelector('time')!.getAttribute('datetime')))
      .toEqual([NOTIFICATION.createdAt, READ.createdAt]);
    expect(rows.map((row) => row.classList.contains('is-unread'))).toEqual([true, false]);
    expect(rows.every((row) => row.querySelector('.bell-item__side time'))).toBe(true);
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

  it('names the OS code once in the row title, as in the detail dialog', async () => {
    await openWith([
      { ...NOTIFICATION, id: 8, title: 'Nova OS OS-2026-000007' },
      { ...NOTIFICATION, id: 9, title: 'Impedimento na OS OS-2026-000004', rmaCode: 'OS-2026-000004', createdAt: at(24, 9) }
    ]);
    expect(items().map((item) => item.querySelector('.bell-item__title')!.textContent!.trim()))
      .toEqual(['Nova OS · OS-2026-000007', 'Impedimento · OS-2026-000004']);
    expect(items()[0].textContent).toContain('Não lida:');
  });

  it('oferece toda a superfície como botão com ícone, resumo, hora e seta', async () => {
    await openWith([NOTIFICATION]);
    const main = items()[0];
    expect(main.querySelector('.bell-item__icon app-icon')).not.toBeNull();
    expect(main.querySelector('.bell-item__summary')!.textContent!.trim()).toBe('Cliente · Produto');
    expect(main.querySelector('time')!.textContent!.trim()).toBe('10:00');
    expect(main.querySelector('.bell-item__chevron')).not.toBeNull();
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
      expect(dialog()!.querySelector('h3')!.textContent!.trim()).toBe('Nova atribuição');
      expect(dialog()!.querySelector('[role="img"]')!.getAttribute('aria-label')).toBe('Crítico');
      expect(dialogText()).toContain('Nova atribuição');
      expect(dialog()!.querySelector('.notification-detail__meta')!.textContent).toContain('24/10/2026, 10:00');
      expect(dialogText()).toContain('há 5 h');
      expect(dialog()!.querySelector('[aria-label="Não lida"]')).not.toBeNull();
      expect(dialog()!.querySelector('.notification-detail__message')!.textContent).toBe('Linha 1\nLinha 2');
      expect(loading.pendingCount()).toBe(0);
      await settleRead();
      expect(dialog()!.querySelector('[aria-label="Não lida"]')).toBeNull();
      expect(dialogButton('Marcar como lida')).toBeUndefined();
      expect(navigate).not.toHaveBeenCalled();
    });

    it('retries a failed automatic read inside the dialog', async () => {
      await openDetail();
      http.expectOne({ method: 'POST', url: '/api/notifications/5/read' })
        .flush({ message: 'Falha na leitura.' }, { status: 500, statusText: 'Server Error' });
      await render();
      expect(dialogText()).toContain('Falha na leitura.');
      expect(dialogButton('Marcar como lida')).toBeUndefined();
      dialogButton('Tentar novamente')!.click();
      await settleRead();
      expect(dialogButton('Tentar novamente')).toBeUndefined();
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
      dialog()!.querySelector<HTMLButtonElement>('button[aria-label="Fechar"]')!.click();
      await render();
      expect(dialog()).toBeNull();
      expect(document.activeElement).toBe(bell());
      bell().click();
      await render();
      listRequest().flush([{ ...NOTIFICATION, read: true }]);
      flushSummary(0);
      await render();
      expect(host().querySelectorAll('.bell-item.is-unread').length).toBe(0);
    });

    it('snoozes silently from the dialog and closes it', async () => {
      const blocked: NotificationResponse = { ...NOTIFICATION, eventType: 'RMA_BLOCKED', severity: 'WARNING' };
      await openDetail([blocked]);
      await settleRead(blocked);
      expect(dialog()!.querySelector('app-custom-select')).not.toBeNull();
      dialog()!.querySelector<HTMLButtonElement>('button[aria-haspopup="listbox"]')!.click();
      await render();
      const option = Array.from(host().querySelectorAll<HTMLButtonElement>('[role="option"]'))
        .find((item) => item.textContent?.includes('1 hora'))!;
      option.click();
      const snooze = http.expectOne({ method: 'POST', url: '/api/notifications/5/snooze' });
      expect(snooze.request.body).toEqual({ minutes: 60 });
      expect(snooze.request.context.get(SKIP_GLOBAL_LOADING)).toBe(true);
      snooze.flush({ ...blocked, read: true, snoozedUntil: at(24, 16) });
      flushSummary(0);
      await render();
      expect(dialog()).toBeNull();
    });

    it('offers no Adiar for an informative notification', async () => {
      await openDetail();
      await settleRead();
      expect(dialog()!.querySelector('app-custom-select')).toBeNull();
      expect(dialogText()).not.toContain('Adiar');
    });

    it('walks through the listed notifications with Anterior and Próxima', async () => {
      await openDetail([NOTIFICATION, READ]);
      await settleRead();
      const next = dialog()!.querySelector<HTMLButtonElement>('button[aria-label="Próxima notificação"]')!;
      expect(dialog()!.querySelector<HTMLButtonElement>('button[aria-label="Notificação anterior"]')!.disabled).toBe(true);
      expect(dialog()!.querySelectorAll('button[aria-label="Fechar"]')).toHaveLength(1);
      expect(dialogButton('Fechar')).toBeUndefined();
      next.click();
      await render();
      expect(dialog()!.querySelector('time')!.getAttribute('datetime')).toBe(READ.createdAt);
      expect(next.disabled).toBe(true);
      dialog()!.querySelector<HTMLButtonElement>('button[aria-label="Notificação anterior"]')!.click();
      await render();
      expect(dialog()!.querySelector('time')!.getAttribute('datetime')).toBe(NOTIFICATION.createdAt);
      expect(next.disabled).toBe(false);
      http.expectNone((request) => request.url.endsWith('/read'));
    });

    it('uses left and right arrows to change detail without navigating or reading an already read item again', async () => {
      const navigate = vi.spyOn(router, 'navigate');
      await openDetail([NOTIFICATION, READ]);
      await settleRead();
      dialog()!.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
      await render();
      expect(dialog()!.querySelector('time')!.getAttribute('datetime')).toBe(READ.createdAt);
      dialog()!.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }));
      await render();
      expect(dialog()!.querySelector('time')!.getAttribute('datetime')).toBe(NOTIFICATION.createdAt);
      http.expectNone((request) => request.url.endsWith('/read'));
      expect(navigate).not.toHaveBeenCalled();
    });

    it('closes on the overlay, keeps clicks inside open and returns focus to the bell', async () => {
      await openDetail([READ]);
      dialog()!.click();
      await render();
      expect(dialog()).not.toBeNull();
      host().querySelector<HTMLElement>('.modal-overlay')!.click();
      await render();
      expect(dialog()).toBeNull();
      expect(document.activeElement).toBe(bell());
    });

    it('closes when the route changes', async () => {
      await openDetail([READ]);
      await router.navigateByUrl('/notificacoes');
      await render();
      expect(dialog()).toBeNull();
    });
  });

  it('marks all as read, reloads the list and is disabled when nothing is unread', async () => {
    await openWith([NOTIFICATION]);
    buttonByText('Marcar todas como lidas').click();
    const readAll = http.expectOne({ method: 'POST', url: '/api/notifications/read-all' });
    expect(readAll.request.context.get(SKIP_GLOBAL_LOADING)).toBe(true);
    readAll.flush(null);
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
    await openWith([NOTIFICATION, READ, { ...OLD, read: false }]);
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
