import { Component, computed, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Observable, finalize } from 'rxjs';
import { ROLE_LABELS, ROLE_OPTIONS } from '../../core/mock-data';
import {
  UserAccountRequest,
  UserAccountResponse,
  UserAccountUpdateRequest,
  UserRole
} from '../../core/models';
import { AuthService } from '../../core/services/auth.service';
import { CatalogService } from '../../core/services/catalog.service';
import {
  countDistinct,
  extractHttpErrorMessage,
  formatDateTime,
  includesQuery
} from '../../core/utils/catalog-ui';
import {
  CustomSelectComponent,
  CustomSelectOption
} from '../../shared/form-controls/custom-select/custom-select.component';

type UserFormControlName = 'username' | 'fullName' | 'password' | 'role' | 'active';
type UserStatusFilter = 'all' | 'active' | 'inactive';
type UserModalMode = 'create' | 'edit';

const USER_LIMITS = { fullName: 60, username: 30 } as const;

@Component({
  selector: 'app-users',
  imports: [ReactiveFormsModule, CustomSelectComponent],
  templateUrl: './users.component.html',
  styles: [`
    :host { display: block; }

    .user-actions { display: flex; gap: 0.45rem; }

    .user-form-modal {
      width: min(100%, 780px);
    }

    .user-form-modal .modal-header {
      padding-bottom: 1rem;
      border-bottom: 1px solid var(--line);
    }

    .user-form {
      gap: 0.85rem 1rem;
    }

    .user-form .field-group {
      grid-template-rows: auto;
    }

    .user-status-card {
      display: flex;
      align-items: center;
      min-height: 44px;
      padding: 0.6rem 0.85rem;
      border: 1px solid var(--line);
      border-radius: var(--radius-sm);
      background: var(--surface-alt);
    }

    .user-status-card input {
      width: 18px;
      height: 18px;
      accent-color: var(--brand-blue);
    }

    .user-status-card strong {
      color: var(--text);
      font-size: 0.95rem;
      line-height: 1.2;
    }

    .field-hint {
      color: var(--muted);
      font-size: 0.82rem;
      font-weight: 400;
      line-height: 1.35;
    }

    .button-secondary--danger { border-color: #efc7cf; color: var(--danger-text); }
    .button-secondary--danger:hover { background: var(--danger-bg); }
    .button-primary--danger { background: var(--danger-text); }
    .button-primary--danger:hover { background: #7f3441; }

    .delete-confirmation { margin: 0 0 1.25rem; color: var(--muted); line-height: 1.55; }
    .delete-confirmation strong { color: var(--brand-blue-deep); }
    .modal-feedback { margin-bottom: 1rem; }
  `]
})
export class UsersComponent {
  private readonly formBuilder = inject(FormBuilder);
  private readonly catalogService = inject(CatalogService);
  private readonly authService = inject(AuthService);

  protected readonly loading = signal(true);
  protected readonly submitting = signal(false);
  protected readonly deletingUserId = signal<number | null>(null);
  protected readonly errorMessage = signal('');
  protected readonly modalErrorMessage = signal('');
  protected readonly deleteModalErrorMessage = signal('');
  protected readonly successMessage = signal('');
  protected readonly searchTerm = signal('');
  protected readonly roleFilter = signal<UserRole | ''>('');
  protected readonly statusFilter = signal<UserStatusFilter>('all');
  protected readonly activeModal = signal<UserModalMode | null>(null);

  private readonly usersSignal = signal<UserAccountResponse[]>([]);
  private readonly editingUserSignal = signal<UserAccountResponse | null>(null);
  private readonly deletingUserSignal = signal<UserAccountResponse | null>(null);

  protected readonly users = this.usersSignal.asReadonly();
  protected readonly editingUser = this.editingUserSignal.asReadonly();
  protected readonly deletingUser = this.deletingUserSignal.asReadonly();
  protected readonly roleOptions = ROLE_OPTIONS;
  protected readonly roleFilterOptions = ROLE_FILTER_OPTIONS;
  protected readonly statusFilterOptions = STATUS_FILTER_OPTIONS;
  protected readonly userRoleOptions = USER_ROLE_OPTIONS;
  protected readonly limits = USER_LIMITS;

