import { HttpErrorResponse } from '@angular/common/http';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Observable, Subject, of, throwError } from 'rxjs';
import { PageResponse, ProfileResponse } from '../../core/models';
import { AuthService } from '../../core/services/auth.service';
import { ProfileFilters, ProfileService } from '../../core/services/profile.service';
import { PERMISSION_CATALOG, buildProfile, buildProfilePage } from '../../testing/profile-fixtures';
import { ProfilesComponent } from './profiles.component';

interface ProfilesHarness {
  updateSearch(value: string): void;
  goToPage(page: number): void;
  changePageSize(size: number): void;
}

const ALL_CODES = PERMISSION_CATALOG.flatMap((module) => module.permissions.map((item) => item.code));
const ADMIN = buildProfile({ id: 1, name: 'Administrador', permissions: ALL_CODES.filter((code) => code !== 'rma.atribuivel'), userCount: 3 });
const SUPERVISOR = buildProfile({ id: 5, name: 'Supervisor', permissions: ['rma.ver', 'relatorios.ver'], userCount: 0 });

describe('ProfilesComponent list', () => {
  let fixture: ComponentFixture<ProfilesComponent>;
  let component: ProfilesHarness;
  let element: HTMLElement;
  let list: ReturnType<typeof vi.fn>;

  const loadError = () => throwError(() => new HttpErrorResponse({ status: 503, error: { message: 'Serviço indisponível.' } }));
  const count = () => element.querySelector('.pagination__summary')?.textContent?.replace(/\s+/g, ' ').trim() ?? null;
  const buttonByText = (text: string) => Array.from(element.querySelectorAll<HTMLButtonElement>('button')).find((button) => button.textContent?.trim() === text);
  const cells = (row: number) => Array.from(element.querySelectorAll('tbody tr')[row].querySelectorAll('td')).map((cell) => cell.textContent?.replace(/\s+/g, ' ').trim());
  const rowActions = (row: number) => Array.from(element.querySelectorAll('tbody tr')[row].querySelectorAll<HTMLButtonElement>('.row-actions button'));

  async function mount(source: (filters: ProfileFilters) => Observable<PageResponse<ProfileResponse>> = (filters) =>
    of(buildProfilePage([ADMIN, SUPERVISOR], filters.page, filters.size, 45))): Promise<void> {
    vi.useFakeTimers();
    list = vi.fn(source);
    await TestBed.configureTestingModule({
      imports: [ProfilesComponent],
      providers: [
        { provide: AuthService, useValue: { refreshSession: () => of(null) } },
        { provide: ProfileService, useValue: { list, permissionCatalog: () => of(PERMISSION_CATALOG), invalidateOptions: vi.fn() } }
      ]
    }).compileComponents();
    fixture = TestBed.createComponent(ProfilesComponent);
    component = fixture.componentInstance as unknown as ProfilesHarness;
    element = fixture.nativeElement as HTMLElement;
    fixture.detectChanges();
  }

  afterEach(() => vi.useRealTimers());

  it('lists profiles with permission and user counts', async () => {
    await mount();
    expect(element.querySelector('.page-heading h1, .page-heading h2')?.textContent?.trim()).toBe('Perfis');
    expect(buttonByText('Novo perfil')).toBeDefined();
    expect(Array.from(element.querySelectorAll('thead th')).map((th) => th.textContent?.trim())).toEqual(['Nome', 'Permissões', 'Usuários', 'Atualizado', 'Ações']);
    expect(cells(0).slice(0, 4)).toEqual(['Administrador', '21 de 22', '3', '11/11/2026, 12:30']);
    expect(cells(1).slice(0, 3)).toEqual(['Supervisor', '2 de 22', '0']);
    expect(rowActions(1).map((button) => button.getAttribute('aria-label'))).toEqual(['Editar Supervisor', 'Duplicar Supervisor', 'Excluir Supervisor']);
  });

  it('paginates with totals and the real plural', async () => {
    await mount();
    expect(list).toHaveBeenLastCalledWith({ page: 0, size: 20, query: '' });
    expect(count()).toBe('1–2 de 45 perfis');
    expect(element.querySelectorAll('.pagination__summary').length).toBe(1);
    component.goToPage(2);
    expect(list).toHaveBeenLastCalledWith({ page: 2, size: 20, query: '' });
    component.changePageSize(50);
    expect(list).toHaveBeenLastCalledWith({ page: 0, size: 50, query: '' });

    TestBed.resetTestingModule();
    await mount((filters) => of(buildProfilePage([SUPERVISOR], filters.page, filters.size, 1)));
    expect(count()).toBe('1–1 de 1 perfil');
  });

  it('debounces the name search', async () => {
    await mount();
    list.mockClear();
    component.updateSearch('su');
    component.updateSearch('sup');
    vi.advanceTimersByTime(300);
    expect(list).toHaveBeenCalledTimes(1);
    expect(list).toHaveBeenLastCalledWith({ page: 0, size: 20, query: 'sup' });
  });

  it('shows load failure with retry', async () => {
    await mount(loadError);
    const alert = element.querySelector('.table-card [role="alert"]');
    expect(alert?.textContent).toContain('Não foi possível carregar os perfis.');
    expect(alert?.textContent).toContain('Serviço indisponível.');
    expect(element.querySelector('tbody, app-pagination')).toBeNull();

    list.mockImplementation((filters: ProfileFilters) => of(buildProfilePage([SUPERVISOR], filters.page, filters.size, 1)));
    buttonByText('Tentar novamente')!.click();
    fixture.detectChanges();
    expect(element.querySelector('.table-card [role="alert"]')).toBeNull();
    expect(element.querySelector('tbody')?.textContent).toContain('Supervisor');
  });

  it('shows empty states with and without search', async () => {
    await mount((filters) => of(buildProfilePage([], filters.page, filters.size, 0)));
    expect(element.textContent).toContain('Nenhum perfil cadastrado');
    expect(element.querySelector('app-pagination')).toBeNull();

    component.updateSearch('xyz');
    vi.advanceTimersByTime(300);
    fixture.detectChanges();
    expect(element.textContent).toContain('Nenhum perfil encontrado');
    list.mockClear();
    buttonByText('Limpar busca')!.click();
    vi.advanceTimersByTime(400);
    fixture.detectChanges();
    expect(list).toHaveBeenCalledTimes(1);
    expect(list).toHaveBeenLastCalledWith({ page: 0, size: 20, query: '' });
    expect(element.querySelector<HTMLInputElement>('.search-field input')!.value).toBe('');
  });

  it('renders only an empty busy container while loading', async () => {
    const pending = new Subject<PageResponse<ProfileResponse>>();
    await mount(() => pending);
    const busy = element.querySelector('[aria-busy="true"]');
    expect(busy).not.toBeNull();
    expect(busy?.textContent?.trim()).toBe('');
    expect(busy?.children.length).toBe(0);
    expect(element.textContent).not.toContain('Carregando');
    expect(element.textContent).not.toContain('Nenhum perfil');
    pending.next(buildProfilePage([SUPERVISOR])); pending.complete(); fixture.detectChanges();
    expect(element.querySelector('[aria-busy="true"]')).toBeNull();
  });

  it('blocks delete when profile has users', async () => {
    await mount();
    const remove = rowActions(0)[2];
    expect(remove.getAttribute('aria-disabled')).toBe('true');
    expect(remove.querySelector('[role="tooltip"]')?.textContent?.trim()).toBe('Perfil com usuários vinculados não pode ser excluído.');
    remove.click();
    fixture.detectChanges();
    expect(element.querySelector('[role="alertdialog"]')).toBeNull();

    rowActions(1)[2].click();
    fixture.detectChanges();
    expect(element.querySelector('[role="alertdialog"]')?.textContent).toContain('Supervisor');
  });
});
