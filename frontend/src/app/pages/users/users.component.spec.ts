import { HttpErrorResponse } from '@angular/common/http';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Observable, Subject, of, throwError } from 'rxjs';
import { PageResponse, UserAccountResponse } from '../../core/models';
import { ProfileService } from '../../core/services/profile.service';
import { PERMISSION_CATALOG } from '../../testing/profile-fixtures';

const PROFILE_SERVICE = { provide: ProfileService, useValue: {
  options: () => of([{ id: 1, name: 'Administrador', permissions: [] }, { id: 3, name: 'Técnico', permissions: [] }]),
  permissionCatalog: () => of(PERMISSION_CATALOG),
  invalidateOptions: () => undefined
} };
import { AuthService } from '../../core/services/auth.service';
import { CatalogService, UserFilters } from '../../core/services/catalog.service';
import { LoadingService } from '../../core/services/loading.service';
import { provideRouter } from '@angular/router';
import { By } from '@angular/platform-browser';
import { App } from '../../app';
import { mountUnderRoot, simulateNativeModality } from '../../testing/native-dialog';
import { UsersComponent } from './users.component';

function user(id: number, fullName: string): UserAccountResponse {
  return {
    id, username: `user${id}`, fullName, profile: { id: 3, name: 'Técnico' }, extraPermissions: [], active: true,
    createdAt: '2026-10-20T12:00:00Z', updatedAt: '2026-10-20T12:00:00Z'
  };
}

function page(content: UserAccountResponse[], pageNumber = 0, size = 20, totalElements = content.length): PageResponse<UserAccountResponse> {
  return { content, page: pageNumber, size, totalElements, totalPages: Math.ceil(totalElements / size) };
}

describe('UsersComponent pagination', () => {
  let component: UsersHarness;
  let fixture: ComponentFixture<UsersComponent>;
  let listUsers: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    vi.useFakeTimers();
    listUsers = vi.fn((filters: UserFilters) => of(page([user(1, 'Ana'), user(2, 'Bia')], filters.page, filters.size, 45)));

    await TestBed.configureTestingModule({
      imports: [UsersComponent],
      providers: [
        PROFILE_SERVICE,
        { provide: AuthService, useValue: { currentUser: () => ({ username: 'admin' }), refreshSession: () => of(null) } },
        { provide: CatalogService, useValue: {
          listUsers,
          getUserSummary: () => of({ total: 45, active: 40, admins: 3, roles: 4 }),
          deleteUser: () => of(undefined)
        } }
      ]
    }).compileComponents();

    fixture = TestBed.createComponent(UsersComponent);
    component = fixture.componentInstance as unknown as UsersHarness;
    fixture.detectChanges();
  });

  afterEach(() => vi.useRealTimers());

  it('loads the first page with total and summary', () => {
    expect(listUsers).toHaveBeenLastCalledWith({ page: 0, size: 20, query: '', profileId: undefined, active: undefined });
    expect(fixture.nativeElement.querySelector('.pagination__summary')?.textContent?.trim()).toBe('1–2 de 45 usuários');
    expect(fixture.nativeElement.textContent).not.toContain('registro(s)');
    expect(fixture.nativeElement.textContent).toContain('Página 1 de 3');
  });

  it('combines role and status filters with navigation', () => {
    component.updateProfileFilter(3);
    component.updateStatusFilter('inactive');
    expect(listUsers).toHaveBeenLastCalledWith({ page: 0, size: 20, query: '', profileId: 3, active: false });

    component.goToPage(2);
    expect(listUsers).toHaveBeenLastCalledWith({ page: 2, size: 20, query: '', profileId: 3, active: false });

    component.updateStatusFilter('active');
    expect(listUsers).toHaveBeenLastCalledWith({ page: 0, size: 20, query: '', profileId: 3, active: true });
  });

  it('debounces the text search and honors the page size', () => {
    listUsers.mockClear();
    component.updateSearch('an');
    component.updateSearch('ana');
    vi.advanceTimersByTime(300);
    expect(listUsers).toHaveBeenCalledTimes(1);
    expect(listUsers).toHaveBeenLastCalledWith({ page: 0, size: 20, query: 'ana', profileId: undefined, active: undefined });

    component.changePageSize(100);
    expect(listUsers).toHaveBeenLastCalledWith({ page: 0, size: 100, query: 'ana', profileId: undefined, active: undefined });
  });
});

