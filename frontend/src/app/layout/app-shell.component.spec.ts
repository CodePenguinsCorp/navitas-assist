import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting, TestRequest } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { AuthUserResponse } from '../core/models';
import { AuthService } from '../core/services/auth.service';
import { NotificationService } from '../core/services/notification.service';
import { LegacyProfileCode, profilePermissions } from '../testing/permission-fixtures';
import { AppShellComponent } from './app-shell.component';

const AUTH_USER: AuthUserResponse = {
  username: 'admin', fullName: 'Administrador', profileName: 'Administrador', permissions: ['rma.ver']
};

describe('AppShellComponent logout', () => {
  let fixture: ComponentFixture<AppShellComponent>;
  let http: HttpTestingController;
  let auth: AuthService;
  let router: Router;
  let page: HTMLElement;
  const feedback = 'Não foi possível confirmar o encerramento da sessão. Tente novamente.';

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AppShellComponent],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])]
    }).compileComponents();
    http = TestBed.inject(HttpTestingController);
    auth = TestBed.inject(AuthService);
    auth.restoreSession().subscribe();
    http.expectOne('/api/auth/me').flush(AUTH_USER);
    router = TestBed.inject(Router);
    vi.spyOn(router, 'navigateByUrl').mockResolvedValue(true);
    fixture = TestBed.createComponent(AppShellComponent);
    fixture.detectChanges();
    page = fixture.nativeElement as HTMLElement;
  });

  afterEach(() => http.verify());

  function button(): HTMLButtonElement {
    return page.querySelector<HTMLButtonElement>('.sidebar-user__logout')!;
  }

  function fail(request: TestRequest, kind: 'network' | number): void {
    if (kind === 'network') request.error(new ProgressEvent('error'));
    else request.flush({ message: 'internal upstream detail' }, { status: kind, statusText: 'Request failed' });
    fixture.detectChanges();
  }

  it('sends one attempt before DOM updates, stays pending through both stages and navigates on success', () => {
    button().click();
    button().click();
    fixture.detectChanges();
    const csrfDisabled = button().disabled;
    const pendingLabel = button().textContent;
    const pendingUser = auth.currentUser();
    const csrfRequests = http.match({ method: 'GET', url: '/api/auth/csrf' });
    for (const request of csrfRequests) request.flush(null, { status: 204, statusText: 'No Content' });
    fixture.detectChanges();
    const postDisabled = button().disabled;
    const logoutRequests = http.match({ method: 'POST', url: '/api/auth/logout' });
    for (const request of logoutRequests) request.flush(null, { status: 204, statusText: 'No Content' });
    fixture.detectChanges();

    expect(csrfDisabled).toBe(true);
    expect(postDisabled).toBe(true);
    expect(pendingLabel).toContain('Saindo...');
    expect(pendingUser?.username).toBe('admin');
    expect(csrfRequests).toHaveLength(1);
    expect(logoutRequests).toHaveLength(1);
    expect(auth.currentUser()).toBeNull();
    expect(router.navigateByUrl).toHaveBeenCalledExactlyOnceWith('/login');
    expect(page.querySelector('[role="alert"]')).toBeNull();
  });

  describe.each(['csrf', 'logout'] as const)('%s failure', (stage) => {
    it.each(['network', 401, 403, 500] as const)('shows confirmation failure %s and permits a successful manual retry', (kind) => {
      button().click();
      fixture.detectChanges();
      let request = http.expectOne({ method: 'GET', url: '/api/auth/csrf' });
      if (stage === 'logout') {
        request.flush(null, { status: 204, statusText: 'No Content' });
        request = http.expectOne({ method: 'POST', url: '/api/auth/logout' });
      }
      fail(request, kind);
      http.expectNone('/api/auth/logout');
      expect(page.querySelector('[role="alert"]')?.textContent).toContain(feedback);
      expect(page.textContent).not.toContain('internal upstream detail');
      expect(page.querySelector('.sidebar-user__meta strong')?.textContent).toContain('Administrador');
      expect(auth.isAuthenticated()).toBe(true);
      expect(router.navigateByUrl).not.toHaveBeenCalled();
      expect(button().disabled).toBe(false);

      button().click();
      fixture.detectChanges();
      expect(page.querySelector('[role="alert"]')).toBeNull();
      expect(button().disabled).toBe(true);
      http.expectOne('/api/auth/csrf').flush(null, { status: 204, statusText: 'No Content' });
      http.expectOne({ method: 'POST', url: '/api/auth/logout' }).flush(null, { status: 204, statusText: 'No Content' });
      fixture.detectChanges();
      expect(auth.currentUser()).toBeNull();
      expect(button().disabled).toBe(false);
      expect(router.navigateByUrl).toHaveBeenCalledExactlyOnceWith('/login');
    });
  });
});

