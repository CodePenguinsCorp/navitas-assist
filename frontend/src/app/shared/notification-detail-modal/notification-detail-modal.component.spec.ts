import { ComponentFixture, TestBed } from '@angular/core/testing';
import { NotificationResponse } from '../../core/models';
import { ClockService } from '../../core/services/clock.service';
import { NotificationDetailModalComponent } from './notification-detail-modal.component';

const NOW = Date.parse('2026-10-24T15:00:00Z');
const NOTIFICATION: NotificationResponse = {
  id: 5, eventType: 'RMA_BLOCKED', severity: 'WARNING', title: 'Bloqueio na OS-2026-000007', message: 'Cliente · Produto',
  rmaId: 7, rmaCode: 'OS-2026-000007', actionPath: '/rmas?rma=7', createdAt: '2026-10-24T14:30:00Z', readAt: null, snoozedUntil: null, read: false
};

describe('NotificationDetailModalComponent', () => {
  let fixture: ComponentFixture<NotificationDetailModalComponent>;
  const root = () => fixture.nativeElement as HTMLElement;
  const text = () => root().textContent!.replace(/[\s ]+/g, ' ').trim();
  const button = (label: string) => Array.from(root().querySelectorAll('button')).find((item) => item.textContent?.trim() === label);

  async function setup(notification: NotificationResponse) {
    await TestBed.configureTestingModule({
      imports: [NotificationDetailModalComponent],
      providers: [{ provide: ClockService, useValue: { now: () => NOW } }]
    }).compileComponents();
    fixture = TestBed.createComponent(NotificationDetailModalComponent);
    fixture.componentRef.setInput('notification', notification);
    fixture.detectChanges();
  }

  afterEach(() => { document.body.style.overflow = ''; });

  it('shows a human title, a separate OS code, structured fields and a single close control', async () => {
    await setup({ ...NOTIFICATION, eventType: 'RMA_CREATED', severity: 'INFO', message: '[DEMO] Vale Verde · [DEMO] Switch · prioridade alta. Aberta por admin.' });
    expect(root().querySelector('dl[aria-label="Detalhes da notificação"]')).not.toBeNull();
    expect(root().querySelector('.notification-detail__summary')).toBeNull();
    expect(root().querySelector('.notification-detail__message')!.textContent).toBe('Ordem de serviço aberta por admin.');
    expect(root().querySelector('header .notification-detail__meta')).not.toBeNull();
    expect(root().querySelectorAll('footer .button-primary')).toHaveLength(1);
    const dialog = root().querySelector('[role="dialog"]')!;
    const title = root().querySelector('h3')!;
    expect(dialog.getAttribute('aria-labelledby')).toBe(title.id);
    expect(title.textContent!.trim()).toBe('Nova OS');
    expect(root().querySelectorAll('button[aria-label="Fechar"]').length).toBe(1);
    expect(button('Fechar')).toBeUndefined();
    expect(Array.from(root().querySelectorAll('dt')).map(el => el.textContent!.trim())).toEqual(['Cliente', 'Equipamento', 'Prioridade', 'Aberta por']);
    expect(Array.from(root().querySelectorAll('dd')).map(el => el.textContent!.trim())).toEqual(['[DEMO] Vale Verde', '[DEMO] Switch', 'alta', 'admin']);
    expect(text().split('OS-2026-000007').length - 1).toBe(1);
    expect(root().querySelector('.notification-detail__meta time')!.textContent).toBe('24/10/2026, 11:30');
    expect(root().querySelector('.notification-detail__read')!.textContent!.trim()).toBe('Não lida');
  });

  it('keeps an impediment reason intact without extra headings', async () => {
    await setup({ ...NOTIFICATION, message: 'Aguardando peça · detalhe <b>literal</b>\nOutra linha' });
    expect(root().querySelector('h3')!.textContent!.trim()).toBe('Impedimento');
    expect(root().querySelector('.notification-detail__summary')).toBeNull();
    expect(root().querySelector('.notification-detail__message')!.textContent).toBe('Aguardando peça · detalhe <b>literal</b>\nOutra linha');
    expect(root().querySelector('b')).toBeNull();
  });

  it('shows the read state and an active snooze, but not an expired one', async () => {
    await setup({ ...NOTIFICATION, read: true, readAt: '2026-10-24T14:40:00Z', snoozedUntil: '2026-10-24T18:00:00Z' });
    const meta = () => root().querySelector('.notification-detail__meta')!.textContent!.replace(/[\s ]+/g, ' ').trim();
    expect(root().querySelector('.notification-detail__meta time')!.textContent).toBe('24/10/2026, 11:30');
    expect(root().querySelector('.notification-detail__read')!.textContent!.trim()).toBe('Lida');
    expect(meta()).toContain('há 30 min');
    expect(meta()).toContain('Adiada até 24/10/2026, 15:00');

    fixture.componentRef.setInput('notification', { ...NOTIFICATION, read: true, snoozedUntil: '2026-10-24T14:00:00Z' });
    fixture.detectChanges();
    expect(meta()).not.toContain('Adiada até');
  });

  it('preserva valores longos e mantém as ações no rodapé', async () => {
    const client = 'Cliente com nome extenso '.repeat(12);
    await setup({ ...NOTIFICATION, eventType: 'RMA_CREATED', message: `${client} · Equipamento · prioridade alta. Aberta por Maria.` });
    expect(root().querySelector('dd')!.textContent).toBe(client);
    expect(root().querySelectorAll('dl > div')).toHaveLength(4);
    expect(root().querySelectorAll('h4')).toHaveLength(0);
    expect(root().querySelector('header .mini-chip')!.textContent).toBe(NOTIFICATION.rmaCode);
    expect(root().querySelector('footer nav')).not.toBeNull();
    expect(root().querySelector('footer .button-primary')!.textContent).toContain('Abrir OS');
    expect(root().querySelector('footer app-custom-select')).toBeNull();
  });

  it('offers Adiar only for a notification that asks for action', async () => {
    const snoozeMenu = () => root().querySelector('app-custom-select');
    await setup(NOTIFICATION);
    expect(snoozeMenu()).not.toBeNull();

    for (const eventType of ['RMA_CREATED', 'RMA_ASSIGNED'] as const) {
      fixture.componentRef.setInput('notification', { ...NOTIFICATION, eventType, severity: 'INFO', snoozedUntil: '2026-10-24T18:00:00Z' });
      fixture.detectChanges();
      expect(snoozeMenu()).toBeNull();
      expect(text()).not.toContain('Adiar');
      expect(text()).not.toContain('Adiada até');
    }
  });

  it('emits the requested actions', async () => {
    await setup(NOTIFICATION);
    const events: string[] = [];
    fixture.componentInstance.openAction.subscribe(() => events.push('open'));
    fixture.componentInstance.markRead.subscribe(() => events.push('read'));
    fixture.componentInstance.closed.subscribe(() => events.push('close'));
    button('Abrir OS')!.click();
    expect(button('Marcar como lida')).toBeUndefined();
    expect(button('Tentar novamente')).toBeUndefined();
    fixture.componentRef.setInput('error', 'Falha na leitura.');
    fixture.detectChanges();
    button('Tentar novamente')!.click();
    root().querySelector<HTMLButtonElement>('button[aria-label="Fechar"]')!.click();
    expect(events).toEqual(['open', 'read', 'close']);
  });

  it('keeps the snooze options and emits the chosen delay', async () => {
    await setup(NOTIFICATION);
    const snoozed = vi.fn();
    fixture.componentInstance.snoozed.subscribe(snoozed);
    root().querySelector<HTMLButtonElement>('app-custom-select button')!.click();
    fixture.detectChanges();
    const options = Array.from(root().querySelectorAll<HTMLButtonElement>('[role="option"]'));
    expect(options.map(option => option.textContent!.trim())).toEqual(['1 hora', '4 horas', '1 dia']);
    options[1].click();
    expect(snoozed).toHaveBeenCalledExactlyOnceWith(240);
  });

  it('keeps the code in the headline and offers no Abrir OS when the path is not internal', async () => {
    await setup({ ...NOTIFICATION, actionPath: '//externo' });
    expect(text()).toContain('OS-2026-000007');
    expect(button('Abrir OS')).toBeUndefined();
  });

  it('asks for the previous and next notification and disables them at the ends', async () => {
    await setup(NOTIFICATION);
    fixture.componentRef.setInput('hasNext', true);
    fixture.componentRef.setInput('position', 1);
    fixture.componentRef.setInput('total', 12);
    fixture.detectChanges();
    expect(text()).toContain('1 de 12');
    const events: string[] = [];
    fixture.componentInstance.previous.subscribe(() => events.push('previous'));
    fixture.componentInstance.next.subscribe(() => events.push('next'));
    const previous = root().querySelector<HTMLButtonElement>('button[aria-label="Notificação anterior"]')!;
    const next = root().querySelector<HTMLButtonElement>('button[aria-label="Próxima notificação"]')!;
    expect(previous.disabled).toBe(true);
    next.click();
    expect(events).toEqual(['next']);
    fixture.componentRef.setInput('position', 12);
    fixture.componentRef.setInput('hasNext', false);
    fixture.componentRef.setInput('hasPrevious', true);
    fixture.detectChanges();
    expect(text()).toContain('12 de 12');
    expect(next.disabled).toBe(true);
    expect(previous.disabled).toBe(false);
    previous.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }));
    expect(events).toEqual(['next', 'previous']);
  });
});

