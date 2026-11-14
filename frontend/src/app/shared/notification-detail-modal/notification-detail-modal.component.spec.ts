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

  it('labels the dialog with the full title and shows severity, event, age and state', async () => {
    await setup(NOTIFICATION);
    const dialog = root().querySelector('[role="dialog"]')!;
    expect(dialog.getAttribute('aria-labelledby')).toBe(root().querySelector('h3')!.id);
    expect(text()).toContain('Atenção');
    expect(text()).toContain('Bloqueio');
    expect(text()).toContain('(há 30 min)');
    expect(text()).toContain('Não lida');
  });

  it('shows read time and an active snooze, but not an expired one', async () => {
    await setup({ ...NOTIFICATION, read: true, readAt: '2026-10-24T14:40:00Z', snoozedUntil: '2026-10-24T18:00:00Z' });
    expect(text()).toContain('Lida em 24/10/2026, 11:40');
    expect(text()).toContain('Adiada até 24/10/2026, 15:00');

    fixture.componentRef.setInput('notification', { ...NOTIFICATION, read: true, snoozedUntil: '2026-10-24T14:00:00Z' });
    fixture.detectChanges();
    expect(text()).not.toContain('Adiada até');
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

  it('shows the code without a link when the path is not internal', async () => {
    await setup({ ...NOTIFICATION, actionPath: '//externo' });
    expect(text()).toContain('OS-2026-000007');
    expect(root().querySelector('.link-button.code-text')).toBeNull();
    expect(button('Abrir OS')).toBeUndefined();
  });
});