  protected readonly filteredUsers = computed(() =>
    [...this.usersSignal()]
      .sort((left, right) => left.fullName.localeCompare(right.fullName, 'pt-BR', { sensitivity: 'base' }))
      .filter((user) => {
        const matchesText = includesQuery(
          this.searchTerm(),
          user.fullName,
          user.username,
          this.roleLabel(user.role)
        );
        const matchesRole = !this.roleFilter() || user.role === this.roleFilter();
        const matchesStatus =
          this.statusFilter() === 'all' ||
          (this.statusFilter() === 'active' && user.active) ||
          (this.statusFilter() === 'inactive' && !user.active);

        return matchesText && matchesRole && matchesStatus;
      })
  );

  protected readonly totalUsers = computed(() => this.usersSignal().length);
  protected readonly activeUsers = computed(() => this.usersSignal().filter((user) => user.active).length);
  protected readonly adminUsers = computed(() => this.usersSignal().filter((user) => user.role === 'ADMIN').length);
  protected readonly roleCount = computed(() => countDistinct(this.usersSignal().map((user) => user.role)));

  protected readonly form = this.formBuilder.nonNullable.group({
    username: ['', [Validators.required, Validators.maxLength(USER_LIMITS.username)]],
    fullName: ['', [Validators.required, Validators.maxLength(USER_LIMITS.fullName)]],
    password: ['', [Validators.required, Validators.minLength(6), Validators.maxLength(120)]],
    role: ['SERVICE_DESK' as UserRole, [Validators.required]],
    active: [true]
  });

  constructor() {
    this.loadUsers();
  }

  protected updateSearch(value: string): void {
    this.searchTerm.set(value);
  }

  protected updateRoleFilter(value: UserRole | ''): void {
    this.roleFilter.set(value);
  }

  protected updateStatusFilter(value: UserStatusFilter): void {
    this.statusFilter.set(value);
  }

  protected openCreateModal(): void {
    this.editingUserSignal.set(null);
    this.configurePasswordValidation(true);
    this.form.reset(emptyUserForm());
    this.activeModal.set('create');
    this.clearMessages();
  }

  protected openEditModal(user: UserAccountResponse): void {
    this.editingUserSignal.set(user);
    this.configurePasswordValidation(false);
    this.form.reset({
      username: user.username,
      fullName: user.fullName,
      password: '',
      role: user.role,
      active: user.active
    });
    this.activeModal.set('edit');
    this.clearMessages();
  }

  protected closeModal(): void {
    this.activeModal.set(null);
    this.modalErrorMessage.set('');
  }

  protected saveUser(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      this.modalErrorMessage.set('Revise os campos destacados antes de salvar o usuário.');
      return;
    }

    const rawValue = this.form.getRawValue();
    const currentUser = this.editingUserSignal();
    const request$: Observable<UserAccountResponse> = currentUser
      ? this.catalogService.updateUser(currentUser.id, buildUserUpdatePayload(rawValue))
      : this.catalogService.createUser(buildUserPayload(rawValue));

    this.submitting.set(true);
    this.clearMessages();

