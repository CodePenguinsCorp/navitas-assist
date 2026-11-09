import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectorRef, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { Observable, Subject, of, throwError } from 'rxjs';
import { NotificationFailureResponse, NotificationRuleResponse, UserRole } from '../../core/models';
import { AuthService } from '../../core/services/auth.service';
import { NotificationService } from '../../core/services/notification.service';
import { NotificationsComponent } from './notifications.component';

const RULE: NotificationRuleResponse = {
  eventType: 'SLA_OVERDUE', enabled: true, severity: 'CRITICAL', recipientRoles: ['ADMIN'], notifyAssignee: true, emailEnabled: false,
  userMutable: false, updatedAt: '2026-10-24T12:00:00Z', updatedBy: 'admin'
};
const SILENT_RULE: NotificationRuleResponse = {
  ...RULE, eventType: 'RMA_CREATED', enabled: false, severity: 'INFO', recipientRoles: [], notifyAssignee: false
};

const failure = () => throwError(() => new HttpErrorResponse({ status: 500 }));

interface Harness {
  selectTab(tab: 'inbox' | 'preferences' | 'rules'): void;
}

describe('NotificationsComponent rules', () => {
  let fixture: ComponentFixture<NotificationsComponent>;
  let component: Harness;
  let service: Record<string, ReturnType<typeof vi.fn>> & { unreadCount: ReturnType<typeof signal<number>> };

  const root = (): HTMLElement => fixture.nativeElement.querySelector('.page-surface');
  const normalize = (value: string | null | undefined) => (value ?? '').replace(/[\s ]+/g, ' ').trim();
  const text = () => normalize(root().textContent);
  const render = () => { fixture.componentRef.injector.get(ChangeDetectorRef).markForCheck(); fixture.detectChanges(); };
  const button = (label: string) => Array.from(root().querySelectorAll('button')).find((item) => item.textContent?.trim() === label);
  const rulesTable = () => root().querySelector<HTMLTableElement>('table');
  const row = (table: HTMLTableElement, label: string) => Array.from(table.querySelectorAll('tbody tr')).find((tr) => normalize(tr.children[0].textContent) === label)!;
  const cells = (table: HTMLTableElement, label: string) => {
    const headers = Array.from(table.querySelectorAll('thead th')).map((th) => normalize(th.textContent));
    const tr = row(table, label);
    return Object.fromEntries(headers.map((header, index) => [header, normalize(tr.children[index].textContent)]));
  };
  const openRules = () => { component.selectTab('rules'); render(); };

  async function setup(sources: { role?: UserRole; rules?: Observable<NotificationRuleResponse[]>[]; failures?: Observable<NotificationFailureResponse[]>[]; update?: Observable<NotificationRuleResponse>[] } = {}) {
    const listRules = vi.fn(() => of([RULE]));
    for (const source of sources.rules ?? []) listRules.mockImplementationOnce(() => source);
    const listFailures = vi.fn(() => of([] as NotificationFailureResponse[]));
    for (const source of sources.failures ?? []) listFailures.mockImplementationOnce(() => source);
    const updateRule = vi.fn((eventType: string, payload: object) => of({ ...RULE, ...payload, eventType, updatedAt: '2026-10-24T16:00:00Z', updatedBy: 'root' }));
    for (const source of sources.update ?? []) updateRule.mockImplementationOnce(() => source as never);
    service = {
      unreadCount: signal(0),
      list: vi.fn(() => of([])),
      refreshSummary: vi.fn(() => of(0)),
      markRead: vi.fn(),
      markAllRead: vi.fn(),
      snooze: vi.fn(),
      listPreferences: vi.fn(() => of([])),
      updatePreference: vi.fn(),
      listRules,
      updateRule,
      listFailures
    } as never;
    await TestBed.configureTestingModule({
      imports: [NotificationsComponent],
      providers: [
        provideRouter([]),
        { provide: NotificationService, useValue: service },
        { provide: AuthService, useValue: { hasAnyRole: (roles: UserRole[]) => roles.includes(sources.role ?? 'ADMIN') } }
      ]
    }).compileComponents();
    fixture = TestBed.createComponent(NotificationsComponent);
    component = fixture.componentInstance as unknown as Harness;
    render();
  }

  // Vermelho: a tabela tem checkboxes e selects por linha e nenhum botão "Editar regra".
  it('summarizes each rule without inline controls', async () => {
    await setup({ rules: [of([RULE, SILENT_RULE])] });
    openRules();
    const table = rulesTable()!;
    expect(cells(table, 'SLA vencido')).toMatchObject({
      'Alerta': 'SLA vencido',
      'Situação': 'Ativa',
      'Severidade': 'Crítico',
      'Destinatários': 'Administrador + responsável pelo RMA',
      'E-mail': 'Não',
      'Silenciável': 'Não',
      'Atualização': '24/10/2026, 09:00 por admin'
    });
    expect(table.querySelector('input')).toBeNull();
    expect(table.querySelector('app-custom-select')).toBeNull();
    expect(table.querySelector('button[aria-label="Editar regra SLA vencido"]')).not.toBeNull();
    expect(cells(table, 'Novo RMA')['Destinatários']).toBe('Nenhum destinatário');
    expect(cells(table, 'Novo RMA')['Situação']).toBe('Inativa');
  });

  // Vermelho: a tabela aparece vazia durante a carga e antiga depois da falha.
  it('separates rule loading, failure and stale rows', async () => {
    await setup({ rules: [new Subject<NotificationRuleResponse[]>()] });
    openRules();
    expect(text()).toContain('Carregando regras...');
    expect(rulesTable()).toBeNull();

    TestBed.resetTestingModule();
    await setup({ rules: [failure()] });
    openRules();
    expect(text()).toContain('Não foi possível carregar as regras.');
    expect(button('Tentar novamente')).toBeDefined();

    TestBed.resetTestingModule();
    await setup({ rules: [of([RULE]), failure()] });
    openRules();
    expect(text()).toContain('SLA vencido');
    component.selectTab('preferences');
    render();
    openRules();
    expect(text()).not.toContain('SLA vencido');
    expect(text()).toContain('Não foi possível carregar as regras.');
    button('Tentar novamente')!.click();
    render();
    expect(service['listRules']).toHaveBeenCalledTimes(3);
    expect(text()).toContain('SLA vencido');
  });

  // Vermelho: com lista vazia aparece a tabela sem linhas.
  it('shows an empty rule list', async () => {
    await setup({ rules: [of([])] });
    openRules();
    expect(text()).toContain('Nenhuma regra disponível.');
    expect(rulesTable()).toBeNull();
  });

  describe('preservation', () => {
    it.each(['TECHNICIAN', 'SERVICE_DESK', 'VIEWER'] as const)('hides rules from %s', async (role) => {
      await setup({ role });
      expect(Array.from(root().querySelectorAll('[role="tab"]')).map((tab) => tab.textContent!.trim())).not.toContain('Regras');
      component.selectTab('rules');
      expect(service['listRules']).not.toHaveBeenCalled();
    });
  });
});
