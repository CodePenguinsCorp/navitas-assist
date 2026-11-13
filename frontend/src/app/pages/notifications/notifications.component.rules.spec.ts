import { AuthService } from '../../core/services/auth.service';
import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectorRef, Signal, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { Observable, Subject, of, throwError } from 'rxjs';
import { NotificationFailureResponse, NotificationRuleResponse } from '../../core/models';
import { Permission } from '../../core/permissions';
import { LegacyProfileCode, profilePermissions, providePermissions } from '../../testing/permission-fixtures';
import { LoadingService } from '../../core/services/loading.service';
import { NotificationService } from '../../core/services/notification.service';
import { NotificationEmailStatusResponse, ProfileOption } from '../../core/models';
import { ProfileService } from '../../core/services/profile.service';
import { expectCancelBeforePrimary } from '../../testing/dialog-actions';
import { NotificationsComponent } from './notifications.component';

// Opções de `GET /api/profiles/options`, ordenadas por nome como na API.
const PROFILES: ProfileOption[] = [
  { id: 1, name: 'Administrador', permissions: [] },
  { id: 2, name: 'Atendimento', permissions: [] },
  { id: 4, name: 'Consulta', permissions: [] },
  { id: 3, name: 'Técnico', permissions: [] }
];
const profilesOf = (ids: number[]) => PROFILES.filter((profile) => ids.includes(profile.id)).map(({ id, name }) => ({ id, name }));

const RULE: NotificationRuleResponse = {
  eventType: 'RMA_BLOCKED', enabled: true, severity: 'CRITICAL', recipientProfiles: profilesOf([1]), notifyAssignee: true, emailEnabled: false,
  userMutable: false, updatedAt: '2026-10-24T12:00:00Z', updatedBy: 'admin'
};
const SILENT_RULE: NotificationRuleResponse = {
  ...RULE, eventType: 'RMA_CREATED', enabled: false, severity: 'INFO', recipientProfiles: [], notifyAssignee: false
};

const failure = () => throwError(() => new HttpErrorResponse({ status: 500 }));

interface Harness {
  selectTab(tab: 'inbox' | 'preferences' | 'rules'): void;
}