    request$.pipe(
      finalize(() => this.submitting.set(false))
    ).subscribe({
      next: (user) => {
        this.successMessage.set(
          currentUser
            ? `Usuário ${user.fullName} atualizado com sucesso.`
            : `Usuário ${user.fullName} cadastrado com sucesso.`
        );
        this.closeModal();
        this.loadUsers();
      },
      error: (error) => {
        this.modalErrorMessage.set(
          extractHttpErrorMessage(error, 'Não foi possível salvar o usuário agora.')
        );
      }
    });
  }

  protected openDeleteModal(user: UserAccountResponse): void {
    if (this.isCurrentUser(user)) {
      return;
    }

    this.deletingUserSignal.set(user);
    this.clearMessages();
  }

  protected closeDeleteModal(): void {
    if (this.deletingUserId() !== null) {
      return;
    }

    this.resetDeleteModal();
  }

  protected confirmDeleteUser(): void {
    const user = this.deletingUserSignal();

    if (!user || this.deletingUserId() !== null) {
      return;
    }

    this.deletingUserId.set(user.id);
    this.clearMessages();

    this.catalogService.deleteUser(user.id).pipe(
      finalize(() => this.deletingUserId.set(null))
    ).subscribe({
      next: () => {
        this.usersSignal.update((users) =>
          users.filter((currentUser) => currentUser.id !== user.id)
        );
        this.successMessage.set(`Usuário ${user.fullName} excluído com sucesso.`);
        this.resetDeleteModal();
      },
      error: (error) => {
        this.deleteModalErrorMessage.set(
          extractHttpErrorMessage(error, 'Não foi possível excluir o usuário agora.')
        );
      }
    });
  }

  protected isCurrentUser(user: UserAccountResponse): boolean {
    return user.username.toLocaleLowerCase('pt-BR') ===
      this.authService.currentUser()?.username.toLocaleLowerCase('pt-BR');
  }

  protected roleLabel(role: UserRole): string {
    return ROLE_LABELS[role];
  }

  protected hasError(controlName: UserFormControlName): boolean {
    const control = this.form.controls[controlName];
    return control.invalid && (control.dirty || control.touched);
  }

  protected updatedAtLabel(user: UserAccountResponse): string {
    return formatDateTime(user.updatedAt);
  }

  protected statusClass(user: UserAccountResponse): string {
    return user.active ? 'status-pill status-online' : 'status-pill status-offline';
  }

  private loadUsers(): void {
    this.loading.set(true);
    this.errorMessage.set('');

    this.catalogService.listUsers().pipe(
      finalize(() => this.loading.set(false))
    ).subscribe({
      next: (users) => this.usersSignal.set(users),
      error: (error) => {
        this.errorMessage.set(extractHttpErrorMessage(error, 'Não foi possível carregar os usuários.'));
      }
    });
  }

  private clearMessages(): void {
    this.errorMessage.set('');
    this.modalErrorMessage.set('');
    this.deleteModalErrorMessage.set('');
    this.successMessage.set('');
  }

  private configurePasswordValidation(required: boolean): void {
    const validators = [Validators.minLength(6), Validators.maxLength(120)];
    this.form.controls.password.setValidators(required ? [Validators.required, ...validators] : validators);
    this.form.controls.password.updateValueAndValidity({ emitEvent: false });
  }

  private resetDeleteModal(): void {
    this.deletingUserSignal.set(null);
    this.deleteModalErrorMessage.set('');
  }
}

function emptyUserForm(): ReturnType<UsersComponent['form']['getRawValue']> {
  return {
    username: '',
    fullName: '',
    password: '',
    role: 'SERVICE_DESK',
    active: true
  };
}

function buildUserPayload(raw: ReturnType<UsersComponent['form']['getRawValue']>): UserAccountRequest {
  return {
    username: raw.username.trim(),
    fullName: raw.fullName.trim(),
    password: raw.password,
    role: raw.role,
    active: raw.active
  };
}

function buildUserUpdatePayload(
  raw: ReturnType<UsersComponent['form']['getRawValue']>
): UserAccountUpdateRequest {
  return {
    username: raw.username.trim(),
    fullName: raw.fullName.trim(),
    password: raw.password || null,
    role: raw.role,
    active: raw.active
  };
}

const ROLE_FILTER_OPTIONS: ReadonlyArray<CustomSelectOption<UserRole | ''>> = [
  { value: '', label: 'Todos' },
  ...ROLE_OPTIONS.map((role) => ({
    value: role,
    label: ROLE_LABELS[role]
  }))
];

const STATUS_FILTER_OPTIONS: ReadonlyArray<CustomSelectOption<UserStatusFilter>> = [
  { value: 'all', label: 'Todos' },
  { value: 'active', label: 'Ativos' },
  { value: 'inactive', label: 'Inativos' }
];

const USER_ROLE_OPTIONS: ReadonlyArray<CustomSelectOption<UserRole>> = ROLE_OPTIONS.map((role) => ({
  value: role,
  label: ROLE_LABELS[role]
}));
