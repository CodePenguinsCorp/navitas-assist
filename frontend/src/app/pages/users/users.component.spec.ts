import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FormGroup } from '@angular/forms';
import { of } from 'rxjs';
import { UserAccountResponse } from '../../core/models';
import { AuthService } from '../../core/services/auth.service';
import { CatalogService } from '../../core/services/catalog.service';
import { UsersComponent } from './users.component';

const USER: UserAccountResponse = { id: 2, username: 'operator', fullName: 'Operator', role: 'VIEWER', active: true,
  createdAt: '2026-10-20T12:00:00Z', updatedAt: '2026-10-20T12:00:00Z' };
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
      { provide: CatalogService, useValue: { listUsers: () => of([USER]), createUser, updateUser } },
      { provide: AuthService, useValue: { currentUser: () => null } }
    ] }).compileComponents();
    fixture = TestBed.createComponent(UsersComponent);
    component = fixture.componentInstance as unknown as UsersHarness;
    fixture.detectChanges();
  });

  it.each(EXCESSIVE)('blocks excessive $name passwords in creation and editing', ({ password }) => {
    component.openCreateModal();
    component.form.patchValue({ username: 'new.user', fullName: 'New user', password });
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
    component.form.patchValue({ username: 'new.user', fullName: 'New user', password });
    component.saveUser();
    expect(createUser).toHaveBeenCalledWith(expect.objectContaining({ password }));

    component.openEditModal(USER);
    component.form.patchValue({ password });
    component.saveUser();
    expect(updateUser).toHaveBeenCalledWith(USER.id, expect.objectContaining({ password }));
  });

  it('requires a password on creation and sends null when an edited password is left empty', () => {
    component.openCreateModal();
    component.form.patchValue({ username: 'new.user', fullName: 'New user', password: '' });
    component.saveUser();
    expect(createUser).not.toHaveBeenCalled();

    component.openEditModal(USER);
    component.saveUser();
    expect(updateUser).toHaveBeenCalledWith(USER.id, expect.objectContaining({ password: null }));
  });

  it('keeps the existing minimum length in both modes', () => {
    component.openCreateModal();
    component.form.patchValue({ username: 'new.user', fullName: 'New user', password: '12345' });
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
