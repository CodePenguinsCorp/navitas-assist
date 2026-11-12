import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectorRef, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { Observable, Subject, of, throwError } from 'rxjs';
import { NotificationResponse, UserRole } from '../../core/models';
import { profilePermissions, providePermissions } from '../../testing/permission-fixtures';
import { NotificationService } from '../../core/services/notification.service';
import { SlaClockService } from '../../core/services/sla-clock.service';
import { NotificationsComponent } from './notifications.component';

const NOTIFICATION: NotificationResponse = {
  id: 5, eventType: 'RMA_ASSIGNED', severity: 'INFO', title: 'RMA RMA-2026-000007 atribuído a Técnico', message: 'Cliente · Produto',
  rmaId: 7, rmaCode: 'RMA-2026-000007', actionPath: '/rmas?rma=7', createdAt: '2026-10-24T12:00:00Z', readAt: null, snoozedUntil: null, read: false
};
const OLD: NotificationResponse = { ...NOTIFICATION, id: 8, title: 'Notificação antiga' };
const NEW: NotificationResponse = { ...NOTIFICATION, id: 9, title: 'Notificação nova' };

const failure = () => throwError(() => new HttpErrorResponse({ status: 500 }));

interface Harness {
  markAllRead(): void;
  markRead(notification: NotificationResponse): void;
  snooze(notification: NotificationResponse, minutes: string): void;
  selectTab(tab: 'inbox' | 'preferences' | 'rules'): void;
}

type Source<T> = Observable<T> | (() => Observable<T>);

