import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectorRef, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { Observable, Subject, of, throwError } from 'rxjs';
import { NotificationPreferenceResponse } from '../../core/models';
import { LegacyProfileCode, profilePermissions, providePermissions } from '../../testing/permission-fixtures';
import { NotificationService } from '../../core/services/notification.service';
import { ProfileService } from '../../core/services/profile.service';
import { NotificationsComponent } from './notifications.component';

const PREFERENCES: NotificationPreferenceResponse[] = [
  { eventType: 'RMA_CREATED', severity: 'INFO', enabled: true, userMutable: true, muted: false },
  { eventType: 'RMA_ASSIGNED', severity: 'INFO', enabled: true, userMutable: true, muted: true },
  { eventType: 'SLA_WARNING', severity: 'WARNING', enabled: false, userMutable: true, muted: false },
  { eventType: 'SLA_OVERDUE', severity: 'CRITICAL', enabled: true, userMutable: false, muted: true },
  { eventType: 'RMA_BLOCKED', severity: 'WARNING', enabled: true, userMutable: false, muted: false }
];

const failure = () => throwError(() => new HttpErrorResponse({ status: 500 }));

interface Harness {
  selectTab(tab: 'inbox' | 'preferences' | 'rules'): void;
  toggleMute(preference: NotificationPreferenceResponse): void;
}

