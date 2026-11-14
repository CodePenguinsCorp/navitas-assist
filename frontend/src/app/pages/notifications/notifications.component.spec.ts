import { AuthService } from '../../core/services/auth.service';
import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { NotificationPreferenceResponse, NotificationResponse, NotificationRuleResponse } from '../../core/models';
import { LegacyProfileCode, profilePermissions, providePermissions } from '../../testing/permission-fixtures';
import { NotificationService } from '../../core/services/notification.service';
import { ProfileService } from '../../core/services/profile.service';
import { NotificationsComponent } from './notifications.component';

const NOTIFICATION: NotificationResponse = {
  id: 5, eventType: 'RMA_ASSIGNED', severity: 'INFO', title: 'OS OS-2026-000007 atribuída a Técnico', message: 'Cliente · Produto',
  rmaId: 7, rmaCode: 'OS-2026-000007', actionPath: '/rmas?rma=7', createdAt: '2026-10-24T12:00:00Z', readAt: null, snoozedUntil: null, read: false
};

const PREFERENCES: NotificationPreferenceResponse[] = [
  { eventType: 'RMA_CREATED', severity: 'INFO', enabled: true, userMutable: true, muted: false },
  { eventType: 'TEST_FAILED', severity: 'CRITICAL', enabled: true, userMutable: false, muted: false }
];

const RULE: NotificationRuleResponse = {
  eventType: 'RMA_ASSIGNED', enabled: true, severity: 'CRITICAL', recipientProfiles: [{ id: 1, name: 'Administrador' }], notifyAssignee: true, emailEnabled: false,
  userMutable: false, updatedAt: '2026-10-24T12:00:00Z', updatedBy: 'admin'
};

interface Harness {
  open(notification: NotificationResponse): void;
  snooze(notification: NotificationResponse, minutes: string): void;
  selectTab(tab: 'inbox' | 'preferences' | 'rules'): void;
  toggleMute(preference: NotificationPreferenceResponse): void;
  canManageRules(): boolean;
}

describe('NotificationsComponent', () => {
  let fixture: ComponentFixture<NotificationsComponent>;
  let component: Harness;
  let service: Record<string, ReturnType<typeof vi.fn>> & { unreadCount: ReturnType<typeof signal<number>>; summaryLoaded: ReturnType<typeof signal<boolean>>; summaryLoadFailed: ReturnType<typeof signal<boolean>> };

  async function setUp(role: LegacyProfileCode): Promise<void> {
    service = {
      unreadCount: signal(1),
      summaryLoaded: signal(true),
      summaryLoadFailed: signal(false),
      list: vi.fn(() => of([NOTIFICATION])),
      refreshSummary: vi.fn(() => of(1)),
      markRead: vi.fn(() => of({ ...NOTIFICATION, read: true })),
      markAllRead: vi.fn(() => of(undefined)),
      snooze: vi.fn(() => of(NOTIFICATION)),
      listPreferences: vi.fn(() => of(PREFERENCES)),
      updatePreference: vi.fn(() => of({ ...PREFERENCES[0], muted: true })),
      listRules: vi.fn(() => of([RULE])),
      updateRule: vi.fn(() => of(RULE)),
      emailStatus: vi.fn(() => of({ enabled: true, provider: 'fake' })),
      listFailures: vi.fn(() => of([]))
    } as never;
    await TestBed.configureTestingModule({
      imports: [NotificationsComponent],
      providers: [
        provideRouter([]),
        { provide: AuthService, useValue: { currentUser: () => ({ email: 'user@example.com' }) } },
        { provide: NotificationService, useValue: service },
        { provide: ProfileService, useValue: { options: () => of([{ id: 1, name: 'Administrador', permissions: [] }, { id: 2, name: 'Atendimento', permissions: [] }]), invalidateOptions: () => undefined } },
        providePermissions(profilePermissions(role))
      ]
    }).compileComponents();
    fixture = TestBed.createComponent(NotificationsComponent);
    component = fixture.componentInstance as unknown as Harness;
    fixture.detectChanges();
  }

  it('lists the inbox with context and opens the detail dialog before any navigation', async () => {
    await setUp('TECHNICIAN');
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    const text: string = fixture.nativeElement.textContent;

    expect(text).toContain('OS OS-2026-000007 atribuída a Técnico');
    expect(fixture.nativeElement.querySelector('.notification-meta')!.textContent).not.toContain('Nova atribuição');
    expect(text).not.toContain('Regras');

    component.open(NOTIFICATION);
    fixture.detectChanges();
    expect(service['markRead']).toHaveBeenCalledWith(5, { silent: true });
    expect(fixture.nativeElement.querySelector('app-notification-detail-modal [role="dialog"]')).not.toBeNull();
    expect(navigate).not.toHaveBeenCalled();
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

    expect(fixture.nativeElement.querySelector('input.switch[aria-label="Receber Nova OS"]')).not.toBeNull();
    expect(text).toContain('Obrigatório');
    component.toggleMute(PREFERENCES[0]);
    expect(service['updatePreference']).toHaveBeenCalledWith('RMA_CREATED', true);
  });

  // Mudança deliberada de fluxo (não de contrato): a regra é editada num formulário e enviada uma vez.
  it('lets admins change recipient profiles of a rule', async () => {
    await setUp('ADMIN');
    expect(component.canManageRules()).toBe(true);
    component.selectTab('rules');
    fixture.detectChanges();
    fixture.nativeElement.querySelector('button[aria-label="Editar regra Nova atribuição"]').click();
    fixture.detectChanges();
    const dialog: HTMLElement = fixture.nativeElement.querySelector('[role="dialog"]');
    const serviceDesk = Array.from(dialog.querySelectorAll('label')).find((label) => label.textContent?.trim() === 'Atendimento')!.querySelector('input')!;
    serviceDesk.click();
    dialog.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    fixture.detectChanges();

    expect(service['updateRule']).toHaveBeenCalledWith('RMA_ASSIGNED', {
      enabled: true, appEnabled: true, severity: 'CRITICAL', recipientProfileIds: [1, 2], notifyAssignee: true, emailEnabled: false, userMutable: false
    });
  });
});
