import { HttpErrorResponse, provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FormGroup } from '@angular/forms';
import { Observable, of, throwError } from 'rxjs';
import { PermissionModuleResponse, ProfileOption, UserAccountResponse } from '../../core/models';
import { AuthService } from '../../core/services/auth.service';
import { CatalogService, UserFilters } from '../../core/services/catalog.service';
import { ProfileService } from '../../core/services/profile.service';
import { PERMISSION_CATALOG } from '../../testing/profile-fixtures';
import { UsersComponent } from './users.component';

const OPTIONS: ProfileOption[] = [
  { id: 2, name: 'Atendimento', permissions: ['rma.ver', 'rma.abrir', 'cadastros.ver'] },
  { id: 4, name: 'Consulta', permissions: ['rma.ver', 'relatorios.ver'] }
];

function account(overrides: Partial<UserAccountResponse> = {}): UserAccountResponse {
  return {
    id: 7, username: 'ana', fullName: 'Ana Souza', profile: { id: 4, name: 'Consulta' }, extraPermissions: [], active: true,
    updatedAt: '2026-10-20T12:00:00Z', ...overrides
  };
}

interface UsersHarness {
  form: FormGroup;
  openCreateModal(): void;
  openEditModal(user: UserAccountResponse): void;
  closeModal(): void;
  saveUser(): void;
  updateProfileFilter(value: number | null): void;
}