describe('AppShellComponent unread summary', () => {
  let fixture: ComponentFixture<AppShellComponent>;
  let http: HttpTestingController;
  let notifications: NotificationService;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AppShellComponent],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])]
    }).compileComponents();
    http = TestBed.inject(HttpTestingController);
    notifications = TestBed.inject(NotificationService);
    fixture = TestBed.createComponent(AppShellComponent);
    fixture.detectChanges();
  });

  afterEach(() => http.verify());

  const bell = () => (fixture.nativeElement as HTMLElement).querySelector<HTMLAnchorElement>('.shell-notifications')!;
  const badge = () => bell().querySelector('.count-badge');
  const refresh = (response: { unread: number } | 'fail') => {
    notifications.refreshSummary().subscribe();
    const request = http.expectOne('/api/notifications/summary');
    if (response === 'fail') request.flush({ message: 'erro' }, { status: 500, statusText: 'Server Error' });
    else request.flush(response);
    fixture.detectChanges();
  };

  // Vermelho: antes da primeira resposta o sino anuncia "0 não lida(s)".
  it('does not announce zero before the first summary response', () => {
    expect(bell().getAttribute('aria-label')).toBe('Notificações');
    expect(badge()).toBeNull();
  });

  // Vermelho: na falha o sino mantém o número antigo e não informa a indisponibilidade.
  it('hides the stale count on failure and restores it with the label on recovery', () => {
    refresh({ unread: 3 });
    expect(bell().getAttribute('aria-label')).toBe('Notificações: 3 não lida(s)');
    expect(badge()?.textContent?.trim()).toBe('3');

    refresh('fail');
    expect(bell().getAttribute('aria-label')).toBe('Notificações: Contagem de não lidas indisponível');
    expect(bell().getAttribute('title')).toBe('Contagem de não lidas indisponível');
    expect(badge()).toBeNull();
    expect(bell().classList.contains('has-unread')).toBe(false);

    refresh({ unread: 5 });
    expect(bell().getAttribute('aria-label')).toBe('Notificações: 5 não lida(s)');
    expect(badge()?.textContent?.trim()).toBe('5');
  });

  it('keeps the last count while a refresh after success is pending', () => {
    refresh({ unread: 2 });
    notifications.refreshSummary().subscribe();
    fixture.detectChanges();
    expect(bell().getAttribute('aria-label')).toBe('Notificações: 2 não lida(s)');
    expect(badge()?.textContent?.trim()).toBe('2');
    http.expectOne('/api/notifications/summary').flush({ unread: 1 });
    fixture.detectChanges();
    expect(bell().getAttribute('aria-label')).toBe('Notificações: 1 não lida(s)');
    expect(badge()?.textContent?.trim()).toBe('1');
  });
});

