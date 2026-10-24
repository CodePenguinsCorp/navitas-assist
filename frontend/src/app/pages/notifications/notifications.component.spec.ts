import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { NotificationPreferenceResponse, NotificationResponse, NotificationRuleResponse, UserRole } from '../../core/models';
import { AuthService } from '../../core/services/auth.service';
import { NotificationService } from '../../core/services/notification.service';
import { NotificationsComponent } from './notifications.component';

const NOTIFICATION: NotificationResponse = {
  id: 5, eventType: 'RMA_ASSIGNED', severity: 'INFO', title: 'RMA RMA-2026-000007 atribuído a Técnico', message: 'Cliente · Produto',
  rmaId: 7, rmaCode: 'RMA-2026-000007', actionPath: '/rmas?rma=7', createdAt: '2026-10-24T12:00:00Z', readAt: null, snoozedUntil: null, read: false
};

const PREFERENCES: NotificationPreferenceResponse[] = [
  { eventType: 'RMA_CREATED', severity: 'INFO', enabled: true, userMutable: true, muted: false },
  { eventType: 'SLA_OVERDUE', severity: 'CRITICAL', enabled: true, userMutable: false, muted: false }
];

const RULE: NotificationRuleResponse = {
  eventType: 'SLA_OVERDUE', enabled: true, severity: 'CRITICAL', recipientRoles: ['ADMIN'], notifyAssignee: true, emailEnabled: false,
  userMutable: false, updatedAt: '2026-10-24T12:00:00Z', updatedBy: 'admin'
};

interface Harness {
  open(notification: NotificationResponse): void;
  snooze(notification: NotificationResponse, minutes: string): void;
  selectTab(tab: 'inbox' | 'preferences' | 'rules'): void;
  toggleMute(preference: NotificationPreferenceResponse): void;
  toggleRole(rule: NotificationRuleResponse, role: UserRole): void;
  isAdmin(): boolean;
}

describe('NotificationsComponent', () => {
  let fixture: ComponentFixture<NotificationsComponent>;
  let component: Harness;
  let service: Record<string, ReturnType<typeof vi.fn>> & { unreadCount: ReturnType<typeof signal<number>> };

  async function setUp(role: UserRole): Promise<void> {
    service = {
      unreadCount: signal(1),
      list: vi.fn(() => of([NOTIFICATION])),
      refreshSummary: vi.fn(() => of(1)),
      markRead: vi.fn(() => of({ ...NOTIFICATION, read: true })),
      markAllRead: vi.fn(() => of(undefined)),
      snooze: vi.fn(() => of(NOTIFICATION)),
      listPreferences: vi.fn(() => of(PREFERENCES)),
      updatePreference: vi.fn(() => of({ ...PREFERENCES[0], muted: true })),
      listRules: vi.fn(() => of([RULE])),
      updateRule: vi.fn(() => of(RULE)),
      listFailures: vi.fn(() => of([]))
    } as never;
    await TestBed.configureTestingModule({
      imports: [NotificationsComponent],
      providers: [
        provideRouter([]),
        { provide: NotificationService, useValue: service },
        { provide: AuthService, useValue: { hasAnyRole: (roles: UserRole[]) => roles.includes(role) } }
      ]
    }).compileComponents();
    fixture = TestBed.createComponent(NotificationsComponent);
    component = fixture.componentInstance as unknown as Harness;
    fixture.detectChanges();
  }

  it('lists the inbox with context and opens the related RMA through an internal route', async () => {
    await setUp('TECHNICIAN');
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    const text: string = fixture.nativeElement.textContent;

    expect(text).toContain('RMA RMA-2026-000007 atribuído a Técnico');
    expect(text).toContain('Nova atribuição');
    expect(text).not.toContain('Regras');

    component.open(NOTIFICATION);
    expect(service['markRead']).toHaveBeenCalledWith(5);
    expect(navigate).toHaveBeenCalledWith(['/rmas'], { queryParams: { rma: '7' } });
  });

  it('snoozes for the chosen period', async () => {
    await setUp('TECHNICIAN');
    component.snooze(NOTIFICATION, '240');
    expect(service['snooze']).toHaveBeenCalledWith(5, 240);
  });

  it('only offers muting for rules that allow it', async () => {
    await setUp('SERVICE_DESK');
    component.selectTab('preferences');
    fixture.detectChanges();
    const text: string = fixture.nativeElement.textContent;

    expect(text).toContain('Silenciar');
    expect(text).toContain('Obrigatório');
    component.toggleMute(PREFERENCES[0]);
    expect(service['updatePreference']).toHaveBeenCalledWith('RMA_CREATED', true);
  });

  it('lets admins change recipient roles of a rule', async () => {
    await setUp('ADMIN');
    expect(component.isAdmin()).toBe(true);
    component.selectTab('rules');
    component.toggleRole(RULE, 'SERVICE_DESK');

    expect(service['updateRule']).toHaveBeenCalledWith('SLA_OVERDUE', {
      enabled: true, severity: 'CRITICAL', recipientRoles: ['ADMIN', 'SERVICE_DESK'], notifyAssignee: true, emailEnabled: false, userMutable: false
    });
  });
});
