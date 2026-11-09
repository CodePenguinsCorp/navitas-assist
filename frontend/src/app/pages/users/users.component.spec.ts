import { HttpErrorResponse } from '@angular/common/http';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Observable, Subject, of, throwError } from 'rxjs';
import { PageResponse, UserAccountResponse, UserRole } from '../../core/models';
import { AuthService } from '../../core/services/auth.service';
import { CatalogService, UserFilters } from '../../core/services/catalog.service';
import { UsersComponent } from './users.component';

function user(id: number, fullName: string): UserAccountResponse {
  return {
    id, username: `user${id}`, fullName, role: 'TECHNICIAN', active: true,
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
        { provide: AuthService, useValue: { currentUser: () => ({ username: 'admin' }), hasAnyRole: () => true } },
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
    expect(listUsers).toHaveBeenLastCalledWith({ page: 0, size: 20, query: '', role: undefined, active: undefined });
    expect(fixture.nativeElement.textContent).toContain('45 registro(s)');
    expect(fixture.nativeElement.textContent).toContain('Página 1 de 3');
  });

  it('combines role and status filters with navigation', () => {
    component.updateRoleFilter('TECHNICIAN');
    component.updateStatusFilter('inactive');
    expect(listUsers).toHaveBeenLastCalledWith({ page: 0, size: 20, query: '', role: 'TECHNICIAN', active: false });

    component.goToPage(2);
    expect(listUsers).toHaveBeenLastCalledWith({ page: 2, size: 20, query: '', role: 'TECHNICIAN', active: false });

    component.updateStatusFilter('active');
    expect(listUsers).toHaveBeenLastCalledWith({ page: 0, size: 20, query: '', role: 'TECHNICIAN', active: true });
  });

  it('debounces the text search and honors the page size', () => {
    listUsers.mockClear();
    component.updateSearch('an');
    component.updateSearch('ana');
    vi.advanceTimersByTime(300);
    expect(listUsers).toHaveBeenCalledTimes(1);
    expect(listUsers).toHaveBeenLastCalledWith({ page: 0, size: 20, query: 'ana', role: undefined, active: undefined });

    component.changePageSize(100);
    expect(listUsers).toHaveBeenLastCalledWith({ page: 0, size: 100, query: 'ana', role: undefined, active: undefined });
  });
});