describe('UsersComponent profile and extra permissions', () => {
  let fixture: ComponentFixture<UsersComponent>;
  let component: UsersHarness;
  let element: HTMLElement;
  let listUsers: ReturnType<typeof vi.fn>;
  let createUser: ReturnType<typeof vi.fn>;
  let updateUser: ReturnType<typeof vi.fn>;
  let refreshSession: ReturnType<typeof vi.fn>;
  let options: ReturnType<typeof vi.fn>;

  async function mount(sources: {
    rows?: UserAccountResponse[];
    options?: () => Observable<ProfileOption[]>;
    catalog?: () => Observable<PermissionModuleResponse[]>;
  } = {}): Promise<void> {
    const rows = sources.rows ?? [account()];
    listUsers = vi.fn((filters: UserFilters) => of({ content: rows, page: filters.page ?? 0, size: filters.size ?? 20, totalElements: rows.length, totalPages: 1 }));
    createUser = vi.fn(() => of(account({ id: 9 })));
    updateUser = vi.fn(() => of(account()));
    refreshSession = vi.fn(() => of(null));
    options = vi.fn(sources.options ?? (() => of(OPTIONS)));
    await TestBed.configureTestingModule({
      imports: [UsersComponent],
      providers: [
        { provide: AuthService, useValue: { currentUser: () => ({ username: 'admin' }), refreshSession } },
        { provide: CatalogService, useValue: { listUsers, getUserSummary: () => of({ total: 1 }), createUser, updateUser } },
        { provide: ProfileService, useValue: { options, permissionCatalog: sources.catalog ?? (() => of(PERMISSION_CATALOG)), invalidateOptions: vi.fn() } }
      ]
    }).compileComponents();
    fixture = TestBed.createComponent(UsersComponent);
    component = fixture.componentInstance as unknown as UsersHarness;
    element = fixture.nativeElement as HTMLElement;
    fixture.detectChanges();
  }

  const dialog = () => element.querySelector<HTMLElement>('[role="dialog"]')!;
  const extraBox = (label: string) => Array.from(dialog().querySelectorAll<HTMLLabelElement>('.extra-permissions label.permission-row'))
    .find((item) => item.querySelector('.permission-row__label')?.textContent?.trim() === label)!;
  const fill = () => component.form.patchValue({ username: 'novo', fullName: 'Novo usuário', password: 'segredo1' });
  const selectProfile = (id: number) => { component.form.controls['profileId'].setValue(id); fixture.detectChanges(); };

  it('requires a profile without default', async () => {
    await mount();
    component.openCreateModal();
    fixture.detectChanges();
    const select = dialog().querySelector('app-custom-select[formcontrolname="profileId"]')!;
    expect(select.textContent).toContain('Selecione o perfil');
    expect(component.form.controls['profileId'].value).toBeNull();
    fill();
    component.saveUser();
    fixture.detectChanges();
    expect(createUser).not.toHaveBeenCalled();
    expect(select.closest('.field-group')?.querySelector('.field-error')?.textContent?.trim()).toBe('Selecione o perfil.');
  });

  it('marks profile permissions as included and disabled', async () => {
    await mount();
    component.openCreateModal();
    fixture.detectChanges();
    const sets = Array.from(dialog().querySelectorAll('.extra-permissions fieldset.permission-module'));
    expect(sets.length).toBe(6);
    expect(dialog().querySelector('.extra-permissions')?.textContent).toContain('Permissões extras');
    selectProfile(2);
    const included = extraBox('Abrir ordens de serviço');
    expect(included.querySelector('input')!.checked).toBe(true);
    expect(included.querySelector('input')!.disabled).toBe(true);
    expect(included.querySelector('.permission-badge')?.textContent?.trim()).toBe('Do perfil');
    const free = extraBox('Alterar status');
    expect(free.querySelector('input')!.checked).toBe(false);
    expect(free.querySelector('input')!.disabled).toBe(false);
    expect(free.querySelector('.permission-badge')).toBeNull();
  });

  describe('collapsible extra permissions', () => {
    const toggle = () => dialog().querySelector<HTMLButtonElement>('.extra-permissions button[aria-controls]')!;
    const details = () => ({ open: toggle().getAttribute('aria-expanded') === 'true' && !dialog().querySelector<HTMLElement>(`#${toggle().getAttribute('aria-controls')}`)!.hidden });
    const summary = () => dialog().querySelector('.extra-permissions .permission-picker__summary')!.textContent!.replace(/\s+/g, ' ').trim();

    it('starts minimized for a new user and keeps the checkboxes in the DOM', async () => {
      await mount();
      component.openCreateModal();
      fixture.detectChanges();
      expect(details().open).toBe(false);
      expect(summary()).toContain('Nenhuma permissão extra');
      expect(dialog().querySelectorAll('.extra-permissions fieldset.permission-module').length).toBe(6);
    });

    it('opens by itself when the user being edited already has extras, and counts them', async () => {
      await mount();
      component.openEditModal(account({ extraPermissions: ['rma.status', 'pecas.reservar'] }));
      fixture.detectChanges();
      expect(details().open).toBe(true);
      expect(summary()).toContain('2 permissões extras');
    });

    it('counts a single extra in the singular and ignores permissions the profile already has', async () => {
      await mount();
      component.openEditModal(account({ extraPermissions: ['rma.ver'] }));
      fixture.detectChanges();
      expect(summary()).toContain('Nenhuma permissão extra');
      extraBox('Alterar status').querySelector('input')!.click();
      fixture.detectChanges();
      expect(summary()).toContain('1 permissão extra');
    });

    it('is minimized again the next time a new user is created', async () => {
      await mount();
      component.openEditModal(account({ extraPermissions: ['rma.status'] }));
      fixture.detectChanges();
      expect(details().open).toBe(true);
      component.closeModal();
      fixture.detectChanges();
      component.openCreateModal();
      fixture.detectChanges();
      expect(details().open).toBe(false);
    });
  });

  it('removes an extra from its chip without opening the panel', async () => {
    await mount();
    component.openEditModal(account({ extraPermissions: ['rma.status', 'pecas.reservar'] }));
    fixture.detectChanges();
    const chips = () => Array.from(dialog().querySelectorAll('.extra-permissions .permission-chip')).map((chip) => chip.querySelector('.permission-chip__label')?.textContent?.trim());
    expect(chips()).toEqual(['Alterar status', 'Reservar e aplicar peças nas ordens de serviço']);
    dialog().querySelector<HTMLButtonElement>('.permission-chip button[aria-label="Remover Alterar status"]')!.click();
    fixture.detectChanges();
    expect(chips()).toEqual(['Reservar e aplicar peças nas ordens de serviço']);
    component.saveUser();
    expect(updateUser).toHaveBeenCalledWith(7, expect.objectContaining({ extraPermissions: ['pecas.reservar'] }));
  });

  it('sends only extras not in the selected profile', async () => {
    await mount({ rows: [account({ extraPermissions: ['rma.ver', 'pecas.reservar'] })] });
    component.openEditModal(account({ extraPermissions: ['rma.ver', 'pecas.reservar'] }));
    fixture.detectChanges();
    expect(component.form.controls['profileId'].value).toBe(4);
    extraBox('Alterar status').querySelector('input')!.click();
    fixture.detectChanges();
    component.saveUser();
    expect(updateUser).toHaveBeenCalledWith(7, expect.objectContaining({ profileId: 4, extraPermissions: ['rma.status', 'pecas.reservar'] }));
    expect(updateUser.mock.calls[0][1]).not.toHaveProperty('role');
  });

  it('going back to A keeps X; saving with B does not send X', async () => {
    await mount();
    component.openCreateModal();
    fixture.detectChanges();
    selectProfile(4);
    extraBox('Abrir ordens de serviço').querySelector('input')!.click();
    extraBox('Alterar status').querySelector('input')!.click();
    fixture.detectChanges();
    selectProfile(2);
    expect(extraBox('Abrir ordens de serviço').querySelector('input')!.checked).toBe(true);
    selectProfile(4);
    expect(extraBox('Abrir ordens de serviço').querySelector('input')!.checked).toBe(true);
    expect(extraBox('Abrir ordens de serviço').querySelector('input')!.disabled).toBe(false);
    expect(extraBox('Alterar status').querySelector('input')!.checked).toBe(true);
    selectProfile(2);
    fill();
    component.saveUser();
    expect(createUser).toHaveBeenCalledWith(expect.objectContaining({ profileId: 2, extraPermissions: ['rma.status'] }));
  });

  it('filters list by profileId', async () => {
    await mount();
    const filter = element.querySelector('.catalog-toolbar app-custom-select[arialabel="Filtrar por perfil"], .catalog-toolbar [aria-label="Filtrar por perfil"]');
    expect(filter).not.toBeNull();
    component.updateProfileFilter(2);
    expect(listUsers).toHaveBeenLastCalledWith({ page: 0, size: 20, query: '', profileId: 2, active: undefined });
    component.updateProfileFilter(null);
    expect(listUsers).toHaveBeenLastCalledWith({ page: 0, size: 20, query: '', profileId: undefined, active: undefined });
  });

  it('shows profile name and extras count', async () => {
    await mount({ rows: [account(), account({ id: 8, fullName: 'Bia', username: 'bia', extraPermissions: ['rma.status'] }),
      account({ id: 9, fullName: 'Caio', username: 'caio', extraPermissions: ['rma.status', 'pecas.reservar'] })] });
    const profileCell = (row: number) => element.querySelectorAll('tbody tr')[row].querySelectorAll('td')[3].textContent?.replace(/\s+/g, ' ').trim();
    expect(profileCell(0)).toBe('Consulta');
    expect(profileCell(1)).toBe('Consulta +1 extra');
    expect(profileCell(2)).toBe('Consulta +2 extras');
  });

  it.each([
    ['options', { options: () => throwError(() => new HttpErrorResponse({ status: 503 })) }],
    ['catalog', { catalog: () => throwError(() => new HttpErrorResponse({ status: 503 })) }]
  ] as const)('disables submit when profile %s fail', async (_name, sources) => {
    await mount(sources);
    component.openCreateModal();
    fixture.detectChanges();
    expect(dialog().querySelector('.modal-feedback[role="alert"] strong')?.textContent?.trim()).toBe('Não foi possível carregar os perfis.');
    expect(dialog().querySelector<HTMLButtonElement>('button[type="submit"]')!.disabled).toBe(true);
  });

  // Abertura do diálogo após a falha da tela: 2 pedidos de opções; o botão faz o 3º.
  it.each([['options', 3], ['catalog', 1]] as const)('retries the profile %s from the dialog alert', async (source, optionCalls) => {
    let failing = true;
    const unavailable = () => throwError(() => new HttpErrorResponse({ status: 503 }));
    await mount({
      options: () => source === 'options' && failing ? unavailable() : of(OPTIONS),
      catalog: () => source === 'catalog' && failing ? unavailable() : of(PERMISSION_CATALOG)
    });
    component.openCreateModal();
    fixture.detectChanges();
    failing = false;
    Array.from(dialog().querySelectorAll<HTMLButtonElement>('.modal-feedback button'))
      .find((button) => button.textContent?.trim() === 'Tentar novamente')!.click();
    fixture.detectChanges();
    expect(options).toHaveBeenCalledTimes(optionCalls);
    expect(dialog().querySelector('.modal-feedback[role="alert"]')).toBeNull();
    expect(dialog().querySelector<HTMLButtonElement>('button[type="submit"]')!.disabled).toBe(false);
  });

  it('warns in the Perfil filter when the profile options fail', async () => {
    await mount({ options: () => throwError(() => new HttpErrorResponse({ status: 503 })) });
    const filter = element.querySelector('[aria-label="Filtrar por perfil"]')!.closest('.filter-field')!;
    expect(filter.querySelector('.field-error')?.textContent?.trim()).toBe('Não foi possível carregar os perfis.');
  });

  it('drops the app-wide profile options cache before loading them', async () => {
    await mount();
    const service = TestBed.inject(ProfileService) as unknown as { invalidateOptions: ReturnType<typeof vi.fn> };
    expect(service.invalidateOptions).toHaveBeenCalledOnce();
    expect(service.invalidateOptions.mock.invocationCallOrder[0]).toBeLessThan(options.mock.invocationCallOrder[0]);
  });

  it('refreshes own session after saving', async () => {
    await mount();
    component.openEditModal(account());
    component.saveUser();
    expect(updateUser).toHaveBeenCalled();
    expect(refreshSession).toHaveBeenCalledOnce();
  });

  it('loads options once per screen', async () => {
    await mount();
    component.openCreateModal();
    component.closeModal();
    component.openEditModal(account());
    expect(options).toHaveBeenCalledTimes(1);
  });
});

describe('UsersComponent profile requests', () => {
  it('requests options and catalog once for the filter and two dialogs', async () => {
    await TestBed.configureTestingModule({
      imports: [UsersComponent],
      providers: [provideHttpClient(), provideHttpClientTesting(), { provide: AuthService, useValue: { currentUser: () => null, refreshSession: () => of(null) } }]
    }).compileComponents();
    const http = TestBed.inject(HttpTestingController);
    const fixture = TestBed.createComponent(UsersComponent);
    const component = fixture.componentInstance as unknown as UsersHarness;
    fixture.detectChanges();
    http.expectOne((request) => request.url === '/api/users').flush({ content: [], page: 0, size: 20, totalElements: 0, totalPages: 0 });
    http.match('/api/users/summary').forEach((request) => request.flush({ total: 0 }));
    http.expectOne('/api/profiles/options').flush(OPTIONS);
    component.openCreateModal(); fixture.detectChanges();
    http.match('/api/permissions').forEach((request) => request.flush(PERMISSION_CATALOG));
    component.closeModal();
    component.openCreateModal(); fixture.detectChanges();
    http.expectNone('/api/profiles/options');
    http.expectNone('/api/permissions');
    http.verify();
  });
});
