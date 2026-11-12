import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectorRef, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { Observable, Subject, of, throwError } from 'rxjs';
import { NotificationFailureResponse, NotificationRuleResponse, UserRole } from '../../core/models';
import { Permission } from '../../core/permissions';
import { profilePermissions, providePermissions } from '../../testing/permission-fixtures';
import { LoadingService } from '../../core/services/loading.service';
import { NotificationService } from '../../core/services/notification.service';
import { expectCancelBeforePrimary } from '../../testing/dialog-actions';
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

  async function setup(sources: { role?: UserRole; permissions?: readonly Permission[]; rules?: Observable<NotificationRuleResponse[]>[]; failures?: Observable<NotificationFailureResponse[]>[]; update?: Observable<NotificationRuleResponse>[] } = {}) {
    const listRules = vi.fn(() => of([RULE]));
    for (const source of sources.rules ?? []) listRules.mockImplementationOnce(() => source);
    const listFailures = vi.fn(() => of([] as NotificationFailureResponse[]));
    for (const source of sources.failures ?? []) listFailures.mockImplementationOnce(() => source);
    const updateRule = vi.fn((eventType: string, payload: object) => of({ ...RULE, ...payload, eventType, updatedAt: '2026-10-24T16:00:00Z', updatedBy: 'root' }));
    for (const source of sources.update ?? []) updateRule.mockImplementationOnce(() => source as never);
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
      listFailures
    } as never;
    await TestBed.configureTestingModule({
      imports: [NotificationsComponent],
      providers: [
        provideRouter([]),
        { provide: NotificationService, useValue: service },
        providePermissions(sources.permissions ?? profilePermissions(sources.role ?? 'ADMIN'))
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
    expect(cells(table, 'Novo RMA')['Destinatários']).toMatch(/^Nenhum destinatário\b/);
    expect(cells(table, 'Novo RMA')['Situação']).toBe('Inativa');
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
    expect(text()).not.toContain('SLA vencido');
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
      openEditor('SLA vencido');
      expect(Array.from(dialog()!.querySelectorAll('fieldset legend')).map((legend) => normalize(legend.textContent))).toEqual(['Entrega', 'Destinatários', 'E-mail e silenciamento']);
      expect(normalize(field('Atendimento').closest('fieldset')!.querySelector('legend')!.textContent)).toBe('Destinatários');
      expect(dialog()!.textContent).toContain('Vale para os próximos eventos.');
      expectCancelBeforePrimary(dialog()!);
      toggleField('Atendimento');
      submit();
      expect(service['updateRule']).toHaveBeenCalledTimes(1);
      expect(service['updateRule']).toHaveBeenCalledWith('SLA_OVERDUE', {
        enabled: true, severity: 'CRITICAL', recipientRoles: ['ADMIN', 'SERVICE_DESK'], notifyAssignee: true, emailEnabled: false, userMutable: false
      });
      expect(dialog()).toBeNull();
      expect(cells(rulesTable()!, 'SLA vencido')).toMatchObject({
        'Destinatários': 'Administrador, Atendimento + responsável pelo RMA',
        'Atualização': '24/10/2026, 13:00 por root'
      });
      expect(text()).toContain('Regra "SLA vencido" atualizada.');
    });

    // Vermelho: o resumo e o editor não explicam que a regra sem destinatários não entrega a ninguém.
    it('warns only when a rule has no recipients, in the summary and in the editor, and still saves', async () => {
      const warning = 'Esta regra não entrega notificações a ninguém.';
      const assigneeOnly: NotificationRuleResponse = { ...RULE, eventType: 'RMA_ASSIGNED', recipientRoles: [], notifyAssignee: true };
      await setup({ rules: [of([RULE, SILENT_RULE, assigneeOnly])] });
      openRules();
      const table = rulesTable()!;
      expect(cells(table, 'Novo RMA')['Destinatários']).toContain('Nenhum destinatário');
      expect(cells(table, 'Novo RMA')['Destinatários']).toContain(warning);
      expect(cells(table, 'Novo RMA')['Situação']).toBe('Inativa');
      expect(cells(table, 'SLA vencido')['Destinatários']).not.toContain(warning);
      expect(cells(table, 'Nova atribuição')['Destinatários']).toBe('Responsável pelo RMA');

      openEditor('SLA vencido');
      expect(dialog()!.textContent).not.toContain(warning);
      toggleField('Administrador');
      expect(dialog()!.textContent).not.toContain(warning);
      toggleField('Notificar o responsável');
      expect(dialog()!.textContent).toContain(warning);
      submit();
      expect(service['updateRule']).toHaveBeenLastCalledWith('SLA_OVERDUE', {
        enabled: true, severity: 'CRITICAL', recipientRoles: [], notifyAssignee: false, emailEnabled: false, userMutable: false
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
      openEditor('SLA vencido');
      submit();
      expect(service['updateRule']).toHaveBeenLastCalledWith('SLA_OVERDUE', {
        enabled: true, severity: 'CRITICAL', recipientRoles: ['ADMIN'], notifyAssignee: true, emailEnabled: false, userMutable: false
      });
      openEditor('Novo RMA');
      submit();
      expect(service['updateRule']).toHaveBeenLastCalledWith('RMA_CREATED', {
        enabled: false, severity: 'INFO', recipientRoles: [], notifyAssignee: false, emailEnabled: false, userMutable: false
      });
    });

    // Vermelho: sem formulário não há valores para conferir entre regras.
    it('does not carry values between consecutive rules', async () => {
      await setup({ rules: [of([RULE, SILENT_RULE])] });
      openRules();
      openEditor('SLA vencido');
      toggleField('Técnico');
      expect(field('Técnico').checked).toBe(true);
      dialogButton('Cancelar').click();
      render();
      openEditor('Novo RMA');
      expect(field('Técnico').checked).toBe(false);
      expect(field('Administrador').checked).toBe(false);
      expect(field('Ativa').checked).toBe(false);
      expect(field('Notificar o responsável pelo RMA').checked).toBe(false);
      expect(field('Enviar também por e-mail').checked).toBe(false);
      expect(field('Permitir que cada usuário silencie').checked).toBe(false);
    });

    it('keeps the current rule and its values when another editor is requested during a save', async () => {
      const pending = new Subject<NotificationRuleResponse>();
      await setup({ rules: [of([RULE, SILENT_RULE])], update: [pending] });
      openRules();
      openEditor('SLA vencido');
      toggleField('Técnico');
      submit();

      (component as unknown as { openRuleEditor(rule: NotificationRuleResponse): void }).openRuleEditor(SILENT_RULE);
      render();
      expect(dialog()!.querySelector('h3')!.textContent).toContain('SLA vencido');
      expect(field('Técnico').checked).toBe(true);
      expect(field('Ativa').checked).toBe(true);

      pending.next({ ...RULE, recipientRoles: ['ADMIN', 'TECHNICIAN'] });
      pending.complete();
      render();
      expect(dialog()).toBeNull();
      expect(cells(rulesTable()!, 'SLA vencido')['Destinatários']).toBe('Administrador, Técnico + responsável pelo RMA');
      expect(cells(rulesTable()!, 'Novo RMA')['Situação']).toBe('Inativa');
    });

    it('disables every rule edit button while a save is pending', async () => {
      const pending = new Subject<NotificationRuleResponse>();
      await setup({ rules: [of([RULE, SILENT_RULE])], update: [pending] });
      openRules();
      openEditor('SLA vencido');
      submit();
      const editButtons = Array.from(rulesTable()!.querySelectorAll<HTMLButtonElement>('button'));
      expect(editButtons).toHaveLength(2);
      expect(editButtons.every((button) => button.disabled)).toBe(true);
      editButtons[1].click();
      render();
      expect(dialog()!.querySelector('h3')!.textContent).toContain('SLA vencido');
    });

    // Vermelho: sem formulário não há Cancelar nem gravação pendente.
    it('does not save on cancel and keeps the form while saving', async () => {
      const pending = new Subject<NotificationRuleResponse>();
      await setup({ update: [pending] });
      openRules();
      openEditor('SLA vencido');
      toggleField('Atendimento');
      dialogButton('Cancelar').click();
      render();
      expect(service['updateRule']).not.toHaveBeenCalled();
      expect(cells(rulesTable()!, 'SLA vencido')['Destinatários']).toBe('Administrador + responsável pelo RMA');

      openEditor('SLA vencido');
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
        openEditor('SLA vencido');
        formHarness().ruleForm.controls.severity.setValue('WARNING');
        toggleField('Ativa');
        submit();
        expect(service['updateRule']).toHaveBeenCalledWith('SLA_OVERDUE', expect.objectContaining({ severity: 'WARNING', enabled: false }));
      });

      it('explains the e-mail restriction next to its checkbox', async () => {
        await setup();
        openRules();
        openEditor('SLA vencido');
        expect(field('Enviar também por e-mail').closest('.field-group, fieldset')!.textContent).toContain('Somente endereços do domínio corporativo configurado.');
      });
    });
  });

  describe('rule form focus', () => {
    beforeEach(() => vi.useFakeTimers());
    afterEach(() => vi.useRealTimers());

    const dialog = () => root().querySelector<HTMLElement>('[role="dialog"]');
    const tick = () => { render(); TestBed.tick(); };
    const editButton = () => root().querySelector<HTMLButtonElement>('button[aria-label="Editar regra SLA vencido"]')!;
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
      { source: 'EVENT', eventKey: 'evt-1', eventType: 'SLA_OVERDUE', rmaCode: null, recipient: null, error: 'Linha 1\nLinha 2 com detalhe', occurredAt: '2026-10-24T16:00:00Z' },
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
      expect(cells(rulesTable()!, 'SLA vencido')['Situação']).toBe('Ativa');
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
      expect(failuresColumn('Origem')).toEqual(['Processamento do evento', 'Envio de e-mail']);
    });

    // Vermelho: a origem é "Evento"/"E-mail" e não há texto do limite.
    it('identifies the origin and the limit', async () => {
      await setup({ failures: [of(FAILURES)] });
      openRules();
      expect(failuresColumn('Origem').map((value) => normalize(value))).toEqual(['Processamento do evento', 'Envio de e-mail']);
      expect(normalize(section()!.textContent)).toContain('Até 50 falhas de eventos e até 50 falhas de envio de e-mail, da mais recente para a mais antiga.');
    });

    describe('preservation', () => {
      it('keeps the full error, the server order, placeholders and event labels', async () => {
        await setup({ failures: [of(FAILURES)] });
        openRules();
        expect(failuresColumn('Erro')).toEqual(['Linha 1\nLinha 2 com detalhe', 'SMTP indisponível']);
        expect(failuresColumn('RMA').map((value) => normalize(value))).toEqual(['—', 'RMA-2026-000007']);
        expect(failuresColumn('Destinatário').map((value) => normalize(value))).toEqual(['—', 'tec@empresa.com']);
        expect(failuresColumn('Alerta').map((value) => normalize(value))).toEqual(['SLA vencido', 'Novo RMA']);
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