describe('notification detail keyboard and pending state', () => {
  it('navigates with arrows, ignores menu keys, and shows inline pending/error feedback', async () => {
    await TestBed.configureTestingModule({ imports: [NotificationDetailModalComponent] }).compileComponents();
    const fixture = TestBed.createComponent(NotificationDetailModalComponent);
    fixture.componentRef.setInput('notification', NOTIFICATION);
    fixture.componentRef.setInput('hasNext', true);
    fixture.detectChanges();
    const root: HTMLElement = fixture.nativeElement;
    const dialog = root.querySelector<HTMLElement>('[role="dialog"]')!;
    const next = vi.fn();
    fixture.componentInstance.next.subscribe(next);
    dialog.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    expect(next).toHaveBeenCalledTimes(1);
    root.querySelector('app-custom-select button')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    expect(next).toHaveBeenCalledTimes(1);
    fixture.componentRef.setInput('busy', true);
    fixture.componentRef.setInput('error', 'Não foi possível adiar.');
    fixture.detectChanges();
    expect(root.querySelector('[role="status"]')!.textContent).toContain('Salvando');
    expect(root.querySelector('[role="alert"]')!.textContent).toBe('Não foi possível adiar.');
    expect(root.querySelector<HTMLButtonElement>('button[aria-label="Próxima notificação"]')!.disabled).toBe(true);
  });
});
