import { HttpErrorResponse, provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { Observable, Subject, of, throwError } from 'rxjs';
import { PermissionModuleResponse, ProfileResponse } from '../../core/models';
import { AuthService } from '../../core/services/auth.service';
import { ProfileService } from '../../core/services/profile.service';
import { expectCancelBeforePrimary } from '../../testing/dialog-actions';
import { mountUnderRoot, simulateNativeModality } from '../../testing/native-dialog';
import { PERMISSION_CATALOG, buildProfile, buildProfilePage } from '../../testing/profile-fixtures';
import { ProfilesComponent } from './profiles.component';

interface ProfilesHarness {
  openCreateModal(): void;
  openEditModal(profile: ProfileResponse): void;
  openDuplicateModal(profile: ProfileResponse): void;
  openDeleteModal(profile: ProfileResponse): void;
  closeModal(): void;
}

const TECHNICIAN = buildProfile({ id: 3, name: 'Técnico', permissions: ['rma.ver', 'rma.status', 'rma.diagnosticar', 'pecas.ver'], userCount: 2 });
const SUPERVISOR = buildProfile({ id: 5, name: 'Supervisor', permissions: ['rma.ver', 'relatorios.ver'], userCount: 0 });
const badRequest = (message: string) => throwError(() => new HttpErrorResponse({ status: 400, error: { message } }));

describe('ProfilesComponent form', () => {
  let fixture: ComponentFixture<ProfilesComponent>;
  let component: ProfilesHarness;
  let element: HTMLElement;
  let service: {
    list: ReturnType<typeof vi.fn>; permissionCatalog: ReturnType<typeof vi.fn>; invalidateOptions: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>; update: ReturnType<typeof vi.fn>; delete: ReturnType<typeof vi.fn>;
  };
  let refreshSession: ReturnType<typeof vi.fn>;

  async function mount(options: { catalog?: () => Observable<PermissionModuleResponse[]> } = {}): Promise<void> {
    service = {
      list: vi.fn((filters: { page: number; size: number }) => of(buildProfilePage([TECHNICIAN, SUPERVISOR], filters.page, filters.size))),
      permissionCatalog: vi.fn(options.catalog ?? (() => of(PERMISSION_CATALOG))),
      invalidateOptions: vi.fn(),
      create: vi.fn((payload: { name: string; permissions: string[] }) => of(buildProfile({ id: 9, ...payload }))),
      update: vi.fn((id: number, payload: { name: string; permissions: string[] }) => of(buildProfile({ id, ...payload }))),
      delete: vi.fn(() => of(undefined))
    };
    refreshSession = vi.fn(() => of(null));
    await TestBed.configureTestingModule({
      imports: [ProfilesComponent],
      providers: [
        { provide: AuthService, useValue: { refreshSession } },
        { provide: ProfileService, useValue: service }
      ]
    }).compileComponents();
    fixture = TestBed.createComponent(ProfilesComponent);
    component = fixture.componentInstance as unknown as ProfilesHarness;
    element = fixture.nativeElement as HTMLElement;
    fixture.detectChanges();
  }

  const dialog = () => element.querySelector<HTMLElement>('[role="dialog"]');
  const alertDialog = () => element.querySelector<HTMLElement>('[role="alertdialog"]');
  const nameInput = () => dialog()!.querySelector<HTMLInputElement>('[formcontrolname="name"]')!;
  const moduleSets = () => Array.from(dialog()!.querySelectorAll<HTMLFieldSetElement>('fieldset.permission-module'));
  const checkbox = (label: string) => Array.from(dialog()!.querySelectorAll<HTMLLabelElement>('label.permission-row'))
    .find((item) => item.textContent?.trim() === label)!.querySelector<HTMLInputElement>('input[type="checkbox"]')!;
  const submitButton = () => dialog()!.querySelector<HTMLButtonElement>('button[type="submit"]')!;
  const setName = (value: string) => { nameInput().value = value; nameInput().dispatchEvent(new Event('input')); fixture.detectChanges(); };
  const submit = () => { dialog()!.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })); fixture.detectChanges(); };
  const nameError = () => dialog()!.querySelector('[formcontrolname="name"]')!.closest('.field-group')!.querySelector('.field-error');
  const open = (action: () => void) => { action(); fixture.detectChanges(); };

  it('groups permissions by module with counters', async () => {
    await mount();
    open(() => component.openEditModal(TECHNICIAN));
    const sets = moduleSets();
    expect(sets.map((set) => set.querySelector('legend')?.textContent?.replace(/\s+/g, ' ').trim())).toEqual([
      'RMAs 3 de 8', 'Clientes e produtos 0 de 3', 'Peças 1 de 3', 'Protocolos técnicos 0 de 3', 'Relatórios 0 de 1', 'Administração 0 de 3'
    ]);
    checkbox('Abrir RMAs').click();
    fixture.detectChanges();
    expect(sets[0].querySelector('legend')?.textContent).toContain('4 de 8');
  });

  it('uses a labelled switch for each permission, inside the Permissões section', async () => {
    await mount();
    open(() => component.openCreateModal());
    const sections = Array.from(dialog()!.querySelectorAll('fieldset.form-section')).map((section) => section.querySelector('legend')?.textContent?.trim());
    expect(sections).toEqual(['Identificação', 'Permissões']);
    const boxes = Array.from(dialog()!.querySelectorAll<HTMLInputElement>('fieldset.permission-module input[type="checkbox"]'));
    expect(boxes.length).toBe(21);
    expect(boxes.every((box) => box.getAttribute('role') === 'switch' && box.closest('label')?.classList.contains('permission-row'))).toBe(true);
    expect(boxes.every((box) => !box.checked)).toBe(true);
    expect(dialog()!.querySelector('h3')?.textContent?.trim()).toBe('Novo perfil');
    expectCancelBeforePrimary(dialog()!);
  });

  it('requires name and shows the error by the field only', async () => {
    await mount();
    open(() => component.openCreateModal());
    submit();
    expect(nameError()?.textContent?.trim()).toBe('Informe o nome do perfil.');
    expect(nameInput().getAttribute('aria-invalid')).toBe('true');
    expect(nameInput().getAttribute('aria-describedby')).toBe(nameError()!.id);
    expect(dialog()!.querySelector('.modal-feedback')).toBeNull();
    setName('    ');
    submit();
    expect(nameError()?.textContent?.trim()).toBe('Informe o nome do perfil.');
    setName('x'.repeat(61));
    submit();
    expect(nameError()?.textContent?.trim()).toBe('Use até 60 caracteres.');
    expect(service.create).not.toHaveBeenCalled();
  });

  it('creates profile with checked permissions', async () => {
    await mount();
    open(() => component.openCreateModal());
    setName('  Supervisor  ');
    checkbox('Ver relatórios').click();
    checkbox('Ver RMAs, Kanban e dashboard').click();
    fixture.detectChanges();
    expect(submitButton().textContent?.trim()).toBe('Cadastrar perfil');
    service.list.mockClear();
    submit();
    expect(service.create).toHaveBeenCalledWith({ name: 'Supervisor', permissions: ['rma.ver', 'relatorios.ver'] });
    expect(dialog()).toBeNull();
    expect(element.querySelector('.alert-banner--success')?.textContent).toContain('Perfil Supervisor cadastrado com sucesso.');
    expect(service.list).toHaveBeenCalledTimes(1);
    expect(service.invalidateOptions).toHaveBeenCalled();
  });

  it('marks and clears a whole module before saving', async () => {
    await mount();
    open(() => component.openEditModal(TECHNICIAN));
    const action = (index: number, label: string) => Array.from(moduleSets()[index].querySelectorAll<HTMLButtonElement>('button'))
      .find((button) => button.textContent?.trim() === label)!;
    action(2, 'Marcar todas').click();
    action(0, 'Limpar').click();
    fixture.detectChanges();
    submit();
    expect(service.update).toHaveBeenCalledWith(3, { name: 'Técnico', permissions: ['pecas.ver', 'pecas.movimentar', 'pecas.reservar'] });
  });

  it('edits profile and refreshes own session after save', async () => {
    await mount();
    open(() => component.openEditModal(TECHNICIAN));
    expect(dialog()!.querySelector('h3')?.textContent?.trim()).toBe('Editar perfil');
    expect(nameInput().value).toBe('Técnico');
    expect(checkbox('Alterar status').checked).toBe(true);
    expect(checkbox('Abrir RMAs').checked).toBe(false);
    checkbox('Alterar status').click();
    fixture.detectChanges();
    expect(submitButton().textContent?.trim()).toBe('Salvar alterações');
    submit();
    expect(service.update).toHaveBeenCalledWith(3, { name: 'Técnico', permissions: ['rma.ver', 'rma.diagnosticar', 'pecas.ver'] });
    expect(refreshSession).toHaveBeenCalledOnce();
    expect(element.querySelector('.alert-banner--success')?.textContent).toContain('Perfil Técnico atualizado com sucesso.');
  });

  it('duplicates as "Cópia de X" with same permissions', async () => {
    await mount();
    open(() => component.openDuplicateModal(TECHNICIAN));
    expect(dialog()!.querySelector('h3')?.textContent?.trim()).toBe('Duplicar perfil');
    expect(nameInput().value).toBe('Cópia de Técnico');
    submit();
    expect(service.create).toHaveBeenCalledWith({ name: 'Cópia de Técnico', permissions: ['rma.ver', 'rma.status', 'rma.diagnosticar', 'pecas.ver'] });
    expect(service.update).not.toHaveBeenCalled();
  });

  it('truncates duplicate name to 60 chars', async () => {
    await mount();
    open(() => component.openDuplicateModal({ ...TECHNICIAN, name: 'N'.repeat(60) }));
    expect(nameInput().value).toBe(`Cópia de ${'N'.repeat(51)}`);
    expect(nameInput().value.length).toBe(60);
  });

  it('shows server error in modal-feedback and keeps the dialog open', async () => {
    await mount();
    service.create.mockImplementation(() => badRequest('Você não pode conceder permissões que não possui.'));
    open(() => component.openCreateModal());
    setName('Supervisor');
    submit();
    expect(dialog()!.querySelector('.modal-feedback[role="alert"]')?.textContent?.trim()).toBe('Você não pode conceder permissões que não possui.');
    expect(nameError()).toBeNull();
    expect(submitButton().disabled).toBe(false);
  });

  it('shows the duplicate name from the server by the name field', async () => {
    await mount();
    service.create.mockImplementation(() => badRequest('Já existe um perfil com o nome Supervisor.'));
    open(() => component.openCreateModal());
    setName('Supervisor');
    submit();
    expect(nameError()?.textContent?.trim()).toBe('Já existe um perfil com o nome Supervisor.');
    expect(nameInput().getAttribute('aria-invalid')).toBe('true');
    expect(dialog()!.querySelector('.modal-feedback')).toBeNull();
    setName('Supervisor 2');
    expect(nameError()).toBeNull();
  });

  it('keeps the dialog open and blocks closing while saving', async () => {
    await mount();
    const pending = new Subject<ProfileResponse>();
    service.create.mockImplementation(() => pending);
    open(() => component.openCreateModal());
    setName('Supervisor');
    submit();
    expect(submitButton().disabled).toBe(true);
    expect(submitButton().textContent?.trim()).toBe('Salvando...');
    component.closeModal();
    fixture.detectChanges();
    expect(dialog()).not.toBeNull();
    pending.next(SUPERVISOR); pending.complete(); fixture.detectChanges();
    expect(dialog()).toBeNull();
  });

  it('confirms and deletes', async () => {
    await mount();
    open(() => component.openDeleteModal(SUPERVISOR));
    expect(alertDialog()!.querySelector('h3')?.textContent?.trim()).toBe('Excluir perfil');
    expect(alertDialog()!.classList).toContain('modal-panel--narrow');
    expect(alertDialog()!.textContent).toContain('Supervisor');
    expectCancelBeforePrimary(alertDialog()!);
    service.list.mockClear();
    Array.from(alertDialog()!.querySelectorAll('button')).find((button) => button.textContent?.trim() === 'Excluir perfil')!.click();
    fixture.detectChanges();
    expect(service.delete).toHaveBeenCalledWith(5);
    expect(alertDialog()).toBeNull();
    expect(element.querySelector('.alert-banner--success')?.textContent).toContain('Perfil Supervisor excluído com sucesso.');
    expect(service.list).toHaveBeenCalledTimes(1);
    expect(service.invalidateOptions).toHaveBeenCalled();
  });

  it('keeps the server refusal inside the delete confirmation', async () => {
    await mount();
    service.delete.mockImplementation(() => badRequest('Perfil migrado não pode ser excluído.'));
    open(() => component.openDeleteModal(SUPERVISOR));
    Array.from(alertDialog()!.querySelectorAll('button')).find((button) => button.textContent?.trim() === 'Excluir perfil')!.click();
    fixture.detectChanges();
    expect(alertDialog()!.querySelector('.modal-feedback[role="alert"]')?.textContent?.trim()).toBe('Perfil migrado não pode ser excluído.');
    expect(element.querySelector('.alert-banner--success')).toBeNull();
  });

  it('disables submit when catalog fails', async () => {
    await mount({ catalog: () => throwError(() => new HttpErrorResponse({ status: 503 })) });
    open(() => component.openCreateModal());
    expect(dialog()!.querySelector('.modal-feedback[role="alert"] strong')?.textContent?.trim()).toBe('Não foi possível carregar as permissões.');
    expect(moduleSets().length).toBe(0);
    expect(submitButton().disabled).toBe(true);
    setName('Supervisor');
    submit();
    expect(service.create).not.toHaveBeenCalled();
  });

  it('retries the catalog from the dialog alert', async () => {
    let fail = true;
    await mount({ catalog: () => fail ? throwError(() => new HttpErrorResponse({ status: 503 })) : of(PERMISSION_CATALOG) });
    open(() => component.openCreateModal());
    fail = false;
    Array.from(dialog()!.querySelectorAll<HTMLButtonElement>('.modal-feedback button'))
      .find((button) => button.textContent?.trim() === 'Tentar novamente')!.click();
    fixture.detectChanges();
    expect(service.permissionCatalog).toHaveBeenCalledTimes(2);
    expect(dialog()!.querySelector('.modal-feedback')).toBeNull();
    expect(moduleSets().length).toBe(6);
    expect(submitButton().disabled).toBe(false);
  });

  it('retries the catalog when the dialog opens again after a failure', async () => {
    let fail = true;
    await mount({ catalog: () => fail ? throwError(() => new HttpErrorResponse({ status: 503 })) : of(PERMISSION_CATALOG) });
    open(() => component.openCreateModal());
    component.closeModal();
    fail = false;
    open(() => component.openCreateModal());
    expect(dialog()!.querySelector('.modal-feedback')).toBeNull();
    expect(moduleSets().length).toBe(6);
    expect(submitButton().disabled).toBe(false);
  });
});