describe('UsersComponent collection layout and states', () => {
  let fixture: ComponentFixture<UsersComponent>;
  let component: UsersHarness;
  let element: HTMLElement;
  let listUsers: ReturnType<typeof vi.fn>;
  let deleteUser: ReturnType<typeof vi.fn>;

  const ownAccount: UserAccountResponse = { ...user(1, 'Administrador'), username: 'Admin', profile: { id: 1, name: 'Administrador' } };
  const ana: UserAccountResponse = { ...user(2, 'Ana Souza'), username: 'ana' };
  const loadError = () => throwError(() => new HttpErrorResponse({ status: 503, error: { message: 'Serviço indisponível.' } }));

  async function mount(options: {
    list?: (filters: UserFilters) => Observable<PageResponse<UserAccountResponse>>;
    summary?: () => Observable<unknown>;
  } = {}): Promise<void> {
    vi.useFakeTimers();
    listUsers = vi.fn(options.list ?? ((filters: UserFilters) => of(page([ownAccount, ana], filters.page, filters.size, 45))));
    deleteUser = vi.fn(() => of(undefined));

    await TestBed.configureTestingModule({
      imports: [UsersComponent],
      providers: [
        PROFILE_SERVICE,
        { provide: AuthService, useValue: { currentUser: () => ({ username: 'admin' }), refreshSession: () => of(null) } },
        { provide: CatalogService, useValue: {
          listUsers,
          getUserSummary: options.summary ?? (() => of({ total: 45, active: 40, admins: 3, roles: 4 })),
          deleteUser,
          createUser: () => of(user(9, 'Novo')),
          updateUser: () => of(ana)
        } }
      ]
    }).compileComponents();

    fixture = TestBed.createComponent(UsersComponent);
    component = fixture.componentInstance as unknown as UsersHarness;
    element = fixture.nativeElement as HTMLElement;
    fixture.detectChanges();
  }

  afterEach(() => vi.useRealTimers());

  /** The pagination is the only total of the list. */
  const count = () => element.querySelector('.pagination__summary')?.textContent?.replace(/\s+/g, ' ').trim() ?? null;
  const loadAlert = () => element.querySelector('.table-card [role="alert"]');
  const buttonByText = (text: string) => Array.from(element.querySelectorAll<HTMLButtonElement>('button'))
    .find((button) => button.textContent?.trim() === text);
  const rowActions = (index: number) =>
    Array.from(element.querySelectorAll('tbody tr')[index].querySelectorAll<HTMLButtonElement>('.row-actions button'));

  function expectFailureState(): void {
    expect(loadAlert()?.textContent).toContain('Não foi possível carregar os usuários.');
    expect(buttonByText('Tentar novamente')).toBeDefined();
    expect(element.textContent).not.toContain('Nenhum usuário cadastrado');
    expect(element.querySelector('tbody')).toBeNull();
    expect(element.querySelector('app-pagination')).toBeNull();
    expect(count()).toBeNull();
  }

  it('shows a single total, in the pagination, and removes statistics cards', async () => {
    await mount();
    expect(element.querySelector('app-result-count')).toBeNull();
    expect(element.querySelectorAll('.pagination__summary').length).toBe(1);
    expect(count()).toBe('1–2 de 45 usuários');
    expect(element.querySelector('.stat-card')).toBeNull();
    expect(element.querySelector('.stats-grid')).toBeNull();
    expect(element.querySelector('.search-field')?.textContent).not.toContain('registro(s)');
  });

  it('shows the filtered total in the pagination, with or without the summary', async () => {
    await mount({ list: (filters) => of(page([ana], filters.page, filters.size, filters.profileId ? 3 : 45)) });
    component.updateProfileFilter(1);
    fixture.detectChanges();
    expect(count()).toBe('1–1 de 3 usuários');
    expect(element.querySelector('app-result-count')).toBeNull();

    TestBed.resetTestingModule();
    await mount({ list: (filters) => of(page([ana], filters.page, filters.size, filters.profileId ? 3 : 45)), summary: loadError });
    component.updateProfileFilter(1);
    fixture.detectChanges();
    expect(count()).toBe('1–1 de 3 usuários');
  });

  it('uses the singular for one user and shows no total for an empty result', async () => {
    await mount({ list: (filters) => of(filters.profileId ? page([], filters.page, filters.size, 0) : page([ana], filters.page, filters.size, 1)) });
    expect(count()).toBe('1–1 de 1 usuário');

    component.updateProfileFilter(1);
    fixture.detectChanges();
    expect(element.textContent).toContain('Nenhum usuário encontrado');
    expect(element.querySelector('app-result-count, app-pagination')).toBeNull();
  });

  it('keeps the own-account delete focusable with its reason, and the click guard never opens the dialog', async () => {
    await mount();
    const remove = rowActions(0)[1];
    const tip = remove.querySelector<HTMLElement>('[role="tooltip"]')!;

    expect(remove.getAttribute('aria-label')).toBe('Excluir Administrador');
    expect(remove.getAttribute('aria-disabled')).toBe('true');
    expect(remove.disabled).toBe(false);
    expect(remove.hasAttribute('title')).toBe(false);
    expect(remove.getAttribute('aria-describedby')).toBe(tip.id);
    expect(tip.textContent?.trim()).toBe('Você não pode excluir a própria conta.');

    // Enter/Space on a native button activate it as a click; only the business guard on click is exercised here.
    remove.click();
    fixture.detectChanges();

    expect(element.querySelector('[role="alertdialog"]')).toBeNull();
    expect(deleteUser).not.toHaveBeenCalled();
  });

  it("keeps a tooltip and an accessible name on other users' delete", async () => {
    await mount();
    const [edit, remove] = rowActions(1);

    expect(element.querySelector('thead')?.textContent).toContain('Ações');
    expect(edit.getAttribute('aria-label')).toBe('Editar Ana Souza');
    expect(remove.getAttribute('aria-label')).toBe('Excluir Ana Souza');
    expect(remove.querySelector('[role="tooltip"]')?.textContent?.trim()).toBe('Excluir');
    expect(remove.hasAttribute('aria-disabled')).toBe(false);
    expect(remove.hasAttribute('title')).toBe(false);
    expect(edit.hasAttribute('title')).toBe(false);

    remove.click();
    fixture.detectChanges();
    expect(element.querySelector('[role="alertdialog"]')?.textContent).toContain('Ana Souza');
  });

  it('disables every delete while a deletion is pending', async () => {
    await mount();
    deleteUser.mockImplementation(() => new Subject<void>());
    component.openDeleteModal(ana);
    component.confirmDeleteUser();
    fixture.detectChanges();

    expect(rowActions(0)[1].disabled).toBe(true);
    expect(rowActions(1)[1].disabled).toBe(true);
    expect(rowActions(1)[0].disabled).toBe(true);
    expect(rowActions(1)[1].getAttribute('aria-label')).toBe('Excluindo... Ana Souza');
  });

  it('groups the form into Identidade, Acesso, Permissões extras and Senha', async () => {
    await mount();
    component.openCreateModal();
    fixture.detectChanges();

    const dialog = element.querySelector<HTMLElement>('[role="dialog"]')!;
    expect(dialog.getAttribute('aria-modal')).toBe('true');
    expect(element.querySelector(`#${dialog.getAttribute('aria-labelledby')}`)?.textContent?.trim()).toBe('Novo usuário');
    const sections = Array.from(dialog.querySelectorAll('fieldset.form-section'));
    expect(sections.map((section) => section.querySelector('legend')?.textContent?.trim())).toEqual(['Identidade', 'Acesso', 'Permissões extras', 'Senha']);
    const controlsIn = (section: Element) => Array.from(section.querySelectorAll('[formControlName]')).map((node) => node.getAttribute('formControlName'));
    expect(controlsIn(sections[0])).toEqual(['fullName', 'username', 'email']);
    expect(controlsIn(sections[1])).toEqual(['profileId', 'active']);
    expect(controlsIn(sections[2])).toEqual([]);
    expect(controlsIn(sections[3])).toEqual(['password']);
    expect(dialog.textContent).not.toContain('Deixe em branco para manter a senha atual.');
  });

  // Spec §5: o diálogo passa a ter a seção "Permissões extras"; fora dela não se fala em permissões.
  it('mentions permissions only in the extras section', async () => {
    await mount();
    component.openCreateModal();
    fixture.detectChanges();
    const outsideExtras = (root: Element) => Array.from(root.querySelectorAll('fieldset.form-section:not(.extra-permissions)'))
      .map((section) => section.textContent?.toLowerCase() ?? '').join(' ');
    expect(outsideExtras(element.querySelector('[role="dialog"]')!)).not.toContain('permiss');

    component.closeModal();
    component.openEditModal(ana);
    fixture.detectChanges();
    const dialog = element.querySelector('[role="dialog"]')!;
    expect(outsideExtras(dialog)).not.toContain('permiss');
    expect(dialog.textContent).toContain('Deixe em branco para manter a senha atual.');
  });

  it('renders an empty busy container until the first empty response', async () => {
    const pending = new Subject<PageResponse<UserAccountResponse>>();
    await mount({ list: () => pending });
    expectPending(element);
    expect(element.querySelector('tbody, .table-card .empty-state')).toBeNull();
    expect(element.textContent).not.toContain('Nenhum usuário');
    pending.next(page([], 0, 20, 0)); pending.complete(); fixture.detectChanges();
    expect(element.querySelector('[aria-busy="true"]')).toBeNull();
    expect(element.textContent).toContain('Nenhum usuário');
  });

  it.each([false, true])('hides old rows and empty state during a filter load (empty=%s)', async (empty) => {
    await mount(empty ? { list: (filters) => of(page([], filters.page, filters.size, 0)) } : {});
    const pending = new Subject<PageResponse<UserAccountResponse>>();
    listUsers.mockImplementation(() => pending);
    component.updateProfileFilter(3); fixture.detectChanges();
    expectPending(element);
    expect(element.querySelector('tbody, .table-card .empty-state')).toBeNull();
    expect(element.textContent).not.toContain('Nenhum usuário');
  });

  it('shows the failure state on an initial load error', async () => {
    await mount({ list: loadError });
    expectFailureState();
  });

  it('shows the failure state when a reload fails after an empty success', async () => {
    await mount({ list: (filters) => of(page([], filters.page, filters.size, 0)) });
    expect(element.textContent).toContain('Nenhum usuário cadastrado');
    listUsers.mockImplementation(loadError);
    component.goToPage(1);
    fixture.detectChanges();
    expectFailureState();
  });

  it('shows the failure state when a reload fails after a success with records', async () => {
    await mount();
    listUsers.mockImplementation(loadError);
    component.goToPage(1);
    fixture.detectChanges();
    expectFailureState();
  });

  it('recovers with Tentar novamente using the same filters and page', async () => {
    await mount({ list: (filters) => of(page([ana], filters.page, filters.size, filters.active === false ? 30 : 45)) });
    const working = listUsers.getMockImplementation()!;
    component.updateStatusFilter('inactive');
    listUsers.mockImplementation(loadError);
    component.goToPage(1);
    fixture.detectChanges();
    expectFailureState();

    listUsers.mockImplementation(working);
    buttonByText('Tentar novamente')!.click();
    fixture.detectChanges();

    expect(listUsers).toHaveBeenLastCalledWith({ page: 1, size: 20, query: '', profileId: undefined, active: false });
    expect(loadAlert()).toBeNull();
    expect(element.querySelector('tbody')?.textContent).toContain('Ana Souza');
    expect(count()).toBe('21–21 de 30 usuários');
  });

  it('shows a disabled loading retry without the old table or count while the retry is pending, then recovers', async () => {
    await mount();
    expect(count()).toBe('1–2 de 45 usuários');
    listUsers.mockImplementation(loadError);
    component.goToPage(1);
    fixture.detectChanges();
    expectFailureState();

    const pending = new Subject<PageResponse<UserAccountResponse>>();
    listUsers.mockImplementation(() => pending);
    buttonByText('Tentar novamente')!.click();
    fixture.detectChanges();

    const retry = loadAlert()!.querySelector<HTMLButtonElement>('button')!;
    expect(retry.disabled).toBe(true);
    expect(retry.textContent?.trim()).toBe('Tentar novamente');
    expect(element.querySelector('[aria-busy="true"]')).not.toBeNull();
    expect(buttonByText('Tentar novamente')?.disabled).toBe(true);
    expect(element.querySelector('tbody')).toBeNull();
    expect(element.querySelector('app-pagination')).toBeNull();
    expect(count()).toBeNull();

    pending.next(page([{ ...user(3, 'Gabriel Lima'), username: 'gabriel' }], 1, 20, 45));
    pending.complete();
    fixture.detectChanges();

    expect(loadAlert()).toBeNull();
    expect(element.querySelector('tbody')?.textContent).toContain('Gabriel Lima');
    expect(count()).toBe('21–21 de 45 usuários');
  });

  it('keeps the failure state after opening and closing the form', async () => {
    await mount({ list: loadError });
    component.openCreateModal();
    fixture.detectChanges();
    component.closeModal();
    fixture.detectChanges();
    expectFailureState();
  });

  it('clears search and every filter from a later page with exactly one request, keeping the page size', async () => {
    await mount({ list: (filters) => of(filters.profileId || filters.query || filters.active !== undefined
      ? page([], filters.page, filters.size, 0)
      : page([ana], filters.page, filters.size, 45)) });
    component.changePageSize(100);
    component.updateSearch('ana');
    vi.advanceTimersByTime(300);
    component.updateProfileFilter(3);
    component.updateStatusFilter('inactive');
    component.goToPage(1);
    expect(listUsers).toHaveBeenLastCalledWith({ page: 1, size: 100, query: 'ana', profileId: 3, active: false });
    component.updateSearch('ana souza');
    fixture.detectChanges();
    expect(element.textContent).toContain('Nenhum usuário encontrado');
    listUsers.mockClear();

    buttonByText('Limpar busca e filtros')!.click();
    vi.advanceTimersByTime(400);
    fixture.detectChanges();

    expect(listUsers).toHaveBeenCalledTimes(1);
    expect(listUsers).toHaveBeenCalledWith({ page: 0, size: 100, query: '', profileId: undefined, active: undefined });
    expect(element.querySelector<HTMLInputElement>('.search-field input')!.value).toBe('');
    expect(element.querySelector('tbody')?.textContent).toContain('Ana Souza');
    expect(count()).toBe('1–1 de 45 usuários');
  });
});