describe('UsersComponent collection layout and states', () => {
  let fixture: ComponentFixture<UsersComponent>;
  let component: UsersHarness;
  let element: HTMLElement;
  let listUsers: ReturnType<typeof vi.fn>;
  let deleteUser: ReturnType<typeof vi.fn>;

  const ownAccount: UserAccountResponse = { ...user(1, 'Administrador'), username: 'Admin', role: 'ADMIN' };
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
        { provide: AuthService, useValue: { currentUser: () => ({ username: 'admin' }), hasAnyRole: () => true } },
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

  const count = () => element.querySelector('.result-count')?.textContent?.trim() ?? null;
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

  it('shows the total next to the title and removes statistics cards', async () => {
    await mount();
    expect(count()).toBe('45 usuários');
    expect(element.querySelector('.stat-card')).toBeNull();
    expect(element.querySelector('.stats-grid')).toBeNull();
    expect(element.querySelector('.search-field')?.textContent).not.toContain('registro(s)');
  });

  it('shows "X de Y" while a filter is active and only the count without the summary', async () => {
    await mount({ list: (filters) => of(page([ana], filters.page, filters.size, filters.role ? 3 : 45)) });
    component.updateRoleFilter('ADMIN');
    fixture.detectChanges();
    expect(count()).toBe('3 de 45 usuários');

    TestBed.resetTestingModule();
    await mount({ list: (filters) => of(page([ana], filters.page, filters.size, filters.role ? 3 : 45)), summary: loadError });
    component.updateRoleFilter('ADMIN');
    fixture.detectChanges();
    expect(count()).toBe('3 usuários');
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

  it('groups the form into Identidade, Acesso and Senha', async () => {
    await mount();
    component.openCreateModal();
    fixture.detectChanges();

    const dialog = element.querySelector<HTMLElement>('[role="dialog"]')!;
    expect(dialog.getAttribute('aria-modal')).toBe('true');
    expect(element.querySelector(`#${dialog.getAttribute('aria-labelledby')}`)?.textContent?.trim()).toBe('Novo usuário');
    const sections = Array.from(dialog.querySelectorAll('fieldset.form-section'));
    expect(sections.map((section) => section.querySelector('legend')?.textContent?.trim())).toEqual(['Identidade', 'Acesso', 'Senha']);
    const controlsIn = (section: Element) => Array.from(section.querySelectorAll('[formControlName]')).map((node) => node.getAttribute('formControlName'));
    expect(controlsIn(sections[0])).toEqual(['fullName', 'username']);
    expect(controlsIn(sections[1])).toEqual(['role', 'active']);
    expect(controlsIn(sections[2])).toEqual(['password']);
    expect(dialog.textContent).not.toContain('Deixe em branco para manter a senha atual.');
  });

  it('does not mention permissions in the dialog', async () => {
    await mount();
    component.openCreateModal();
    fixture.detectChanges();
    expect(element.querySelector('[role="dialog"]')?.textContent?.toLowerCase()).not.toContain('permiss');

    component.closeModal();
    component.openEditModal(ana);
    fixture.detectChanges();
    const dialog = element.querySelector('[role="dialog"]')!;
    expect(dialog.textContent?.toLowerCase()).not.toContain('permiss');
    expect(dialog.textContent).toContain('Deixe em branco para manter a senha atual.');
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

    expect(listUsers).toHaveBeenLastCalledWith({ page: 1, size: 20, query: '', role: undefined, active: false });
    expect(loadAlert()).toBeNull();
    expect(element.querySelector('tbody')?.textContent).toContain('Ana Souza');
    expect(count()).toBe('30 de 45 usuários');
  });

  it('shows a disabled loading retry without the old table or count while the retry is pending, then recovers', async () => {
    await mount();
    expect(count()).toBe('45 usuários');
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
    expect(retry.textContent?.trim()).toBe('Carregando...');
    expect(buttonByText('Tentar novamente')).toBeUndefined();
    expect(element.querySelector('tbody')).toBeNull();
    expect(element.querySelector('app-pagination')).toBeNull();
    expect(count()).toBeNull();

    pending.next(page([{ ...user(3, 'Gabriel Lima'), username: 'gabriel' }], 1, 20, 45));
    pending.complete();
    fixture.detectChanges();

    expect(loadAlert()).toBeNull();
    expect(element.querySelector('tbody')?.textContent).toContain('Gabriel Lima');
    expect(count()).toBe('45 usuários');
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
    await mount({ list: (filters) => of(filters.role || filters.query || filters.active !== undefined
      ? page([], filters.page, filters.size, 0)
      : page([ana], filters.page, filters.size, 45)) });
    component.changePageSize(100);
    component.updateSearch('ana');
    vi.advanceTimersByTime(300);
    component.updateRoleFilter('TECHNICIAN');
    component.updateStatusFilter('inactive');
    component.goToPage(1);
    expect(listUsers).toHaveBeenLastCalledWith({ page: 1, size: 100, query: 'ana', role: 'TECHNICIAN', active: false });
    component.updateSearch('ana souza');
    fixture.detectChanges();
    expect(element.textContent).toContain('Nenhum usuário encontrado');
    listUsers.mockClear();

    buttonByText('Limpar busca e filtros')!.click();
    vi.advanceTimersByTime(400);
    fixture.detectChanges();

    expect(listUsers).toHaveBeenCalledTimes(1);
    expect(listUsers).toHaveBeenCalledWith({ page: 0, size: 100, query: '', role: undefined, active: undefined });
    expect(element.querySelector<HTMLInputElement>('.search-field input')!.value).toBe('');
    expect(element.querySelector('tbody')?.textContent).toContain('Ana Souza');
    expect(count()).toBe('45 usuários');
  });
});

interface UsersHarness {
  openCreateModal(): void;
  openEditModal(user: UserAccountResponse): void;
  closeModal(): void;
  openDeleteModal(user: UserAccountResponse): void;
  confirmDeleteUser(): void;
  updateSearch(value: string): void;
  updateRoleFilter(value: UserRole | ''): void;
  updateStatusFilter(value: 'all' | 'active' | 'inactive'): void;
  goToPage(page: number): void;
  changePageSize(size: number): void;
}