describe('NotificationsComponent preferences', () => {
  let fixture: ComponentFixture<NotificationsComponent>;
  let component: Harness;
  let service: Record<string, ReturnType<typeof vi.fn>> & { unreadCount: ReturnType<typeof signal<number>>; summaryLoaded: ReturnType<typeof signal<boolean>>; summaryLoadFailed: ReturnType<typeof signal<boolean>> };

  const root = (): HTMLElement => fixture.nativeElement.querySelector('.page-surface');
  const text = () => root().textContent!.replace(/[\s ]+/g, ' ').trim();
  const render = () => { fixture.componentRef.injector.get(ChangeDetectorRef).markForCheck(); fixture.detectChanges(); };
  const button = (label: string) => Array.from(root().querySelectorAll('button')).find((item) => item.textContent?.trim() === label);
  const column = (header: string) => {
    const table = root().querySelector('table')!;
    const index = Array.from(table.querySelectorAll('thead th')).findIndex((th) => th.textContent!.trim() === header);
    return Array.from(table.querySelectorAll('tbody tr')).map((row) => row.children[index].textContent!.replace(/[\s ]+/g, ' ').trim());
  };
  const openPreferences = () => { component.selectTab('preferences'); render(); };

  async function setup(sources: { role?: LegacyProfileCode; preferences?: Observable<NotificationPreferenceResponse[]>[]; update?: Observable<NotificationPreferenceResponse> } = {}) {
    const listPreferences = vi.fn(() => of(PREFERENCES));
    for (const source of sources.preferences ?? []) listPreferences.mockImplementationOnce(() => source);
    service = {
      unreadCount: signal(0),
      summaryLoaded: signal(true),
      summaryLoadFailed: signal(false),
      list: vi.fn(() => of([])),
      refreshSummary: vi.fn(() => of(0)),
      markRead: vi.fn(),
      markAllRead: vi.fn(),
      snooze: vi.fn(),
      listPreferences,
      updatePreference: vi.fn(() => sources.update ?? of({ ...PREFERENCES[0], muted: true })),
      listRules: vi.fn(() => of([])),
      updateRule: vi.fn(),
      listFailures: vi.fn(() => of([]))
    } as never;
    await TestBed.configureTestingModule({
      imports: [NotificationsComponent],
      providers: [
        provideRouter([]),
        { provide: NotificationService, useValue: service },
        { provide: ProfileService, useValue: { options: () => of([]), invalidateOptions: () => undefined } },
        providePermissions(profilePermissions(sources.role ?? 'TECHNICIAN'))
      ]
    }).compileComponents();
    fixture = TestBed.createComponent(NotificationsComponent);
    component = fixture.componentInstance as unknown as Harness;
    render();
  }

  // Vermelho: a quarta linha mostra "Silenciado", a quinta "Recebendo" e a terceira "Regra desativada".
  it('labels each preference with one of four states', async () => {
    await setup();
    openPreferences();
    expect(column('Situação')).toEqual(['Recebendo', 'Silenciado', 'Desativado pela administração', 'Obrigatório', 'Obrigatório']);
  });

  // Vermelho: o nome acessível do botão é só "Silenciar".
  it('names the preference action with its alert', async () => {
    await setup();
    openPreferences();
    const rows = Array.from(root().querySelectorAll('tbody tr'));
    expect(rows[0].querySelector('button')!.getAttribute('aria-label')).toBe('Silenciar Novo RMA');
    expect(rows[1].querySelector('button')!.getAttribute('aria-label')).toBe('Reativar Nova atribuição');
    // Preservação: linhas obrigatórias não têm botão.
    expect(rows[3].querySelector('button')).toBeNull();
    expect(rows[4].querySelector('button')).toBeNull();
  });

  // Vermelho: não há mensagem de status depois de silenciar.
  it('confirms the change in a status message', async () => {
    await setup();
    openPreferences();
    component.toggleMute(PREFERENCES[0]);
    render();
    expect(root().querySelector('[role="status"].alert-banner')?.textContent).toContain('Novo RMA silenciado.');
  });

  // Vermelho: a tabela aparece durante a carga e mantém as linhas antigas depois da falha.
  it('does not show an empty table while loading or after failure', async () => {
    await setup({ preferences: [new Subject<NotificationPreferenceResponse[]>()] });
    openPreferences();
    expectPending(root());
    expect(root().querySelector('table')).toBeNull();

    TestBed.resetTestingModule();
    await setup({ preferences: [failure()] });
    openPreferences();
    expect(text()).toContain('Não foi possível carregar as preferências.');
    expect(button('Tentar novamente')).toBeDefined();
    expect(root().querySelector('table')).toBeNull();

    TestBed.resetTestingModule();
    await setup({ preferences: [of(PREFERENCES), failure()] });
    openPreferences();
    expect(text()).toContain('Novo RMA');
    component.selectTab('inbox');
    render();
    openPreferences();
    expect(text()).not.toContain('Novo RMA');
    expect(text()).toContain('Não foi possível carregar as preferências.');
    button('Tentar novamente')!.click();
    render();
    expect(service['listPreferences']).toHaveBeenCalledTimes(3);
    expect(text()).toContain('Novo RMA');
  });

  // Vermelho: com lista vazia aparece a tabela com cabeçalho e corpo vazio.
  it('shows an empty preference list', async () => {
    await setup({ preferences: [of([])] });
    openPreferences();
    expect(text()).toContain('Nenhuma preferência disponível.');
    expect(root().querySelector('table')).toBeNull();
  });

  it('announces a pending reload after an empty preference result', async () => {
    const pending = new Subject<NotificationPreferenceResponse[]>();
    await setup({ preferences: [of([]), pending] });
    openPreferences();
    expect(text()).toContain('Nenhuma preferência disponível.');
    component.selectTab('inbox');
    render();
    openPreferences();
    expectPending(root());
    expect(text()).not.toContain('Nenhuma preferência disponível.');
    pending.next([]);
    pending.complete();
    render();
    expect(text()).toContain('Nenhuma preferência disponível.');
    expect(root().querySelector('.preferences-state[role="status"]')).toBeNull();
  });

  it('hides previous preferences during a pending reload', async () => {
    await setup({ preferences: [of(PREFERENCES), new Subject<NotificationPreferenceResponse[]>()] });
    openPreferences(); component.selectTab('inbox'); render(); openPreferences();
    expectPending(root());
    expect(root().querySelector('table')).toBeNull();
    expect(text()).not.toContain('Novo RMA');
  });

  it('keeps the preference failure visible during a pending retry', async () => {
    await setup({ preferences: [failure(), new Subject<NotificationPreferenceResponse[]>()] });
    openPreferences();
    button('Tentar novamente')!.click();
    render();
    expect(root().querySelector('.preferences-state[role="alert"]')?.textContent).toContain('Não foi possível carregar as preferências.');
    expect(button('Tentar novamente')!.disabled).toBe(true);
    expect(root().querySelector('.preferences-state[role="status"]')).toBeNull();
    expect(text()).not.toContain('Nenhuma preferência disponível.');
  });

  describe('preservation', () => {
    it('keeps the mute action for a disabled preference that users may mute', async () => {
      await setup();
      openPreferences();
      expect(Array.from(root().querySelectorAll('tbody tr'))[2].querySelector('button')!.textContent!.trim()).toBe('Silenciar');
      expect(text()).toContain('Silencie os alertas que a regra permite. Alertas obrigatórios continuam chegando.');
    });

    it('keeps the row and shows the alert when the update fails', async () => {
      await setup({ update: failure() as never });
      openPreferences();
      component.toggleMute(PREFERENCES[0]);
      render();
      expect(column('Situação')[0]).toBe('Recebendo');
      expect(root().querySelector('[role="alert"]')?.textContent).toContain('Não foi possível concluir a ação agora.');
    });

    it('lets viewers mute their own preferences', async () => {
      await setup({ role: 'VIEWER' });
      openPreferences();
      Array.from(root().querySelectorAll('tbody tr'))[0].querySelector('button')!.click();
      expect(service['updatePreference']).toHaveBeenCalledWith('RMA_CREATED', true);
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
