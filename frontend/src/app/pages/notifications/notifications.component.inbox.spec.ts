import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectorRef, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { Observable, Subject, of, throwError } from 'rxjs';
import { NotificationResponse, UserRole } from '../../core/models';
import { AuthService } from '../../core/services/auth.service';
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
  let service: Record<string, ReturnType<typeof vi.fn>> & { unreadCount: ReturnType<typeof signal<number>> };

  const root = (): HTMLElement => fixture.nativeElement.querySelector('.page-surface');
  const text = () => root().textContent!.replace(/[\s ]+/g, ' ').trim();
  const render = () => { fixture.componentRef.injector.get(ChangeDetectorRef).markForCheck(); fixture.detectChanges(); };
  const button = (label: string) => Array.from(root().querySelectorAll('button')).find((item) => item.textContent?.trim() === label);
  const checkbox = (label: string) => Array.from(root().querySelectorAll('label')).find((item) => item.textContent?.trim() === label)!.querySelector('input')!;
  const toggle = (label: string) => { checkbox(label).dispatchEvent(new Event('change')); render(); };

  async function setup(sources: { role?: UserRole; list?: Source<NotificationResponse[]>[]; markAllRead?: Observable<void>; snooze?: Observable<NotificationResponse>; markRead?: Observable<NotificationResponse> } = {}) {
    const list = vi.fn(() => of([NOTIFICATION]));
    for (const source of sources.list ?? []) {
      list.mockImplementationOnce(typeof source === 'function' ? source : () => source);
    }
    service = {
      unreadCount: signal(1),
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
        { provide: AuthService, useValue: { hasAnyRole: (roles: UserRole[]) => roles.includes(sources.role ?? 'TECHNICIAN') } },
        { provide: SlaClockService, useValue: { now: signal(Date.parse('2026-10-24T13:00:00Z')).asReadonly() } }
      ]
    }).compileComponents();
    fixture = TestBed.createComponent(NotificationsComponent);
    component = fixture.componentInstance as unknown as Harness;
    render();
  }

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
    expect(text()).toContain('Carregando notificações...');
    expect(text()).not.toContain('Não foi possível carregar as notificações.');

    TestBed.resetTestingModule();
    await setup({ list: [of([NOTIFICATION]), new Subject<NotificationResponse[]>()] });
    toggle('Mostrar adiadas');
    expect(text()).toContain('Carregando notificações...');
    expect(text()).not.toContain('RMA RMA-2026-000007 atribuído a Técnico');
  });

  // Vermelho: não existe "Tentar novamente" nem estado "Carregando..." na nova tentativa.
  it('keeps the failure while retrying the same filters', async () => {
    await setup({ list: [failure(), new Subject<NotificationResponse[]>()] });
    button('Tentar novamente')!.click();
    render();
    const retry = button('Carregando...');
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
  it('announces a same-filter reload while keeping the list', async () => {
    await setup({ list: [of([NOTIFICATION]), new Subject<NotificationResponse[]>()] });
    component.snooze(NOTIFICATION, '60');
    render();
    expect(root().querySelector('[role="status"]:not(.alert-banner)')?.textContent?.trim()).toBe('Atualizando notificações...');
  });

  describe('preservation', () => {
    it('keeps the list visible while reloading the same filters after snoozing', async () => {
      await setup({ list: [of([NOTIFICATION]), new Subject<NotificationResponse[]>()] });
      component.snooze(NOTIFICATION, '60');
      render();
      expect(text()).toContain('RMA RMA-2026-000007 atribuído a Técnico');
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
});