describe('ProfilesComponent catalog requests', () => {
  it('loads catalog once per screen', async () => {
    await TestBed.configureTestingModule({
      imports: [ProfilesComponent],
      providers: [provideHttpClient(), provideHttpClientTesting(), { provide: AuthService, useValue: { refreshSession: () => of(null) } }]
    }).compileComponents();
    const http = TestBed.inject(HttpTestingController);
    const fixture = TestBed.createComponent(ProfilesComponent);
    const component = fixture.componentInstance as unknown as ProfilesHarness;
    fixture.detectChanges();
    http.expectOne((request) => request.url === '/api/profiles').flush(buildProfilePage([SUPERVISOR]));

    component.openCreateModal(); fixture.detectChanges();
    http.match('/api/permissions').forEach((request) => request.flush(PERMISSION_CATALOG));
    component.closeModal(); fixture.detectChanges();
    component.openEditModal(SUPERVISOR); fixture.detectChanges();
    http.expectNone('/api/permissions');
    http.verify();
    expect(TestBed.inject(ProfileService)).toBeDefined();
  });
});

describe('ProfilesComponent dialog focus', () => {
  let restoreModality: () => void;

  beforeEach(() => { restoreModality = simulateNativeModality(); });
  afterEach(() => { TestBed.resetTestingModule(); restoreModality(); });

  it('focuses the name from Novo perfil and returns to it on Escape', async () => {
    await TestBed.configureTestingModule({
      imports: [ProfilesComponent],
      providers: [
        provideRouter([{ path: '', component: ProfilesComponent }]),
        { provide: AuthService, useValue: { refreshSession: () => of(null) } },
        { provide: ProfileService, useValue: { list: () => of(buildProfilePage([SUPERVISOR])), permissionCatalog: () => of(PERMISSION_CATALOG), invalidateOptions: () => undefined } }
      ]
    }).compileComponents();
    const { fixture, element } = await mountUnderRoot(ProfilesComponent);
    const render = () => { fixture.detectChanges(); TestBed.tick(); };
    render();
    const trigger = Array.from(element.querySelectorAll<HTMLButtonElement>('.page-heading button')).find((button) => button.textContent?.includes('Novo perfil'))!;
    trigger.focus();
    trigger.click();
    render();
    expect(document.activeElement).toBe(element.querySelector('[formcontrolname="name"]'));
    const escape = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
    document.activeElement!.dispatchEvent(escape);
    render();
    expect(element.querySelector('[role="dialog"]')).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });
});
