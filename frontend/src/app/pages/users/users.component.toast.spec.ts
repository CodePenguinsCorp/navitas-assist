import { TestBed } from '@angular/core/testing';
import { FormGroup } from '@angular/forms';
import { of } from 'rxjs';
import { UserAccountResponse } from '../../core/models';
import { AuthService } from '../../core/services/auth.service';
import { CatalogService } from '../../core/services/catalog.service';
import { ProfileService } from '../../core/services/profile.service';
import { ToastOutletComponent } from '../../shared/toast-outlet/toast-outlet.component';
import { providePermissions } from '../../testing/permission-fixtures';
import { PERMISSION_CATALOG } from '../../testing/profile-fixtures';
import { toastMessages, toastTones } from '../../testing/toast';
import { UsersComponent } from './users.component';

const USER: UserAccountResponse = { id: 2, username: 'operator', fullName: 'Operator', profile: { id: 4, name: 'Consulta' }, extraPermissions: [], active: true,
  updatedAt: '2026-10-20T12:00:00Z' };

interface Harness {
  form: FormGroup;
  openCreateModal(): void;
  openEditModal(user: UserAccountResponse): void;
  saveUser(): void;
  openDeleteModal(user: UserAccountResponse): void;
  confirmDeleteUser(): void;
}

describe('UsersComponent avisos de sucesso', () => {
  async function mount() {
    await TestBed.configureTestingModule({ imports: [UsersComponent], providers: [
      providePermissions(['usuarios.gerir']),
      { provide: CatalogService, useValue: {
        listUsers: () => of({ content: [USER], page: 0, size: 20, totalElements: 1, totalPages: 1 }), getUserSummary: () => of({ total: 1 }),
        createUser: () => of(USER), updateUser: () => of(USER), deleteUser: () => of(undefined)
      } },
      { provide: AuthService, useValue: { currentUser: () => null, refreshSession: () => of(null) } },
      { provide: ProfileService, useValue: { options: () => of([{ id: 4, name: 'Consulta', permissions: [] }]), permissionCatalog: () => of(PERMISSION_CATALOG), invalidateOptions: () => undefined } }
    ] }).compileComponents();
    const fixture = TestBed.createComponent(UsersComponent);
    fixture.detectChanges();
    return { fixture, component: fixture.componentInstance as unknown as Harness };
  }

  it('avisa cadastro, atualização e exclusão em avisos flutuantes sem aviso fixo na página', async () => {
    const { fixture, component } = await mount();
    component.openCreateModal();
    component.form.patchValue({ username: 'new.user', fullName: 'New user', profileId: 4, password: '123456' });
    component.saveUser(); fixture.detectChanges();
    component.openEditModal(USER);
    component.saveUser(); fixture.detectChanges();
    component.openDeleteModal(USER);
    component.confirmDeleteUser(); fixture.detectChanges();
    expect(toastMessages()).toEqual(['Usuário Operator cadastrado.', 'Usuário Operator atualizado.', 'Usuário Operator excluído.']);
    expect(toastTones()).toEqual(['success', 'success', 'success']);
    expect(fixture.nativeElement.querySelector('[role="status"], .alert-banner--success')).toBeNull();
  });

  it('mostra o aviso no popup da raiz', async () => {
    const { fixture, component } = await mount();
    const outlet = TestBed.createComponent(ToastOutletComponent);
    component.openDeleteModal(USER);
    component.confirmDeleteUser(); fixture.detectChanges(); outlet.detectChanges(); TestBed.tick();
    expect(outlet.nativeElement.querySelector('[role="status"]')?.textContent).toContain('Usuário Operator excluído.');
  });
});
