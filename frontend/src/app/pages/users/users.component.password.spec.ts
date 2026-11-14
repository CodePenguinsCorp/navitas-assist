import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FormGroup } from '@angular/forms';
import { of, throwError } from 'rxjs';
import { UserAccountResponse } from '../../core/models';
import { AuthService } from '../../core/services/auth.service';
import { CatalogService } from '../../core/services/catalog.service';
import { ProfileService } from '../../core/services/profile.service';
import { PERMISSION_CATALOG } from '../../testing/profile-fixtures';
import { UsersComponent } from './users.component';

const USER: UserAccountResponse = { id: 2, username: 'operator', fullName: 'Operator', profile: { id: 4, name: 'Consulta' }, extraPermissions: [], active: true,
  updatedAt: '2026-10-20T12:00:00Z' };
const EXCESSIVE = [{ name: 'ASCII', password: 'a'.repeat(73) }, { name: 'accented', password: 'á'.repeat(37) },
  { name: 'emoji', password: '😀'.repeat(19) }, { name: 'Unicode whitespace', password: '\u3000'.repeat(25) }];
const VALID = [{ name: 'ASCII boundary', password: 'a'.repeat(72) }, { name: 'accented boundary', password: 'á'.repeat(36) },
  { name: 'emoji boundary', password: '😀'.repeat(18) }, { name: 'spaces', password: ' padded-password ' }];

describe('UsersComponent password boundaries', () => {
  let fixture: ComponentFixture<UsersComponent>;
  let component: UsersHarness;
  let createUser: ReturnType<typeof vi.fn>;
  let updateUser: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    createUser = vi.fn(() => of(USER));
    updateUser = vi.fn(() => of(USER));
    await TestBed.configureTestingModule({ imports: [UsersComponent], providers: [
      { provide: CatalogService, useValue: { listUsers: () => of({ content: [USER], page: 0, size: 20, totalElements: 1, totalPages: 1 }), getUserSummary: () => of({ total: 1 }), createUser, updateUser } },
      { provide: AuthService, useValue: { currentUser: () => null, refreshSession: () => of(null) } },
      { provide: ProfileService, useValue: { options: () => of([{ id: 4, name: 'Consulta', permissions: [] }]), permissionCatalog: () => of(PERMISSION_CATALOG), invalidateOptions: () => undefined } }
    ] }).compileComponents();
    fixture = TestBed.createComponent(UsersComponent);
    component = fixture.componentInstance as unknown as UsersHarness;
    fixture.detectChanges();
  });

  it('envia email normalizado e limpa com null na edição', () => {
    component.openCreateModal();
    component.form.patchValue({ username: 'new.user', fullName: 'New user', profileId: 4, password: '123456', email: ' Test@Example.com ' });
    component.saveUser();
    expect(createUser).toHaveBeenCalledWith(expect.objectContaining({ email: 'test@example.com' }));
    component.openEditModal({ ...USER, email: 'test@example.com' });
    expect(component.form.get('email')?.value).toBe('test@example.com');
    component.form.patchValue({ email: '' });
    component.saveUser();
    expect(updateUser).toHaveBeenCalledWith(USER.id, expect.objectContaining({ email: null, password: null }));
  });

  it.each(['a@b', 'a@example.com\r\n', 'a,b@example.com', 'a'.repeat(243) + '@example.com'])('bloqueia email inválido %s', (email) => {
    component.openEditModal(USER);
    component.form.patchValue({ email });
    component.saveUser();
    expect(updateUser).not.toHaveBeenCalled();
    expect(component.form.get('email')?.invalid).toBe(true);
  });

  it('aceita email com 254 caracteres', () => {
    component.openEditModal(USER);
    component.form.patchValue({ email: 'a'.repeat(242) + '@example.com' });
    component.saveUser();
    expect(updateUser).toHaveBeenCalled();
  });

  it('mantém o modal e mostra erro do backend inline', () => {
    updateUser.mockReturnValueOnce(throwError(() => ({ error: { message: 'Email already registered.' } })));
    component.openEditModal(USER);
    component.form.patchValue({ email: 'test@example.com' }); component.saveUser(); fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[role="dialog"] [role="alert"]')?.textContent).toContain('Email already registered.');
    expect(component.form.get('email')?.value).toBe('test@example.com');
  });

  it.each(EXCESSIVE)('blocks excessive $name passwords in creation and editing', ({ password }) => {
    component.openCreateModal();
    component.form.patchValue({ username: 'new.user', fullName: 'New user', profileId: 4, password });
    component.saveUser();
    expect(createUser).not.toHaveBeenCalled();
    expect(component.form.controls['password'].invalid).toBe(true);
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Senha muito longa');

    component.openEditModal(USER);
    component.form.patchValue({ password });
    component.saveUser();
    expect(updateUser).not.toHaveBeenCalled();
    expect(component.form.controls['password'].invalid).toBe(true);
  });

  it.each(VALID)('submits a valid $name password without trimming it', ({ password }) => {
    component.openCreateModal();
    component.form.patchValue({ username: 'new.user', fullName: 'New user', profileId: 4, password });
    component.saveUser();
    expect(createUser).toHaveBeenCalledWith(expect.objectContaining({ password }));

    component.openEditModal(USER);
    component.form.patchValue({ password });
    component.saveUser();
    expect(updateUser).toHaveBeenCalledWith(USER.id, expect.objectContaining({ password }));
  });

  it('requires a password on creation and sends null when an edited password is left empty', () => {
    component.openCreateModal();
    component.form.patchValue({ username: 'new.user', fullName: 'New user', profileId: 4, password: '' });
    component.saveUser();
    expect(createUser).not.toHaveBeenCalled();

    component.openEditModal(USER);
    component.saveUser();
    expect(updateUser).toHaveBeenCalledWith(USER.id, expect.objectContaining({ password: null }));
  });

  it('keeps the existing minimum length in both modes', () => {
    component.openCreateModal();
    component.form.patchValue({ username: 'new.user', fullName: 'New user', profileId: 4, password: '12345' });
    component.saveUser();
    expect(createUser).not.toHaveBeenCalled();
    component.openEditModal(USER);
    component.form.patchValue({ password: '12345' });
    component.saveUser();
    expect(updateUser).not.toHaveBeenCalled();
  });
});

interface UsersHarness {
  form: FormGroup;
  openCreateModal(): void;
  openEditModal(user: UserAccountResponse): void;
  saveUser(): void;
}
