import { Component, computed, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { finalize } from 'rxjs';
import { ROLE_LABELS, ROLE_OPTIONS } from '../../core/mock-data';
import { UserAccountRequest, UserAccountResponse, UserRole } from '../../core/models';
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

@Component({
  selector: 'app-users',
  imports: [ReactiveFormsModule, CustomSelectComponent],
  templateUrl: './users.component.html',
  styles: [':host { display: block; }']
})
export class UsersComponent {
  private readonly formBuilder = inject(FormBuilder);
  private readonly catalogService = inject(CatalogService);

  protected readonly loading = signal(true);
  protected readonly submitting = signal(false);
  protected readonly errorMessage = signal('');
  protected readonly successMessage = signal('');
  protected readonly searchTerm = signal('');
  protected readonly roleFilter = signal<UserRole | ''>('');
  protected readonly statusFilter = signal<UserStatusFilter>('all');
  protected readonly createModalOpen = signal(false);

  private readonly usersSignal = signal<UserAccountResponse[]>([]);

  protected readonly users = this.usersSignal.asReadonly();
  protected readonly roleOptions = ROLE_OPTIONS;
  protected readonly roleFilterOptions = ROLE_FILTER_OPTIONS;
  protected readonly statusFilterOptions = STATUS_FILTER_OPTIONS;
  protected readonly userRoleOptions = USER_ROLE_OPTIONS;

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
    username: ['', [Validators.required, Validators.maxLength(60)]],
    fullName: ['', [Validators.required, Validators.maxLength(120)]],
    password: ['', [Validators.required, Validators.minLength(6), Validators.maxLength(120)]],
    role: ['SERVICE_DESK' as UserRole, [Validators.required]],
    active: [true]
  });

  constructor() {
    this.loadUsers();
  }

  protected refresh(): void {
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
    this.form.reset(emptyUserForm());
    this.createModalOpen.set(true);
    this.clearMessages();
  }

  protected closeModal(): void {
    this.createModalOpen.set(false);
  }

  protected saveUser(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      this.errorMessage.set('Preencha os campos obrigatórios do usuário.');
      this.successMessage.set('');
      return;
    }

    const payload = buildUserPayload(this.form.getRawValue());

    this.submitting.set(true);
    this.clearMessages();

    this.catalogService.createUser(payload).pipe(
      finalize(() => this.submitting.set(false))
    ).subscribe({
      next: (user) => {
        this.successMessage.set(`Usuário ${user.fullName} cadastrado com sucesso.`);
        this.closeModal();
        this.loadUsers();
      },
      error: (error) => {
        this.errorMessage.set(extractHttpErrorMessage(error, 'Não foi possível salvar o usuário agora.'));
      }
    });
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
    this.successMessage.set('');
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
