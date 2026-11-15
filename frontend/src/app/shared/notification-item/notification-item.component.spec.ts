import { TestBed } from '@angular/core/testing';
import { NotificationResponse } from '../../core/models';
import { NotificationItemComponent } from './notification-item.component';

describe('NotificationItemComponent', () => {
  it('emite seleção pelo botão e acompanha a mudança de leitura e severidade', async () => {
    await TestBed.configureTestingModule({ imports: [NotificationItemComponent] }).compileComponents();
    const fixture = TestBed.createComponent(NotificationItemComponent);
    const notification: NotificationResponse = {
      id: 1, eventType: 'RMA_CREATED', severity: 'WARNING', title: 'Nova OS', message: 'Mensagem',
      rmaId: null, rmaCode: null, actionPath: null, createdAt: '2026-10-24T12:00:00Z',
      readAt: null, snoozedUntil: null, read: false
    };
    fixture.componentRef.setInput('notification', notification);
    fixture.componentRef.setInput('headline', 'Nova OS');
    fixture.componentRef.setInput('summary', 'Cliente - Switch');
    fixture.detectChanges();
    const host: HTMLElement = fixture.nativeElement;
    const select = vi.fn();
    fixture.componentInstance.select.subscribe(select);
    const button = host.querySelector('button')!;
    expect(button.textContent).toContain('Não lida:');
    expect(button.querySelector('.notification-item__severity')?.textContent).toBe('Atenção');
    expect(button.querySelector('time')?.getAttribute('datetime')).toBe(notification.createdAt);
    button.click();
    expect(select).toHaveBeenCalledOnce();
    fixture.componentRef.setInput('notification', { ...notification, read: true, severity: 'CRITICAL' });
    fixture.detectChanges();
    expect(button.querySelector('.sr-only, .notification-item__dot')).toBeNull();
    expect(button.querySelector('.notification-item__severity')?.textContent).toBe('Crítico');
  });
});