describe('NotificationsComponent inbox loading', () => {
  let fixture: ComponentFixture<NotificationsComponent>;
  let component: Harness;
  let service: Record<string, ReturnType<typeof vi.fn>> & { unreadCount: ReturnType<typeof signal<number>>; summaryLoaded: ReturnType<typeof signal<boolean>>; summaryLoadFailed: ReturnType<typeof signal<boolean>> };
  let clock: ReturnType<typeof signal<number>>;

  const root = (): HTMLElement => fixture.nativeElement.querySelector('.page-surface');
  const text = () => root().textContent!.replace(/[\s ]+/g, ' ').trim();
  const render = () => { fixture.componentRef.injector.get(ChangeDetectorRef).markForCheck(); fixture.detectChanges(); };
  const button = (label: string) => Array.from(root().querySelectorAll('button')).find((item) => item.textContent?.trim() === label);
  const checkbox = (label: string) => Array.from(root().querySelectorAll('label')).find((item) => item.textContent?.trim() === label)!.querySelector('input')!;
  const toggle = (label: string) => { checkbox(label).dispatchEvent(new Event('change')); render(); };

  async function setup(sources: { role?: UserRole; unread?: number; list?: Source<NotificationResponse[]>[]; markAllRead?: Observable<void>; snooze?: Observable<NotificationResponse>; markRead?: Observable<NotificationResponse> } = {}) {
    clock = signal(Date.parse('2026-10-24T13:00:00Z'));
    const list = vi.fn(() => of([NOTIFICATION]));
    for (const source of sources.list ?? []) {
      list.mockImplementationOnce(typeof source === 'function' ? source : () => source);
    }
    service = {
      unreadCount: signal(sources.unread ?? 1),
      summaryLoaded: signal(true),
      summaryLoadFailed: signal(false),
      list,
      refreshSummary: vi.fn(() => of(1)),
      markRead: vi.fn(() => sources.markRead ?? of({ ...NOTIFICATION, read: true })),
      markAllRead: vi.fn(() => sources.markAllRead ?? of(undefined)),
      snooze: vi.fn(() => sources.snooze ?? of(NOTIFICATION)),
      listPreferences: vi.fn(() => of([])),
      updatePreference: vi.fn(),
      listRules: vi.fn(() => of([])),
      updateRule: vi.fn(),
      listFailures: vi.fn(() => of([]))
    } as never;
    await TestBed.configureTestingModule({
      imports: [NotificationsComponent],
      providers: [
        provideRouter([]),
        { provide: NotificationService, useValue: service },
        providePermissions(profilePermissions(sources.role ?? 'TECHNICIAN')),
        { provide: SlaClockService, useValue: { now: clock.asReadonly() } }
      ]
    }).compileComponents();
    fixture = TestBed.createComponent(NotificationsComponent);
    component = fixture.componentInstance as unknown as Harness;
    render();
  }

  it('shows an empty inbox only after the initial response', async () => {
    const pending = new Subject<NotificationResponse[]>();
    await setup({ list: [pending] });
    expectPending(root());
    expect(root().querySelector('.empty-state, .notification-list, [role="status"]')).toBeNull();
    pending.next([]); pending.complete(); render();
    expect(text()).toContain('Nenhuma notificação.');
  });

  // Vermelho: o estado vazio "Nenhuma notificação." aparece junto do banner de falha e não há "Tentar novamente".
  it('replaces the inbox with a retryable failure instead of an empty state', async () => {
    await setup({ list: [failure()] });
    expect(text()).toContain('Não foi possível carregar as notificações.');
    expect(button('Tentar novamente')).toBeDefined();
    expect(text()).not.toContain('Nenhuma notificação.');
  });

  // Vermelho: a lista antiga continua visível depois que a recarga do filtro falha.
  it('hides the previous list when a filter reload fails', async () => {
    await setup({ list: [of([NOTIFICATION]), failure()] });
    expect(text()).toContain('RMA RMA-2026-000007 atribuído a Técnico');
    toggle('Somente não lidas');
    expect(text()).not.toContain('RMA RMA-2026-000007 atribuído a Técnico');
    expect(text()).toContain('Não foi possível carregar as notificações.');
    button('Tentar novamente')!.click();
    render();
    expect(service['list']).toHaveBeenLastCalledWith({ unreadOnly: true, includeSnoozed: false });
  });

  // Vermelho: depois da troca de filtro o banner de erro anterior (ou a lista antiga) continua em vez de "Carregando notificações...".
  it('starts a first load after a filter change, even after a failure', async () => {
    await setup({ list: [failure(), new Subject<NotificationResponse[]>()] });
    toggle('Mostrar adiadas');
    expectPending(root());
    expect(text()).not.toContain('Não foi possível carregar as notificações.');

    TestBed.resetTestingModule();
    await setup({ list: [of([NOTIFICATION]), new Subject<NotificationResponse[]>()] });
    toggle('Mostrar adiadas');
    expectPending(root());
    expect(text()).not.toContain('RMA RMA-2026-000007 atribuído a Técnico');
  });

  // Vermelho: não existe "Tentar novamente" nem estado "Carregando..." na nova tentativa.
  it('keeps the failure while retrying the same filters', async () => {
    await setup({ list: [failure(), new Subject<NotificationResponse[]>()] });
    button('Tentar novamente')!.click();
    render();
    const retry = button('Tentar novamente');
    expect(retry).toBeDefined();
    expect(retry!.disabled).toBe(true);
    expect(text()).toContain('Não foi possível carregar as notificações.');
  });

  // Vermelho: a assinatura da leitura anterior não é cancelada (first.observed continua true).
  it('keeps only the latest inbox response', async () => {
    const first = new Subject<NotificationResponse[]>();
    const second = new Subject<NotificationResponse[]>();
    await setup({ list: [first, second] });
    toggle('Somente não lidas');
    expect(first.observed).toBe(false);
    second.next([NEW]);
    second.complete();
    first.next([OLD]);
    render();
    expect(text()).toContain('Notificação nova');
    expect(text()).not.toContain('Notificação antiga');
  });

  // Vermelho: o vazio com filtro usa o mesmo texto do vazio real e não oferece "Mostrar todas".
  it('distinguishes an empty filtered inbox', async () => {
    await setup({ list: [of([NOTIFICATION]), of([]), of([])] });
    toggle('Somente não lidas');
    expect(text()).toContain('Nenhuma notificação não lida.');
    button('Mostrar todas')!.click();
    render();
    expect(service['list']).toHaveBeenLastCalledWith({ unreadOnly: false, includeSnoozed: false });
    expect(checkbox('Somente não lidas').checked).toBe(false);
    expect(text()).toContain('Nenhuma notificação.');
    expect(text()).not.toContain('Nenhuma notificação não lida.');
  });

  // Vermelho: a lista não informa o limite de 100 notificações.
  it('states the inbox limit', async () => {
    await setup();
    expect(text()).toContain('Mostra até 100 notificações, das mais recentes, nos filtros selecionados.');
  });

  // Vermelho: o erro da ação substitui a única mensagem e a troca de aba apaga a falha de carga.
  it('keeps a load failure after an action error', async () => {
    await setup({ list: [failure(), failure(), failure()], markAllRead: failure() as never });
    component.markAllRead();
    render();
    expect(text()).toContain('Não foi possível carregar as notificações.');
    component.selectTab('preferences');
    render();
    component.selectTab('inbox');
    render();
    expect(text()).toContain('Não foi possível carregar as notificações.');
    expect(button('Tentar novamente')).toBeDefined();
  });

  // Vermelho: a recarga com os mesmos filtros não anuncia "Atualizando notificações...".
  it('renders an empty busy inbox during a same-filter reload', async () => {
    await setup({ list: [of([NOTIFICATION]), new Subject<NotificationResponse[]>()] });
    component.snooze(NOTIFICATION, '60');
    render();
    expectPending(root());
  });

  describe('preservation', () => {
    it('hides stale rows while reloading the same filters after snoozing', async () => {
      await setup({ list: [of([NOTIFICATION]), new Subject<NotificationResponse[]>()] });
      component.snooze(NOTIFICATION, '60');
      render();
      expect(text()).not.toContain('RMA RMA-2026-000007 atribuído a Técnico');
      expectPending(root());
      expect(root().querySelector('.notification-list')).toBeNull();
      expect(service['list']).toHaveBeenCalledTimes(2);
    });

    it('replaces a read item locally and refreshes the summary', async () => {
      await setup();
      const summaryCalls = service['refreshSummary'].mock.calls.length;
      component.markRead(NOTIFICATION);
      render();
      expect(service['list']).toHaveBeenCalledTimes(1);
      expect(service['refreshSummary'].mock.calls.length).toBe(summaryCalls + 1);
      expect(button('Marcar como lida')).toBeUndefined();
    });

    it('keeps the list when an action fails', async () => {
      await setup({ markRead: failure() as never });
      component.markRead(NOTIFICATION);
      render();
      expect(text()).toContain('RMA RMA-2026-000007 atribuído a Técnico');
      expect(text()).toContain('Não foi possível concluir a ação agora.');
    });
  });

  describe('presentation', () => {
    const item = () => root().querySelector<HTMLElement>('.notification-item')!;
    const tabs = () => Array.from(root().querySelectorAll<HTMLButtonElement>('[role="tab"]'));
    const tabLabelled = (label: string) => tabs().find((tab) => tab.textContent!.trim().startsWith(label))!;
    const key = (target: HTMLElement, value: string) => { target.dispatchEvent(new KeyboardEvent('keydown', { key: value, bubbles: true })); render(); };

    // Vermelho: cada item tem "Abrir RMA" em .button-primary, inclusive para URL externa.
    it('opens the RMA from the notification title', async () => {
      await setup();
      const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
      const title = item().querySelector<HTMLButtonElement>('button.link-button')!;
      expect(title.textContent!.trim()).toBe('RMA RMA-2026-000007 atribuído a Técnico');
      expect(item().querySelector('.button-primary')).toBeNull();
      title.click();
      expect(service['markRead']).toHaveBeenCalledWith(5);
      expect(navigate).toHaveBeenCalledWith(['/rmas'], { queryParams: { rma: '7' } });

      TestBed.resetTestingModule();
      await setup({ list: [of([{ ...NOTIFICATION, actionPath: 'https://externo' }])] });
      expect(item().querySelector('button.link-button')).toBeNull();
      expect(Array.from(item().querySelectorAll('button')).some((entry) => /abrir/i.test(entry.textContent!))).toBe(false);
      expect(item().textContent).toContain('RMA RMA-2026-000007 atribuído a Técnico');
    });

    // Vermelho: "adiada até" aparece também depois do vencimento do adiamento.
    it('marks only active snoozes', async () => {
      await setup({ list: [of([{ ...NOTIFICATION, snoozedUntil: '2026-10-24T16:00:00Z' }])] });
      expect(text()).toContain('Adiada até 24/10/2026, 13:00');
      clock.set(Date.parse('2026-10-24T16:00:00Z'));
      render();
      expect(text()).not.toMatch(/adiada até/i);

      TestBed.resetTestingModule();
      await setup({ list: [of([{ ...NOTIFICATION, snoozedUntil: '2026-10-24T12:30:00Z' }])] });
      expect(text()).not.toMatch(/adiada até/i);
    });

    // Vermelho: a mensagem é só "Notificação adiada.".
    it('confirms when the snooze ends', async () => {
      await setup({ snooze: of({ ...NOTIFICATION, snoozedUntil: '2026-10-24T16:00:00Z' }) });
      component.snooze(NOTIFICATION, '240');
      render();
      expect(root().querySelector('[role="status"].alert-banner')!.textContent!.replace(/[\s ]+/g, ' ').trim()).toBe('Notificação adiada até 24/10/2026, 13:00.');
      expect(service['list']).toHaveBeenCalledTimes(2);
    });

    // Vermelho: a mensagem não diz que as adiadas também foram marcadas.
    it('states that marking all includes snoozed', async () => {
      await setup();
      component.markAllRead();
      render();
      expect(text()).toContain('Todas as notificações, inclusive as adiadas, foram marcadas como lidas.');
    });

    // Vermelho: o rótulo é "(2)" e não há tabpanel ligado à aba.
    it('names the unread count and links tabs to their panel', async () => {
      await setup({ unread: 2 });
      expect(tabs()[0].textContent!.trim()).toBe('Caixa de entrada (2 não lidas)');
      service.unreadCount.set(1);
      render();
      expect(tabs()[0].textContent!.trim()).toBe('Caixa de entrada (1 não lida)');
      service.unreadCount.set(0);
      render();
      expect(tabs()[0].textContent!.trim()).toBe('Caixa de entrada');
      const panel = document.getElementById(tabs()[0].getAttribute('aria-controls')!)!;
      expect(panel.getAttribute('role')).toBe('tabpanel');
      expect(panel.getAttribute('aria-labelledby')).toBe(tabs()[0].id);
    });

    // Vermelho: antes do resumo a aba usa o zero inicial; na falha mostra o número antigo sem avisar.
    it('shows no count before the summary loads and hides a stale count on failure', async () => {
      await setup({ unread: 0 });
      service.summaryLoaded.set(false);
      render();
      expect(tabs()[0].textContent!.trim()).toBe('Caixa de entrada');
      expect(text()).not.toContain('Contagem de não lidas indisponível');

      service.unreadCount.set(4);
      service.summaryLoadFailed.set(true);
      render();
      expect(tabs()[0].textContent!.trim()).toBe('Caixa de entrada');
      expect(text()).toContain('Contagem de não lidas indisponível');

      service.summaryLoaded.set(true);
      render();
      expect(tabs()[0].textContent!.trim()).toBe('Caixa de entrada');
      expect(text()).toContain('Contagem de não lidas indisponível');

      service.summaryLoadFailed.set(false);
      render();
      expect(tabs()[0].textContent!.trim()).toBe('Caixa de entrada (4 não lidas)');
      expect(text()).not.toContain('Contagem de não lidas indisponível');
    });

    it.each(['ADMIN', 'TECHNICIAN'] as const)('keeps stable panels for every notification tab for %s', async (role) => {
      await setup({ role });
      const allTabs = tabs();
      const panels = allTabs.map((tab) => document.getElementById(tab.getAttribute('aria-controls')!)!);
      expect(panels.every(Boolean)).toBe(true);
      for (const activeTab of allTabs) {
        activeTab.click();
        render();
        for (const [index, tab] of allTabs.entries()) {
          const panel = document.getElementById(tab.getAttribute('aria-controls')!)!;
          expect(panel).toBe(panels[index]);
          expect(panel.getAttribute('role')).toBe('tabpanel');
          expect(panel.getAttribute('aria-labelledby')).toBe(tab.id);
          expect(panel.hidden).toBe(tab !== activeTab);
          expect(panel.childElementCount > 0).toBe(tab === activeTab);
        }
      }
    });

    it.each(['Preferências', 'Regras'])('places the static %s panel after its active tab in the focus order', async (label) => {
      await setup({ role: 'ADMIN' });
      const activeTab = tabLabelled(label);
      activeTab.click();
      render();
      const panel = document.getElementById(activeTab.getAttribute('aria-controls')!)!;
      expect(panel.tabIndex).toBe(0);
      const focusStops = Array.from(root().querySelectorAll<HTMLElement>('button, input, select, textarea, a[href], [tabindex]'))
        .filter((element) => element.tabIndex >= 0 && !element.closest('[hidden]') && !element.hasAttribute('disabled'));
      expect(focusStops[focusStops.indexOf(activeTab) + 1]).toBe(panel);
      panel.focus();
      expect(document.activeElement).toBe(panel);
    });

    // Vermelho: as abas não reagem ao teclado e não têm tabindex.
    it('moves between tabs with the keyboard', async () => {
      await setup({ role: 'ADMIN' });
      key(tabLabelled('Caixa de entrada'), 'ArrowRight');
      expect(document.activeElement).toBe(tabLabelled('Preferências'));
      expect(tabLabelled('Preferências').getAttribute('aria-selected')).toBe('true');
      expect(service['listPreferences']).toHaveBeenCalledTimes(1);
      expect(tabs().map((tab) => tab.getAttribute('tabindex'))).toEqual(['-1', '0', '-1']);
      key(tabLabelled('Preferências'), 'End');
      expect(document.activeElement).toBe(tabLabelled('Regras'));
      key(tabLabelled('Regras'), 'Home');
      expect(document.activeElement).toBe(tabLabelled('Caixa de entrada'));
      key(tabLabelled('Caixa de entrada'), 'ArrowLeft');
      expect(document.activeElement).toBe(tabLabelled('Regras'));
      expect(tabs().map((tab) => tab.getAttribute('tabindex'))).toEqual(['-1', '-1', '0']);

      TestBed.resetTestingModule();
      await setup({ role: 'TECHNICIAN' });
      key(tabLabelled('Caixa de entrada'), 'End');
      expect(document.activeElement).toBe(tabLabelled('Preferências'));
    });

    describe('preservation', () => {
      it('keeps mark as read and snooze as secondary actions', async () => {
        await setup();
        expect(button('Marcar como lida')!.classList).toContain('button-secondary');
        expect(item().querySelector('app-custom-select')).not.toBeNull();
        component.snooze(NOTIFICATION, '1440');
        expect(service['snooze']).toHaveBeenCalledWith(5, 1440);
      });

      it('disables actions while busy and mark all without unread', async () => {
        await setup({ markRead: new Subject<NotificationResponse>() });
        component.markRead(NOTIFICATION);
        render();
        expect(button('Marcar como lida')!.disabled).toBe(true);
        TestBed.resetTestingModule();
        await setup({ list: [of([{ ...NOTIFICATION, read: true }])] });
        expect(button('Marcar todas como lidas')!.disabled).toBe(true);
      });

      it('hides the rules tab from technicians', async () => {
        await setup({ role: 'TECHNICIAN' });
        expect(tabs().map((tab) => tab.textContent!.trim())).not.toContain('Regras');
      });
    });
  });
});

function expectPending(root: HTMLElement): void {
  const busy = root.querySelector('[aria-busy="true"]');
  expect(busy?.textContent?.trim()).toBe('');
  expect(busy?.children.length).toBe(0);
  expect(busy?.hasAttribute('role')).toBe(false);
  expect(root.textContent).not.toMatch(/Carregando(?! opções)|Atualizando (estoque|notificações|preferências|regras|falhas)/);
}