describe('AppShellComponent menu by permission', () => {
  async function render(user: Partial<AuthUserResponse>): Promise<HTMLElement> {
    await TestBed.configureTestingModule({
      imports: [AppShellComponent],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])]
    }).compileComponents();
    const http = TestBed.inject(HttpTestingController);
    TestBed.inject(AuthService).restoreSession().subscribe();
    http.expectOne('/api/auth/me').flush({ ...AUTH_USER, ...user });
    const fixture = TestBed.createComponent(AppShellComponent);
    fixture.detectChanges();
    http.match('/api/notifications/summary').forEach((request) => request.flush({ unread: 0 }));
    return fixture.nativeElement as HTMLElement;
  }

  function menu(page: HTMLElement): Record<string, string[]> {
    return Object.fromEntries([...page.querySelectorAll('.nav-group')].map((group) => [
      group.getAttribute('aria-label'),
      [...group.querySelectorAll('.nav-item strong')].map((item) => item.textContent?.trim() ?? '')
    ]));
  }

  const operation = ['Dashboard', 'Ordens de serviço', 'Kanban', 'Notificações', 'Peças'];

  it.each([
    ['ADMIN', { 'Operação': operation, Cadastros: ['Clientes', 'Produtos', 'Protocolos', 'Usuários', 'Perfis', 'Auditoria'], 'Relatórios': ['Relatórios'] }],
    ['SERVICE_DESK', { 'Operação': operation, Cadastros: ['Clientes', 'Produtos'] }],
    ['TECHNICIAN', { 'Operação': operation, 'Relatórios': ['Relatórios'] }],
    ['VIEWER', { 'Operação': operation, 'Relatórios': ['Relatórios'] }],
  ] as [LegacyProfileCode, Record<string, string[]>][])('shows the %s menu', async (code, expected) => {
    const page = await render({ permissions: [...profilePermissions(code)] });

    expect(menu(page)).toEqual(expected);
  });

  it('shows only notifications when the profile grants no screen', async () => {
    const page = await render({ permissions: [] });

    expect(menu(page)).toEqual({ 'Operação': ['Notificações'] });
  });

  it('shows the profile name in the sidebar footer', async () => {
    const page = await render({ profileName: 'Suporte N1' });

    expect(page.querySelector('.sidebar-user__meta span')?.textContent?.trim()).toBe('Suporte N1');
  });

  it('keeps the sidebar fixed and only lets the menu list scroll, with its scrollbar hidden', async () => {
    const fsModule = 'node:fs';
    const { readFileSync } = await import(/* @vite-ignore */ fsModule);
    const css: string = readFileSync('src/styles.css', 'utf8');
    const rule = (selector: string): string => {
      const start = css.indexOf(`${String.fromCharCode(10)}${selector} {`);
      return start < 0 ? '' : css.slice(start, css.indexOf('}', start));
    };

    expect(rule('.shell-sidebar')).toMatch(/overflow:\s*hidden/);
    expect(rule('.shell-sidebar')).not.toMatch(/overflow-y:\s*auto/);
    expect(rule('.nav-groups')).toMatch(/overflow-y:\s*auto/);
    expect(rule('.nav-groups')).toMatch(/scrollbar-width:\s*none/);
    expect(css).toMatch(/\.nav-groups::-webkit-scrollbar\s*\{\s*display:\s*none/);
  });

  it('keeps wide content from adding a page-level horizontal scrollbar', async () => {
    const fsModule = 'node:fs';
    const { readFileSync } = await import(/* @vite-ignore */ fsModule);
    const css: string = readFileSync('src/styles.css', 'utf8');
    const rule = (selector: string): string => {
      const start = css.indexOf(`${String.fromCharCode(10)}${selector} {`);
      return start < 0 ? '' : css.slice(start, css.indexOf('}', start));
    };

    expect(rule('.shell')).toMatch(/grid-template-columns:\s*272px minmax\(0, 1fr\)/);
    expect(rule('.shell.is-collapsed')).toMatch(/grid-template-columns:\s*64px minmax\(0, 1fr\)/);
    expect(rule('.shell-main')).toMatch(/grid-column:\s*2/);
    expect(rule('.shell-content')).toMatch(/grid-template-columns:\s*minmax\(0, 1fr\)/);
    expect(rule('.page-surface')).toMatch(/grid-template-columns:\s*minmax\(0, 1fr\)/);
    expect(rule('.table-wrap')).toMatch(/position:\s*relative/);
    expect(rule('.table-wrap')).toMatch(/overflow-x:\s*auto/);
    // Up to 900px the sidebar stays a thin rail beside the content; expanded, it floats over it.
    expect(css).toMatch(/@media \(max-width: 900px\) \{\s*\.shell,\s*\.shell\.is-collapsed \{\s*grid-template-columns:\s*64px minmax\(0, 1fr\);\s*\}\s*\/\*[^*]*\*\/\s*\.shell\.is-expanded \.shell-sidebar \{[^}]*position:\s*fixed[^}]*overflow-x:\s*clip/);
    expect(css).not.toMatch(/\.shell-sidebar \{\s*position:\s*relative;\s*height:\s*auto/);
  });
});

