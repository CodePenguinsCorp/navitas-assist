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

  it('colors only new OS priority, prefers its snapshot and preserves HTML as plain text', async () => {
    const message = '<b>Cliente</b> · prioridade baixa. Aberta por Admin.';
    await setup({ ...NOTIFICATION, eventType: 'RMA_CREATED', rmaPriority: 'HIGH', message });
    expect(root().querySelector('.notification-priority')?.getAttribute('data-priority')).toBe('HIGH');
    expect(text()).toContain('<b>Cliente</b> · Prioridade Alta. Aberta por Admin.');
    expect(root().querySelector('b')).toBeNull();
    fixture.componentRef.setInput('notification', { ...NOTIFICATION, eventType: 'RMA_CREATED', message });
    fixture.detectChanges();
    expect(root().querySelector('.notification-priority')?.getAttribute('data-priority')).toBe('LOW');
    fixture.componentRef.setInput('notification', { ...NOTIFICATION, rmaPriority: 'HIGH', message });
    fixture.detectChanges();
    expect(root().querySelector('.notification-priority')).toBeNull();
    expect(text()).toContain(message);
  });

  it('shows a short headline with the OS code once, the chips, the message and one meta line', async () => {
    await setup({ ...NOTIFICATION, title: 'Impedimento na OS OS-2026-000007', message: 'Aguardando peça' });
    const dialog = root().querySelector('[role="dialog"]')!;
    const title = root().querySelector('h3')!;
    expect(dialog.getAttribute('aria-labelledby')).toBe(title.id);
    expect(title.textContent!.trim()).toBe('Impedimento · OS-2026-000007');
    expect(Array.from(root().querySelectorAll('.notification-detail__chips .mini-chip')).map((chip) => chip.textContent!.trim())).toEqual(['Atenção', 'Bloqueio']);
    expect(root().querySelector('.notification-detail__message')!.textContent).toBe('Aguardando peça');
    expect(root().querySelector('.notification-detail__meta')!.textContent!.replace(/[\s ]+/g, ' ').trim()).toBe('24/10/2026, 11:30 · há 30 min · Não lida');
    expect(root().querySelector('dl')).toBeNull();
    expect(text().split('OS-2026-000007').length - 1).toBe(1);
  });

  it('shows the read state and an active snooze, but not an expired one', async () => {
    await setup({ ...NOTIFICATION, read: true, readAt: '2026-10-24T14:40:00Z', snoozedUntil: '2026-10-24T18:00:00Z' });
    const meta = () => root().querySelector('.notification-detail__meta')!.textContent!.replace(/[\s ]+/g, ' ').trim();
    expect(meta()).toBe('24/10/2026, 11:30 · há 30 min · Lida · Adiada até 24/10/2026, 15:00');

    fixture.componentRef.setInput('notification', { ...NOTIFICATION, read: true, snoozedUntil: '2026-10-24T14:00:00Z' });
    fixture.detectChanges();
    expect(meta()).not.toContain('Adiada até');
  });

  it('emits the requested actions', async () => {
    await setup(NOTIFICATION);
    const events: string[] = [];
    fixture.componentInstance.openAction.subscribe(() => events.push('open'));
    fixture.componentInstance.markRead.subscribe(() => events.push('read'));
    fixture.componentInstance.closed.subscribe(() => events.push('close'));
    button('Abrir OS')!.click();
    button('Marcar como lida')!.click();
    button('Fechar')!.click();
    expect(events).toEqual(['open', 'read', 'close']);
  });

  it('keeps the code in the headline and offers no Abrir OS when the path is not internal', async () => {
    await setup({ ...NOTIFICATION, actionPath: '//externo' });
    expect(root().querySelector('h3')!.textContent).toContain('OS-2026-000007');
    expect(button('Abrir OS')).toBeUndefined();
  });

  it('asks for the previous and next notification and disables them at the ends', async () => {
    await setup(NOTIFICATION);
    fixture.componentRef.setInput('hasNext', true);
    fixture.detectChanges();
    const events: string[] = [];
    fixture.componentInstance.previous.subscribe(() => events.push('previous'));
    fixture.componentInstance.next.subscribe(() => events.push('next'));
    const previous = root().querySelector<HTMLButtonElement>('button[aria-label="Notificação anterior"]')!;
    const next = root().querySelector<HTMLButtonElement>('button[aria-label="Próxima notificação"]')!;
    expect(previous.disabled).toBe(true);
    next.click();
    expect(events).toEqual(['next']);
  });
});