interface UsersHarness {
  openCreateModal(): void;
  openEditModal(user: UserAccountResponse): void;
  closeModal(): void;
  openDeleteModal(user: UserAccountResponse): void;
  confirmDeleteUser(): void;
  updateSearch(value: string): void;
  updateProfileFilter(value: number | null): void;
  updateStatusFilter(value: 'all' | 'active' | 'inactive'): void;
  goToPage(page: number): void;
  changePageSize(size: number): void;
}

function expectPending(root: HTMLElement): void {
  const busy = root.querySelector('[aria-busy="true"]');
  expect(busy?.textContent?.trim()).toBe('');
  expect(busy?.children.length).toBe(0);
  expect(root.textContent).not.toContain('Carregando');
}

describe('UsersComponent dialog focus', () => {
  let fixture: ComponentFixture<App>;
  let restoreModality: () => void;
  let element: HTMLElement;
  let loading: LoadingService;
  let rows: UserAccountResponse[];
  let save: Subject<UserAccountResponse>;
  let remove: Subject<void>;

  beforeEach(async () => {
    // Under the real root, whose blocker takes focus on showModal() as in a browser.
    restoreModality = simulateNativeModality();
    rows = [user(1, 'Ana'), user(2, 'Bia')];
    await TestBed.configureTestingModule({
      imports: [UsersComponent],
      providers: [provideRouter([{ path: '', component: UsersComponent }]), PROFILE_SERVICE, { provide: AuthService, useValue: { currentUser: () => ({ username: 'admin' }), refreshSession: () => of(null) } },
        { provide: CatalogService, useValue: {
        listUsers: (filters: { page: number; size: number }) => of(page(rows, filters.page, filters.size)),
        getUserSummary: () => of({ total: rows.length, active: rows.length, admins: 1, roles: 1 }),
        createUser: () => (save = new Subject<UserAccountResponse>()),
        updateUser: () => (save = new Subject<UserAccountResponse>()),
        deleteUser: () => (remove = new Subject<void>())
      } }]
    }).compileComponents();
    ({ fixture, element } = await mountUnderRoot(UsersComponent));
    vi.useFakeTimers();
    loading = TestBed.inject(LoadingService);
    render();
  });

  afterEach(() => {
    TestBed.resetTestingModule();
    vi.useRealTimers();
    restoreModality();
  });

  function render(): void {
    fixture.detectChanges();
    TestBed.tick();
  }

  function find(selector: string): HTMLElement {
    const found = element.querySelector<HTMLElement>(selector);
    expect(found, selector + ' must exist').not.toBeNull();
    return found!;
  }

  function activate(selector: string): HTMLButtonElement {
    const trigger = find(selector) as HTMLButtonElement;
    trigger.focus();
    trigger.click();
    render();
    return trigger;
  }

  function escape(): KeyboardEvent {
    const event = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
    (document.activeElement ?? document.body).dispatchEvent(event);
    render();
    return event;
  }

  function fillAndSubmit(): void {
    for (const [name, value] of [['username', 'caio'], ['fullName', 'Caio'], ['password', 'segredo1']]) {
      const input = find(`[formControlName="${name}"]`) as HTMLInputElement;
      input.value = value;
      input.dispatchEvent(new Event('input', { bubbles: true }));
    }
    (fixture.debugElement.query(By.directive(UsersComponent)).componentInstance as { form: { controls: { profileId: { setValue(id: number): void } } } })
      .form.controls.profileId.setValue(3);
    find('form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    render();
  }

  function showOverlay(): void {
    loading.start();
    vi.advanceTimersByTime(200);
    render();
    expect(blocker().open, 'the root blocker is shown').toBe(true);
    const dialog = element.querySelector('[role="dialog"], [role="alertdialog"]');
    expect(dialog?.contains(document.activeElement) ?? false, 'the blocker took focus away from the dialog').toBe(false);
  }

  function blocker(): HTMLDialogElement {
    return (fixture.nativeElement as HTMLElement).querySelector<HTMLDialogElement>('dialog.global-loading-dialog')!;
  }

  function hideOverlay(): void {
    loading.finish();
    vi.advanceTimersByTime(400);
    render();
  }

  it('focuses Nome completo from Novo usuário and returns to it on Escape', () => {
    const trigger = activate('.page-heading button');
    expect(document.activeElement).toBe(find('[formControlName="fullName"]'));
    expect(escape().defaultPrevented).toBe(true);
    expect(element.querySelector('[role="dialog"]')).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });

  it('focuses Cancelar in the delete confirmation and returns to the row action on Escape', () => {
    const trigger = activate('button[aria-label="Excluir Ana"]');
    const cancel = find('[role="alertdialog"] .form-actions .button-secondary');
    expect(cancel.textContent?.trim()).toBe('Cancelar');
    expect(document.activeElement).toBe(cancel);
    escape();
    expect(element.querySelector('[role="alertdialog"]')).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });

  it('ignores Escape while the user is being saved', () => {
    activate('.page-heading button');
    fillAndSubmit();
    escape();
    expect(element.querySelector('[role="dialog"]')).not.toBeNull();
    save.next(user(3, 'Caio'));
    save.complete();
    render();
    expect(element.querySelector('[role="dialog"]')).toBeNull();
  });

  it('ignores Escape while the user is being deleted', () => {
    activate('button[aria-label="Excluir Ana"]');
    find('[role="alertdialog"] .button-primary--danger').click();
    render();
    escape();
    expect(element.querySelector('[role="alertdialog"]')).not.toBeNull();
    remove.error(new HttpErrorResponse({ status: 409, error: { message: 'Vinculado.' } }));
    render();
    expect(element.querySelector('[role="alertdialog"] [role="alert"]')?.textContent).toContain('Vinculado.');
  });

  it('returns to Novo usuário only after the global overlay hides when the save succeeds under it', () => {
    const trigger = activate('.page-heading button');
    fillAndSubmit();
    showOverlay();
    const focus = vi.spyOn(trigger, 'focus');
    rows = [...rows, user(3, 'Caio')];
    save.next(user(3, 'Caio'));
    save.complete();
    render();
    expect(element.querySelector('[role="dialog"]')).toBeNull();
    expect(focus).not.toHaveBeenCalled();
    hideOverlay();
    expect(focus).toHaveBeenCalledTimes(1);
    expect(document.activeElement).toBe(trigger);
  });

  it('falls back to Novo usuário after the deleted row disappears, once the overlay hides', () => {
    activate('button[aria-label="Excluir Ana"]');
    find('[role="alertdialog"] .button-primary--danger').click();
    render();
    showOverlay();
    rows = [user(2, 'Bia')];
    remove.next();
    remove.complete();
    render();
    expect(element.querySelector('button[aria-label="Excluir Ana"]')).toBeNull();
    const fallback = find('.page-heading button');
    expect(document.activeElement).not.toBe(fallback);
    hideOverlay();
    expect(document.activeElement).toBe(fallback);
  });
});