describe('AppShellComponent collapsible sidebar', () => {
  let fixture: ComponentFixture<AppShellComponent>;
  let page: HTMLElement;
  let viewport: { set(narrow: boolean): void };
  const STORAGE_KEY = 'navitas.sidebar';

  function mockViewport(narrow: boolean): { set(narrow: boolean): void } {
    const listeners = new Set<(event: { matches: boolean }) => void>();
    const query = {
      matches: narrow,
      media: '(max-width: 900px)',
      addEventListener: (_: string, listener: (event: { matches: boolean }) => void) => listeners.add(listener),
      removeEventListener: (_: string, listener: (event: { matches: boolean }) => void) => listeners.delete(listener)
    };
    Object.defineProperty(window, 'matchMedia', { configurable: true, writable: true, value: vi.fn(() => query) });
    return {
      set(next: boolean) {
        query.matches = next;
        listeners.forEach((listener) => listener({ matches: next }));
      }
    };
  }

  async function render(narrow: boolean): Promise<void> {
    viewport = mockViewport(narrow);
    await TestBed.configureTestingModule({
      imports: [AppShellComponent],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([{ path: '**', children: [] }])]
    }).compileComponents();
    const http = TestBed.inject(HttpTestingController);
    TestBed.inject(AuthService).restoreSession().subscribe();
    http.expectOne('/api/auth/me').flush(AUTH_USER);
    fixture = TestBed.createComponent(AppShellComponent);
    fixture.detectChanges();
    page = fixture.nativeElement as HTMLElement;
  }

  beforeEach(() => localStorage.clear());
  afterEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
    delete (window as { matchMedia?: unknown }).matchMedia;
  });

  const toggle = () => page.querySelector<HTMLButtonElement>('.sidebar-toggle')!;
  const shell = () => page.querySelector<HTMLElement>('.shell')!;
  const backdrop = () => page.querySelector<HTMLElement>('.shell-backdrop');
  const items = () => [...page.querySelectorAll<HTMLAnchorElement>('.nav-item')];
  const press = (key: string) => {
    document.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));
    fixture.detectChanges();
  };
  const click = (element: HTMLElement) => {
    element.click();
    fixture.detectChanges();
  };

  it('starts expanded on wide screens, with the toggle naming the next action', async () => {
    await render(false);

    expect(shell().classList).toContain('is-expanded');
    expect(toggle().type).toBe('button');
    expect(toggle().getAttribute('aria-expanded')).toBe('true');
    expect(toggle().getAttribute('aria-label')).toBe('Recolher menu');
    expect(toggle().getAttribute('aria-controls')).toBe(page.querySelector('.shell-sidebar')?.id);
    expect(items()[0].getAttribute('title')).toBeNull();
    expect(backdrop()).toBeNull();
  });

  it('starts collapsed up to 900px and names each icon-only item by title and aria-label', async () => {
    localStorage.setItem(STORAGE_KEY, 'expanded');
    await render(true);

    expect(shell().classList).toContain('is-collapsed');
    expect(toggle().getAttribute('aria-expanded')).toBe('false');
    expect(toggle().getAttribute('aria-label')).toBe('Expandir menu');
    const first = items()[0];
    expect(first.getAttribute('title')).toBe('Dashboard');
    expect(first.getAttribute('aria-label')).toBe('Dashboard');
    expect(page.querySelector('.sidebar-user__logout')).not.toBeNull();
    expect(page.querySelector('.brand-lockup__logo')?.getAttribute('src')).toContain('navitas-symbol-white.svg');
  });

  it('collapses and expands on wide screens and remembers the choice', async () => {
    await render(false);

    click(toggle());
    expect(shell().classList).toContain('is-collapsed');
    expect(toggle().getAttribute('aria-label')).toBe('Expandir menu');
    expect(localStorage.getItem(STORAGE_KEY)).toBe('collapsed');
    expect(backdrop()).toBeNull();

    click(toggle());
    expect(shell().classList).toContain('is-expanded');
    expect(localStorage.getItem(STORAGE_KEY)).toBe('expanded');
  });

  it('restores a remembered collapsed menu on wide screens', async () => {
    localStorage.setItem(STORAGE_KEY, 'collapsed');
    await render(false);

    expect(shell().classList).toContain('is-collapsed');
  });

  it('falls back to the width default when storage throws', async () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('blocked'); });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('blocked'); });
    await render(false);

    expect(shell().classList).toContain('is-expanded');
    click(toggle());
    expect(shell().classList).toContain('is-collapsed');
  });

  it('opens over the content on narrow screens and closes with Escape, keeping the focus on the toggle', async () => {
    await render(true);

    click(toggle());
    expect(shell().classList).toContain('is-expanded');
    expect(backdrop()).not.toBeNull();
    expect(toggle().getAttribute('aria-label')).toBe('Recolher menu');
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();

    toggle().focus();
    press('Escape');
    expect(shell().classList).toContain('is-collapsed');
    expect(backdrop()).toBeNull();
    expect(document.activeElement).toBe(toggle());
  });

  it('closes the overlay on a tap outside it', async () => {
    await render(true);

    click(toggle());
    click(backdrop()!);
    expect(shell().classList).toContain('is-collapsed');
  });

  it('closes the overlay when a screen is chosen or the route changes', async () => {
    await render(true);

    click(toggle());
    click(items()[1]);
    expect(shell().classList).toContain('is-collapsed');

    click(toggle());
    await TestBed.inject(Router).navigateByUrl('/clientes');
    fixture.detectChanges();
    expect(shell().classList).toContain('is-collapsed');
  });

  it('ignores Escape on wide screens', async () => {
    await render(false);

    press('Escape');
    expect(shell().classList).toContain('is-expanded');
  });

  it('follows the viewport: collapses when it narrows and restores the wide choice when it widens', async () => {
    await render(false);

    viewport.set(true);
    fixture.detectChanges();
    expect(shell().classList).toContain('is-collapsed');

    viewport.set(false);
    fixture.detectChanges();
    expect(shell().classList).toContain('is-expanded');
  });
});