describe('NotificationsComponent rules', () => {
  let fixture: ComponentFixture<NotificationsComponent>;
  let component: Harness;
  let profileOptions: ReturnType<typeof vi.fn>;
  let invalidateOptions: ReturnType<typeof vi.fn>;
  let service: Record<string, ReturnType<typeof vi.fn>> & { unreadCount: ReturnType<typeof signal<number>>; summaryLoaded: ReturnType<typeof signal<boolean>>; summaryLoadFailed: ReturnType<typeof signal<boolean>> };

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

  async function setup(sources: { role?: LegacyProfileCode; permissions?: readonly Permission[] | Signal<readonly Permission[]>; rules?: Observable<NotificationRuleResponse[]>[]; failures?: Observable<NotificationFailureResponse[]>[]; update?: Observable<NotificationRuleResponse>[]; profiles?: Observable<ProfileOption[]>[]; emailStatus?: NotificationEmailStatusResponse } = {}) {
    const listRules = vi.fn(() => of([RULE]));
    for (const source of sources.rules ?? []) listRules.mockImplementationOnce(() => source);
    const listFailures = vi.fn(() => of([] as NotificationFailureResponse[]));
    for (const source of sources.failures ?? []) listFailures.mockImplementationOnce(() => source);
    const updateRule = vi.fn((eventType: string, { recipientProfileIds, ...payload }: { recipientProfileIds: number[] }) =>
      of({ ...RULE, ...payload, recipientProfiles: profilesOf(recipientProfileIds), eventType, updatedAt: '2026-10-24T16:00:00Z', updatedBy: 'root' }));
    for (const source of sources.update ?? []) updateRule.mockImplementationOnce(() => source as never);
    profileOptions = vi.fn(() => of(PROFILES));
    invalidateOptions = vi.fn();
    for (const source of sources.profiles ?? []) profileOptions.mockImplementationOnce(() => source);
    service = {
      unreadCount: signal(0),
      summaryLoaded: signal(true),
      summaryLoadFailed: signal(false),
      list: vi.fn(() => of([])),
      refreshSummary: vi.fn(() => of(0)),
      markRead: vi.fn(),
      markAllRead: vi.fn(),
      snooze: vi.fn(),
      listPreferences: vi.fn(() => of([])),
      updatePreference: vi.fn(),
      listRules,
      updateRule,
      emailStatus: vi.fn(() => of(sources.emailStatus ?? { enabled: true, provider: 'fake' })),
      testEmail: vi.fn(() => of({ status: 'simulado', provider: 'fake' })),
      retryEmail: vi.fn(() => of({ notificationId: 42, status: 'PENDING', provider: 'fake' })),
      listFailures
    } as never;
    await TestBed.configureTestingModule({
      imports: [NotificationsComponent],
      providers: [
        provideRouter([]),
        { provide: AuthService, useValue: { currentUser: () => ({ email: 'user@example.com' }) } },
        { provide: NotificationService, useValue: service },
        { provide: ProfileService, useValue: { options: profileOptions, invalidateOptions } },
        providePermissions(sources.permissions ?? profilePermissions(sources.role ?? 'ADMIN'))
      ]
    }).compileComponents();
    fixture = TestBed.createComponent(NotificationsComponent);
    component = fixture.componentInstance as unknown as Harness;
    render();
  }

  it.each(['RMA_BLOCKED', 'PART_PENDING', 'TEST_FAILED'] as const)('permite editar o evento suportado %s', async (eventType) => {
    const labels = { RMA_BLOCKED: 'Bloqueio', PART_PENDING: 'Peça pendente', TEST_FAILED: 'Falha de teste' };
    await setup({ rules: [of([{ ...RULE, eventType, supported: true, severity: 'WARNING', emailEnabled: false }])] }); openRules();
    expect(text()).not.toContain('Indisponível');
    const edit = root().querySelector<HTMLButtonElement>(`button[aria-label="Editar regra ${labels[eventType]}"]`);
    expect(edit?.disabled).toBe(false);
    edit!.click(); render();
    expect(root().querySelector('[role="dialog"]')).not.toBeNull();
  });

  it('envia teste para si e informa simulação sem alegar entrega', async () => {
    await setup(); openRules();
    button('Enviar e-mail de teste')!.click(); render();
    expect(service['testEmail']).toHaveBeenCalledTimes(1);
    expect(text()).toContain('Simulação registrada');
    expect(text()).not.toContain('Entregue');
  });

  it.each([400, 409])('mostra erro inline de reenvio %s e permite nova tentativa', async (status) => {
    const email: NotificationFailureResponse = { source: 'EMAIL', eventKey: 'e', eventType: 'RMA_CREATED', rmaCode: 'RMA-1', recipient: 'admin', error: 'Falha', occurredAt: RULE.updatedAt, notificationId: 42, status: 'FAILED', retryAllowed: true, attempts: 5 };
    await setup({ failures: [of([email]), of([email])] }); openRules();
    service['retryEmail'].mockReturnValueOnce(throwError(() => new HttpErrorResponse({ status, error: { message: 'Reenvio recusado' } })));
    button('Reenviar')!.click(); render();
    expect(text()).toContain('Reenvio recusado');
    expect(button('Reenviar')!.disabled).toBe(false);
    expect(service['listFailures']).toHaveBeenCalledTimes(status === 409 ? 2 : 1);
  });

  it('bloqueia teste duplicado e ignora resposta depois da perda de permissão', async () => {
    const permissions = signal<readonly Permission[]>(profilePermissions('ADMIN'));
    const pending = new Subject<{ status: string; provider: string }>();
    await setup({ permissions }); openRules();
    service['testEmail'].mockReturnValue(pending);
    button('Enviar e-mail de teste')!.click(); render();
    expect(button('Enviando...')!.disabled).toBe(true);
    permissions.set(profilePermissions('TECHNICIAN')); render();
    pending.next({ status: 'simulado', provider: 'fake' }); pending.complete(); render();
    expect(root().querySelector('.email-failures-section')).toBeNull();
    expect(text()).not.toContain('Simulação registrada');
  });

  const REAL = { enabled: true, provider: 'smtp', sentToday: 12, dailyLimit: 100, sentThisMonth: 340, monthlyLimit: 3000, limitReached: false };

  it('mostra o consumo diário com o mensal no tooltip quando o provedor é real', async () => {
    await setup({ emailStatus: REAL }); openRules();
    const usage = root().querySelector<HTMLElement>('.email-usage')!;
    expect(normalize(usage.textContent)).toBe('Enviados hoje 12/100');
    expect(usage.title).toBe('No mês 340/3000');
    expect(text()).not.toContain('Limite atingido');
  });

  it('omite o limite quando é zero e a contagem com provedor falso', async () => {
    await setup({ emailStatus: { ...REAL, dailyLimit: 0, monthlyLimit: 0 } }); openRules();
    const usage = root().querySelector<HTMLElement>('.email-usage')!;
    expect(normalize(usage.textContent)).toBe('Enviados hoje 12');
    expect(usage.title).toBe('No mês 340');
  });

  it('não mostra contagem com provedor falso', async () => {
    await setup({ emailStatus: { ...REAL, provider: 'fake' } }); openRules();
    expect(root().querySelector('.email-usage')).toBeNull();
  });

  it('destaca o limite atingido com aviso curto', async () => {
    await setup({ emailStatus: { ...REAL, sentToday: 100, limitReached: true } }); openRules();
    expect(root().querySelector('.email-usage--limit')).not.toBeNull();
    expect(text()).toContain('Limite atingido: os envios retomam no próximo período');
  });

  it.each([400, 429, 502])('mostra erro inline do teste %s sem feedback de sucesso', async status => {
    await setup(); openRules();
    service['testEmail'].mockReturnValue(throwError(() => new HttpErrorResponse({ status, error: { message: 'Teste recusado' } })));
    button('Enviar e-mail de teste')!.click(); render();
    expect(text()).toContain('Teste recusado');
    expect(text()).not.toContain('Teste enviado');
    expect(button('Enviar e-mail de teste')!.disabled).toBe(false);
  });

  it('permite salvar os dois canais independentemente', async () => {
    await setup(); openRules();
    const editor = component as unknown as { openRuleEditor(rule: NotificationRuleResponse): void; ruleForm: { patchValue(value: object): void }; saveRule(): void };
    editor.openRuleEditor(RULE); editor.ruleForm.patchValue({ appEnabled: false, emailEnabled: true }); editor.saveRule();
    expect(service['updateRule']).toHaveBeenCalledWith(RULE.eventType, expect.objectContaining({ appEnabled: false, emailEnabled: true }));
  });

  it('não oferece reenvio para email pendente ou falha de evento', async () => {
    await setup({ failures: [of([{ source: 'EMAIL', eventKey: 'e', eventType: 'RMA_CREATED', rmaCode: null, recipient: null, error: 'Erro', occurredAt: RULE.updatedAt, notificationId: 42, status: 'PENDING', retryAllowed: true }])] });
    openRules(); expect(button('Reenviar')).toBeUndefined();
  });

  // Vermelho: a tabela tem checkboxes e selects por linha e nenhum botão "Editar regra".
  it('summarizes each rule without inline controls', async () => {
    await setup({ rules: [of([RULE, SILENT_RULE])] });
    openRules();
    const table = rulesTable()!;
    expect(cells(table, 'Bloqueio')).toMatchObject({
      'Alerta': 'Bloqueio',
      'Ativa': 'Ativa',
      'Severidade': 'Crítico',
      'Destinatários': 'Administrador + responsável pelo RMA',
      'E-mail': 'Não',
      'Silenciável': 'Não',
      'Atualização': '24/10/2026, 09:00 por admin'
    });
    expect(table.querySelector('input')).toBeNull();
    expect(table.querySelector('app-custom-select')).toBeNull();
    expect(table.querySelector('button[aria-label="Editar regra Bloqueio"]')).not.toBeNull();
    expect(cells(table, 'Novo RMA')['Destinatários']).toMatch(/^Nenhum destinatário\b/);
    expect(cells(table, 'Novo RMA')['Ativa']).toBe('Inativa');
  });

  // Vermelho: a tabela aparece vazia durante a carga e antiga depois da falha.
  it('separates rule loading, failure and stale rows', async () => {
    await setup({ rules: [new Subject<NotificationRuleResponse[]>()] });
    openRules();
    expectPending(root());
    expect(rulesTable()).toBeNull();

    TestBed.resetTestingModule();
    await setup({ rules: [failure()] });
    openRules();
    expect(text()).toContain('Não foi possível carregar as regras.');
    expect(button('Tentar novamente')).toBeDefined();

    TestBed.resetTestingModule();
    await setup({ rules: [of([RULE]), failure()] });
    openRules();
    expect(text()).toContain('Bloqueio');
    component.selectTab('preferences');
    render();
    openRules();
    expect(text()).not.toContain('Bloqueio');
    expect(text()).toContain('Não foi possível carregar as regras.');
    button('Tentar novamente')!.click();
    render();
    expect(service['listRules']).toHaveBeenCalledTimes(3);
    expect(text()).toContain('Bloqueio');
  });

  // Vermelho: com lista vazia aparece a tabela sem linhas.
  it('shows an empty rule list', async () => {
    await setup({ rules: [of([])] });
    openRules();
    expect(text()).toContain('Nenhuma regra disponível.');
    expect(rulesTable()).toBeNull();
  });

  it('announces a pending reload after an empty rule result', async () => {
    const pending = new Subject<NotificationRuleResponse[]>();
    await setup({ rules: [of([]), pending] });
    openRules();
    expect(text()).toContain('Nenhuma regra disponível.');
    component.selectTab('inbox');
    render();
    openRules();
    expectPending(root());
    expect(text()).not.toContain('Nenhuma regra disponível.');
    pending.next([]);
    pending.complete();
    render();
    expect(text()).toContain('Nenhuma regra disponível.');
    expect(root().querySelector('.rules-state[role="status"]')).toBeNull();
  });

  it('hides previous rules during a pending reload', async () => {
    await setup({ rules: [of([RULE]), new Subject<NotificationRuleResponse[]>()] });
    openRules(); component.selectTab('preferences'); render(); openRules();
    expectPending(root());
    expect(rulesTable()).toBeNull();
    expect(text()).not.toContain('Bloqueio');
  });

  it('keeps the rule failure visible during a pending retry', async () => {
    await setup({ rules: [failure(), new Subject<NotificationRuleResponse[]>()] });
    openRules();
    button('Tentar novamente')!.click();
    render();
    expect(root().querySelector('.rules-state[role="alert"]')?.textContent).toContain('Não foi possível carregar as regras.');
    expect(button('Tentar novamente')!.disabled).toBe(true);
    expect(root().querySelector('.rules-state[role="status"]')).toBeNull();
    expect(text()).not.toContain('Nenhuma regra disponível.');
  });

  it('goes back to the inbox when the rules permission is lost on the rules tab', async () => {
    const permissions = signal<readonly Permission[]>(profilePermissions('ADMIN'));
    await setup({ permissions });
    openRules();
    permissions.set(profilePermissions('ADMIN').filter((permission) => permission !== 'notificacoes.regras'));
    render();
    expect(root().querySelector('#notifications-tab-inbox')?.getAttribute('aria-selected')).toBe('true');
    expect(root().querySelector<HTMLElement>('#notifications-panel-inbox')!.hidden).toBe(false);
  });

  describe('preservation', () => {
    it.each(['TECHNICIAN', 'SERVICE_DESK', 'VIEWER'] as const)('hides rules from %s', async (role) => {
      await setup({ role });
      expect(Array.from(root().querySelectorAll('[role="tab"]')).map((tab) => tab.textContent!.trim())).not.toContain('Regras');
      component.selectTab('rules');
      expect(service['listRules']).not.toHaveBeenCalled();
    });

    it.each(['ADMIN', 'SERVICE_DESK', 'TECHNICIAN', 'VIEWER'] as const)('offers the rules tab only to ADMIN among migrated profiles (%s)', async (role) => {
      await setup({ role });
      const tabs = Array.from(root().querySelectorAll('[role="tab"]')).map((tab) => tab.textContent!.trim());
      expect(tabs.includes('Regras')).toBe(role === 'ADMIN');
    });

    it.each([
      { permissions: ['notificacoes.regras'] as Permission[], visible: true },
      { permissions: profilePermissions('ADMIN').filter((permission) => permission !== 'notificacoes.regras'), visible: false }
    ])('follows notificacoes.regras alone for the rules tab (visible=$visible)', async ({ permissions, visible }) => {
      await setup({ permissions });
      const tabs = Array.from(root().querySelectorAll('[role="tab"]')).map((tab) => tab.textContent!.trim());
      expect(tabs.includes('Regras')).toBe(visible);
      component.selectTab('rules');
      expect(service['listRules']).toHaveBeenCalledTimes(visible ? 1 : 0);
    });
  });

  describe('rule form', () => {
    const dialog = () => root().querySelector<HTMLElement>('[role="dialog"]');
    const openEditor = (label: string) => { root().querySelector<HTMLButtonElement>(`button[aria-label="Editar regra ${label}"]`)!.click(); render(); };
    const field = (label: string) => Array.from(dialog()!.querySelectorAll('label')).find((item) => normalize(item.textContent).startsWith(label))!.querySelector('input')!;
    const toggleField = (label: string) => { field(label).click(); render(); };
    const dialogButton = (label: string) => Array.from(dialog()!.querySelectorAll('button')).find((item) => normalize(item.textContent) === label || item.getAttribute('aria-label') === label)!;
    const submit = () => { dialog()!.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })); render(); };
    const formHarness = () => component as unknown as { saveRule(): void; ruleForm: { controls: { severity: { setValue(value: string): void } } } };

    // Vermelho: não existe botão de edição que abra um formulário focado da regra.
    it('edits a rule in a focused form and saves the same contract', async () => {
      await setup();
      openRules();
      openEditor('Bloqueio');
      expect(Array.from(dialog()!.querySelectorAll('fieldset legend')).map((legend) => normalize(legend.textContent))).toEqual(['Entrega', 'Destinatários', 'Silenciamento']);
      expect(normalize(field('Atendimento').closest('fieldset')!.querySelector('legend')!.textContent)).toBe('Destinatários');
      // Os dois canais ficam juntos na seção de entrega.
      expect(normalize(field('App').closest('fieldset')!.querySelector('legend')!.textContent)).toBe('Entrega');
      expect(normalize(field('E-mail').closest('fieldset')!.querySelector('legend')!.textContent)).toBe('Entrega');
      expect(dialog()!.textContent).toContain('Vale para os próximos eventos.');
      expectCancelBeforePrimary(dialog()!);
      toggleField('Atendimento');
      submit();
      expect(service['updateRule']).toHaveBeenCalledTimes(1);
      expect(service['updateRule']).toHaveBeenCalledWith('RMA_BLOCKED', {
        enabled: true, appEnabled: true, severity: 'CRITICAL', recipientProfileIds: [1, 2], notifyAssignee: true, emailEnabled: false, userMutable: false
      });
      expect(dialog()).toBeNull();
      expect(cells(rulesTable()!, 'Bloqueio')).toMatchObject({
        'Destinatários': 'Administrador, Atendimento + responsável pelo RMA',
        'Atualização': '24/10/2026, 13:00 por root'
      });
      expect(text()).toContain('Regra "Bloqueio" atualizada.');
    });

    // Vermelho: o resumo e o editor não explicam que a regra sem destinatários não entrega a ninguém.
    it('lists profiles as recipient checkboxes and prefills those of the rule', async () => {
      await setup({ profiles: [of([...PROFILES, { id: 9, name: 'Supervisor', permissions: [] }])] });
      openRules();
      openEditor('Bloqueio');
      const recipients = field('Administrador').closest('fieldset')!;
      expect(Array.from(recipients.querySelectorAll('label.checkbox-field')).map((label) => normalize(label.textContent)))
        .toEqual(['Administrador', 'Atendimento', 'Consulta', 'Técnico', 'Supervisor', 'Notificar o responsável pelo RMA']);
      expect(field('Administrador').checked).toBe(true);
      expect(field('Supervisor').checked).toBe(false);
      toggleField('Supervisor');
      submit();
      expect(service['updateRule']).toHaveBeenCalledWith('RMA_BLOCKED', expect.objectContaining({ recipientProfileIds: [1, 9] }));
    });

    it('loads profile options once, when the rules tab opens', async () => {
      await setup();
      expect(profileOptions).not.toHaveBeenCalled();
      openRules();
      openEditor('Bloqueio');
      dialogButton('Cancelar').click();
      render();
      openEditor('Bloqueio');
      expect(profileOptions).toHaveBeenCalledTimes(1);
    });

    it('shows error when profiles fail to load and retries on the next editor', async () => {
      await setup({ profiles: [throwError(() => new HttpErrorResponse({ status: 503 }))] });
      openRules();
      openEditor('Bloqueio');
      expect(dialog()!.querySelector('[role="alert"] strong')?.textContent?.trim()).toBe('Não foi possível carregar os perfis.');
      expect(dialog()!.querySelector<HTMLButtonElement>('button[type="submit"]')!.disabled).toBe(true);
      submit();
      expect(service['updateRule']).not.toHaveBeenCalled();
      dialogButton('Cancelar').click();
      render();
      openEditor('Bloqueio');
      expect(dialog()!.querySelector('[role="alert"]')).toBeNull();
      expect(field('Administrador').checked).toBe(true);
      expect(profileOptions).toHaveBeenCalledTimes(2);
    });

    it('retries the profile options from the editor alert', async () => {
      await setup({ profiles: [throwError(() => new HttpErrorResponse({ status: 503 }))] });
      openRules();
      openEditor('Bloqueio');
      dialogButton('Tentar novamente').click();
      render();
      expect(profileOptions).toHaveBeenCalledTimes(2);
      expect(dialog()!.querySelector('[role="alert"]')).toBeNull();
      expect(field('Administrador').checked).toBe(true);
      expect(dialog()!.querySelector<HTMLButtonElement>('button[type="submit"]')!.disabled).toBe(false);
    });

    it('drops the app-wide profile options cache only the first time the rules tab opens', async () => {
      await setup();
      expect(invalidateOptions).not.toHaveBeenCalled();
      openRules();
      expect(invalidateOptions).toHaveBeenCalledTimes(1);
      expect(invalidateOptions.mock.invocationCallOrder[0]).toBeLessThan(profileOptions.mock.invocationCallOrder[0]);
      component.selectTab('inbox');
      openRules();
      expect(invalidateOptions).toHaveBeenCalledTimes(1);
    });

    it('warns only when a rule has no recipients, in the summary and in the editor, and still saves', async () => {
      const warning = 'Esta regra não entrega notificações a ninguém.';
      const assigneeOnly: NotificationRuleResponse = { ...RULE, eventType: 'RMA_ASSIGNED', recipientProfiles: [], notifyAssignee: true };
      await setup({ rules: [of([RULE, SILENT_RULE, assigneeOnly])] });
      openRules();
      const table = rulesTable()!;
      expect(cells(table, 'Novo RMA')['Destinatários']).toContain('Nenhum destinatário');
      expect(cells(table, 'Novo RMA')['Destinatários']).toContain(warning);
      expect(cells(table, 'Novo RMA')['Ativa']).toBe('Inativa');
      expect(cells(table, 'Bloqueio')['Destinatários']).not.toContain(warning);
      expect(cells(table, 'Nova atribuição')['Destinatários']).toBe('Responsável pelo RMA');

      openEditor('Bloqueio');
      expect(dialog()!.textContent).not.toContain(warning);
      toggleField('Administrador');
      expect(dialog()!.textContent).not.toContain(warning);
      toggleField('Notificar o responsável');
      expect(dialog()!.textContent).toContain(warning);
      submit();
      expect(service['updateRule']).toHaveBeenLastCalledWith('RMA_BLOCKED', {
        enabled: true, appEnabled: true, severity: 'CRITICAL', recipientProfileIds: [], notifyAssignee: false, emailEnabled: false, userMutable: false
      });

      openEditor('Novo RMA');
      expect(dialog()!.textContent).toContain(warning);
      toggleField('Técnico');
      expect(dialog()!.textContent).not.toContain(warning);
    });

    // Vermelho: sem formulário não há como salvar a regra inalterada.
    it('saves an unchanged rule and all-false booleans', async () => {
      await setup({ rules: [of([RULE, SILENT_RULE])] });
      openRules();
      openEditor('Bloqueio');
      submit();
      expect(service['updateRule']).toHaveBeenLastCalledWith('RMA_BLOCKED', {
        enabled: true, appEnabled: true, severity: 'CRITICAL', recipientProfileIds: [1], notifyAssignee: true, emailEnabled: false, userMutable: false
      });
      openEditor('Novo RMA');
      submit();
      expect(service['updateRule']).toHaveBeenLastCalledWith('RMA_CREATED', {
        enabled: false, appEnabled: true, severity: 'INFO', recipientProfileIds: [], notifyAssignee: false, emailEnabled: false, userMutable: false
      });
    });

    // Vermelho: sem formulário não há valores para conferir entre regras.
    it('does not carry values between consecutive rules', async () => {
      await setup({ rules: [of([RULE, SILENT_RULE])] });
      openRules();
      openEditor('Bloqueio');
      toggleField('Técnico');
      expect(field('Técnico').checked).toBe(true);
      dialogButton('Cancelar').click();
      render();
      openEditor('Novo RMA');
      expect(field('Técnico').checked).toBe(false);
      expect(field('Administrador').checked).toBe(false);
      expect(field('Ativa').checked).toBe(false);
      expect(field('Notificar o responsável pelo RMA').checked).toBe(false);
      expect(field('E-mail').checked).toBe(false);
      expect(field('Permitir que cada usuário silencie').checked).toBe(false);
    });

    it('keeps the current rule and its values when another editor is requested during a save', async () => {
      const pending = new Subject<NotificationRuleResponse>();
      await setup({ rules: [of([RULE, SILENT_RULE])], update: [pending] });
      openRules();
      openEditor('Bloqueio');
      toggleField('Técnico');
      submit();

      (component as unknown as { openRuleEditor(rule: NotificationRuleResponse): void }).openRuleEditor(SILENT_RULE);
      render();
      expect(dialog()!.querySelector('h3')!.textContent).toContain('Bloqueio');
      expect(field('Técnico').checked).toBe(true);
      expect(field('Ativa').checked).toBe(true);

      pending.next({ ...RULE, recipientProfiles: profilesOf([1, 3]) });
      pending.complete();
      render();
      expect(dialog()).toBeNull();
      expect(cells(rulesTable()!, 'Bloqueio')['Destinatários']).toBe('Administrador, Técnico + responsável pelo RMA');
      expect(cells(rulesTable()!, 'Novo RMA')['Ativa']).toBe('Inativa');
    });

    it('disables every rule edit button while a save is pending', async () => {
      const pending = new Subject<NotificationRuleResponse>();
      await setup({ rules: [of([RULE, SILENT_RULE])], update: [pending] });
      openRules();
      openEditor('Bloqueio');
      submit();
      const editButtons = Array.from(rulesTable()!.querySelectorAll<HTMLButtonElement>('button'));
      expect(editButtons).toHaveLength(2);
      expect(editButtons.every((button) => button.disabled)).toBe(true);
      editButtons[1].click();
      render();
      expect(dialog()!.querySelector('h3')!.textContent).toContain('Bloqueio');
    });

    // Vermelho: sem formulário não há Cancelar nem gravação pendente.
    it('does not save on cancel and keeps the form while saving', async () => {
      const pending = new Subject<NotificationRuleResponse>();
      await setup({ update: [pending] });
      openRules();
      openEditor('Bloqueio');
      toggleField('Atendimento');
      dialogButton('Cancelar').click();
      render();
      expect(service['updateRule']).not.toHaveBeenCalled();
      expect(cells(rulesTable()!, 'Bloqueio')['Destinatários']).toBe('Administrador + responsável pelo RMA');

      openEditor('Bloqueio');
      toggleField('Atendimento');
      formHarness().saveRule();
      formHarness().saveRule();
      render();
      dialogButton('Fechar').click();
      root().querySelector<HTMLElement>('.modal-overlay')!.click();
      dialogButton('Cancelar').click();
      render();
      expect(service['updateRule']).toHaveBeenCalledTimes(1);
      expect(dialog()).not.toBeNull();

      pending.error(new HttpErrorResponse({ status: 500 }));
      render();
      expect(field('Atendimento').checked).toBe(true);
      expect(dialog()!.querySelector('[role="alert"]')!.textContent).toContain('Não foi possível salvar a regra.');
      dialogButton('Cancelar').click();
      render();
      expect(dialog()).toBeNull();
    });

    describe('preservation', () => {
      it('sends the chosen severity and a disabled rule', async () => {
        await setup();
        openRules();
        openEditor('Bloqueio');
        formHarness().ruleForm.controls.severity.setValue('WARNING');
        toggleField('Ativa');
        submit();
        expect(service['updateRule']).toHaveBeenCalledWith('RMA_BLOCKED', expect.objectContaining({ severity: 'WARNING', enabled: false }));
      });

      it('usa canais app e email sem pressupor domínio corporativo', async () => {
        await setup();
        openRules();
        openEditor('Bloqueio');
        expect(field('App')).not.toBeNull();
        expect(field('E-mail')).not.toBeNull();
        expect(dialog()!.textContent).not.toContain('domínio corporativo');
      });
    });
  });

  describe('rule form focus', () => {
    beforeEach(() => vi.useFakeTimers());
    afterEach(() => vi.useRealTimers());

    const dialog = () => root().querySelector<HTMLElement>('[role="dialog"]');
    const tick = () => { render(); TestBed.tick(); };
    const editButton = () => root().querySelector<HTMLButtonElement>('button[aria-label="Editar regra Bloqueio"]')!;
    const openFromButton = () => { const trigger = editButton(); trigger.focus(); trigger.click(); tick(); return trigger; };
    const escape = () => {
      const event = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
      (document.activeElement ?? document.body).dispatchEvent(event);
      tick();
      return event;
    };
    const submit = () => { dialog()!.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })); tick(); };

    it('focuses the rule title from Editar regra and returns to it on Escape', async () => {
      await setup();
      openRules();
      tick();
      const trigger = openFromButton();
      const title = root().querySelector<HTMLElement>('#rule-form-title')!;
      expect(title.getAttribute('tabindex')).toBe('-1');
      expect(document.activeElement).toBe(title);
      expect(escape().defaultPrevented).toBe(true);
      expect(dialog()).toBeNull();
      expect(document.activeElement).toBe(trigger);
    });

    it('ignores Escape while the rule is saved and returns after the global overlay hides', async () => {
      const pending = new Subject<NotificationRuleResponse>();
      await setup({ update: [pending] });
      openRules();
      tick();
      openFromButton();
      submit();
      expect(escape().defaultPrevented).toBe(false);
      expect(dialog()).not.toBeNull();
      const loading = TestBed.inject(LoadingService);
      loading.start();
      vi.advanceTimersByTime(200);
      tick();
      pending.next(RULE);
      pending.complete();
      tick();
      expect(dialog()).toBeNull();
      expect(document.activeElement).not.toBe(editButton());
      loading.finish();
      vi.advanceTimersByTime(400);
      tick();
      expect(document.activeElement).toBe(editButton());
    });

    it('falls back to the rules panel when the editor was opened without a trigger', async () => {
      await setup();
      openRules();
      tick();
      (document.activeElement as HTMLElement | null)?.blur();
      (component as unknown as { openRuleEditor(rule: NotificationRuleResponse): void }).openRuleEditor(RULE);
      tick();
      escape();
      expect(dialog()).toBeNull();
      expect(document.activeElement).toBe(root().querySelector('#notifications-panel-rules'));
    });
  });

  describe('processing failures', () => {
    const FAILURES: NotificationFailureResponse[] = [
      { source: 'EVENT', eventKey: 'evt-1', eventType: 'RMA_BLOCKED', rmaCode: null, recipient: null, error: 'Linha 1\nLinha 2 com detalhe', occurredAt: '2026-10-24T16:00:00Z' },
      { source: 'EMAIL', eventKey: 'evt-2', eventType: 'RMA_CREATED', rmaCode: 'RMA-2026-000007', recipient: 'tec@empresa.com', error: 'SMTP indisponível', occurredAt: '2026-10-24T15:00:00Z' }
    ];
    const section = () => root().querySelector<HTMLElement>('section[aria-labelledby="notification-failures-title"]');
    const failuresColumn = (header: string) => {
      const table = Array.from(root().querySelectorAll('table')).find((item) => Array.from(item.querySelectorAll('thead th')).some((th) => normalize(th.textContent) === 'Origem'))!;
      const index = Array.from(table.querySelectorAll('thead th')).findIndex((th) => normalize(th.textContent) === header);
      return Array.from(table.querySelectorAll('tbody tr')).map((tr) => tr.children[index].textContent!);
    };

    // Vermelho: o erro da lista vira [] e aparece "Nenhuma falha registrada.".
    it('distinguishes a failure-list error from no failures', async () => {
      await setup({ failures: [failure()] });
      openRules();
      expect(text()).toContain('Não foi possível carregar as falhas de processamento.');
      expect(button('Tentar novamente')).toBeDefined();
      expect(text()).not.toContain('Nenhuma falha registrada.');
      expect(cells(rulesTable()!, 'Bloqueio')['Ativa']).toBe('Ativa');
    });

    // Vermelho: durante a carga aparece "Nenhuma falha registrada.".
    it('shows loading instead of no failures', async () => {
      await setup({ failures: [new Subject<NotificationFailureResponse[]>()] });
      openRules();
      expectPending(root());
      expect(text()).not.toContain('Nenhuma falha registrada.');
    });

    it('announces a pending reload after an empty failure result', async () => {
      const pending = new Subject<NotificationFailureResponse[]>();
      await setup({ failures: [of([]), pending] });
      openRules();
      expect(text()).toContain('Nenhuma falha registrada.');
      component.selectTab('inbox');
      render();
      openRules();
      expectPending(root());
      expect(section()!.textContent).not.toContain('Nenhuma falha registrada.');
      pending.next([]);
      pending.complete();
      render();
      expect(section()!.textContent).toContain('Nenhuma falha registrada.');
      expect(section()!.querySelector('.failures-state[role="status"]')).toBeNull();
    });

    it('keeps the failure-list error visible during a pending retry', async () => {
      await setup({ failures: [failure(), new Subject<NotificationFailureResponse[]>()] });
      openRules();
      button('Tentar novamente')!.click();
      render();
      expect(section()!.querySelector('.failures-state[role="alert"]')?.textContent).toContain('Não foi possível carregar as falhas de processamento.');
      expect(button('Tentar novamente')!.disabled).toBe(true);
      expect(section()!.querySelector('.failures-state[role="status"]')).toBeNull();
      expect(section()!.textContent).not.toContain('Nenhuma falha registrada.');
    });

    // Vermelho: não há botão para reler só as falhas.
    it('retries only the failures', async () => {
      await setup({ failures: [failure(), of(FAILURES)] });
      openRules();
      button('Tentar novamente')!.click();
      render();
      expect(service['listFailures']).toHaveBeenCalledTimes(2);
      expect(service['listRules']).toHaveBeenCalledTimes(1);
      expect(failuresColumn('Origem')).toEqual(['Processamento do evento']);
    });

    // Vermelho: a origem é "Evento"/"E-mail" e não há texto do limite.
    it('identifies the origin and the limit', async () => {
      await setup({ failures: [of(FAILURES)] });
      openRules();
      expect(failuresColumn('Origem').map((value) => normalize(value))).toEqual(['Processamento do evento']);
      expect(root().querySelector('.email-failures-section')?.textContent).toContain('SMTP indisponível');
    });

    describe('preservation', () => {
      it('keeps the full error, the server order, placeholders and event labels', async () => {
        await setup({ failures: [of(FAILURES)] });
        openRules();
        expect(failuresColumn('Erro')).toEqual(['Linha 1\nLinha 2 com detalhe']);
        expect(failuresColumn('RMA').map((value) => normalize(value))).toEqual(['—']);
        expect(failuresColumn('Destinatário').map((value) => normalize(value))).toEqual(['—']);
        expect(failuresColumn('Alerta').map((value) => normalize(value))).toEqual(['Bloqueio']);
      });

      it('requests failures only for admins', async () => {
        await setup({ role: 'TECHNICIAN' });
        component.selectTab('rules');
        expect(service['listFailures']).not.toHaveBeenCalled();
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
