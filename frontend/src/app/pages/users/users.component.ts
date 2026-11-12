import { initialsOf } from '../../core/utils/rma-ui';
import { IconComponent } from '../../shared/icon/icon.component';
import { Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, ValidatorFn, Validators } from '@angular/forms';
import { Observable, Subject, debounceTime, filter, finalize } from 'rxjs';
import {
  PermissionModuleResponse,
  ProfileOption,
  UserAccountRequest,
  UserAccountResponse,
  UserAccountUpdateRequest,
  UserSummaryResponse
} from '../../core/models';
import { PERMISSIONS, Permission, isPermission } from '../../core/permissions';
import { AuthService } from '../../core/services/auth.service';
import { CatalogService } from '../../core/services/catalog.service';
import { ProfileService } from '../../core/services/profile.service';
import { extractHttpErrorMessage, formatDateTime } from '../../core/utils/catalog-ui';
import { PagedList } from '../../core/utils/paged-list';
import { SEARCH_DEBOUNCE_MS } from '../../core/utils/pagination';
import {
  CustomSelectComponent,
  CustomSelectOption
} from '../../shared/form-controls/custom-select/custom-select.component';
import { ModalFocusDirective } from '../../shared/modal-focus/modal-focus.directive';
import { PageHeaderComponent } from '../../shared/page-header/page-header.component';
import { PaginationComponent } from '../../shared/pagination/pagination.component';
import { RowActionComponent } from '../../shared/row-action/row-action.component';

type UserFormControlName = 'username' | 'fullName' | 'password' | 'profileId' | 'active';
type LoadState = 'loading' | 'ready' | 'failed';
type UserStatusFilter = 'all' | 'active' | 'inactive';
type UserModalMode = 'create' | 'edit';

const passwordByteLengthValidator: ValidatorFn = control =>
  new TextEncoder().encode(control.value || '').length > 72 ? { passwordByteLength: true } : null;

@Component({
  selector: 'app-users',
  imports: [IconComponent, ReactiveFormsModule, CustomSelectComponent, ModalFocusDirective, PaginationComponent, PageHeaderComponent, RowActionComponent],
  templateUrl: './users.component.html',
  styles: [`
    :host { display: block; }

    .user-form-modal {
      width: min(100%, 780px);
    }

    .user-form-modal .modal-header {
      padding-bottom: var(--space-4);
      border-bottom: 1px solid var(--line);
    }

    .user-form {
      gap: var(--space-3) var(--space-4);
    }

    .user-form .field-group {
      grid-template-rows: auto;
    }

    .field-hint {
      color: var(--muted);
      font-size: var(--font-size-sm);
      font-weight: 400;
      line-height: 1.35;
    }

    .permission-module {
      grid-column: 1 / -1;
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(min(100%, 240px), 1fr));
      gap: 0 var(--space-4);
      min-width: 0;
      margin: 0;
      padding: 0;
      border: 0;
    }

    .permission-module > legend {
      padding: 0;
      margin-bottom: var(--space-1);
      font-weight: var(--font-weight-semibold);
    }

    .permission-module .checkbox-field {
      align-items: flex-start;
      padding-block: 0.55rem;
      line-height: 1.35;
    }

    .permission-module .checkbox-field input { margin-top: 0.1rem; flex-shrink: 0; }
    .permission-module .checkbox-field { flex-wrap: wrap; column-gap: 0.55rem; row-gap: 0; }
    .permission-module .checkbox-field > span { flex: 1 1 0; min-width: 0; }
    .permission-module .checkbox-field > small { flex-basis: 100%; padding-left: 1.6rem; }
    .extras-pending { min-height: 4rem; }
    .extras-details { grid-column: 1 / -1; min-width: 0; }
    .extras-details > summary {
      display: flex; align-items: center; justify-content: space-between; gap: var(--space-3);
      min-height: var(--control-height); padding: 0 var(--space-3); border: 1px solid var(--btn-secondary-border, var(--line));
      border-radius: var(--radius-sm); background: var(--brand-tint); color: var(--brand-blue-deep);
      font-weight: var(--font-weight-semibold); cursor: pointer; list-style: none;
    }
    .extras-details > summary::-webkit-details-marker { display: none; }
    .extras-details > summary::after { content: ''; width: 8px; height: 8px; border: solid currentColor; border-width: 0 2px 2px 0; transform: rotate(45deg); transition: transform 160ms ease; }
    .extras-details[open] > summary::after { transform: rotate(-135deg); }
    .extras-details > summary:focus-visible { outline: none; box-shadow: var(--focus-ring); }
    .extras-modules { display: grid; gap: var(--space-3); margin-top: var(--space-3); }
  `]
})
export class UsersComponent {
  protected readonly initials = initialsOf;
  private readonly formBuilder = inject(FormBuilder);
  private readonly catalogService = inject(CatalogService);
  private readonly authService = inject(AuthService);
  private readonly profileService = inject(ProfileService);

  private readonly destroyRef = inject(DestroyRef);
  protected readonly submitting = signal(false);
  protected readonly deletingUserId = signal<number | null>(null);
  protected readonly errorMessage = signal('');
  protected readonly modalErrorMessage = signal('');
  protected readonly deleteModalErrorMessage = signal('');
  protected readonly successMessage = signal('');
  protected readonly searchTerm = signal('');
  protected readonly profileFilter = signal<number | null>(null);
  protected readonly statusFilter = signal<UserStatusFilter>('all');
  protected readonly activeModal = signal<UserModalMode | null>(null);
  /** Last list query failed; independent of the cached page and of form messages. */
  protected readonly loadFailed = signal(false);

  private readonly searchChanges = new Subject<'search' | 'cancel'>();
  private readonly userList = new PagedList<UserAccountResponse>(
    (pageQuery) => this.catalogService.listUsers({
      ...pageQuery,
      query: this.searchTerm(),
      profileId: this.profileFilter() ?? undefined,
      active: this.statusFilter() === 'all' ? undefined : this.statusFilter() === 'active'
    }),
    (error) => {
      this.loadFailed.set(true);
      this.errorMessage.set(extractHttpErrorMessage(error, 'Não foi possível carregar os usuários.'));
    },
    () => this.loadFailed.set(false)
  );
  private readonly summarySignal = signal<UserSummaryResponse>({ total: 0, active: 0, admins: 0, roles: 0 });
  private readonly editingUserSignal = signal<UserAccountResponse | null>(null);
  private readonly deletingUserSignal = signal<UserAccountResponse | null>(null);

  protected readonly users = this.userList.items;
  protected readonly loading = this.userList.loading;
  protected readonly page = this.userList.page;
  protected readonly pageSize = this.userList.size;
  protected readonly totalElements = this.userList.totalElements;
  protected readonly totalPages = this.userList.totalPages;
  protected readonly summary = this.summarySignal.asReadonly();
  protected readonly editingUser = this.editingUserSignal.asReadonly();
  protected readonly deletingUser = this.deletingUserSignal.asReadonly();
  protected readonly hasLoaded = computed(() => this.userList.result() !== null);
  protected readonly statusFilterOptions = STATUS_FILTER_OPTIONS;
  protected readonly profileOptions = signal<ProfileOption[]>([]);
  protected readonly profileOptionsState = signal<LoadState>('loading');
  protected readonly catalog = signal<PermissionModuleResponse[]>([]);
  protected readonly catalogState = signal<LoadState>('loading');
  /** Extras marcadas no diálogo. As que o perfil escolhido já inclui ficam guardadas, mas não vão no envio. */
  protected readonly extras = signal<ReadonlySet<Permission>>(new Set());
  private readonly selectedProfileId = signal<number | null>(null);
  protected readonly extrasOpen = signal(false);
  protected readonly extrasSummary = computed(() => {
    const count = PERMISSIONS.filter((code) => this.extras().has(code) && !this.profilePermissions().has(code)).length;
    return count === 0 ? 'Nenhuma permissão extra' : count === 1 ? '1 permissão extra' : `${count} permissões extras`;
  });
  protected readonly accessReady = computed(() => this.profileOptionsState() === 'ready' && this.catalogState() === 'ready');
  protected readonly accessFailed = computed(() => this.profileOptionsState() === 'failed' || this.catalogState() === 'failed');
  protected readonly profileSelectOptions = computed<ReadonlyArray<CustomSelectOption<number>>>(() =>
    this.profileOptions().map((option) => ({ value: option.id, label: option.name })));
  protected readonly profileFilterOptions = computed<ReadonlyArray<CustomSelectOption<number | ''>>>(() =>
    [{ value: '', label: 'Todos' }, ...this.profileSelectOptions()]);
  private readonly profilePermissions = computed<ReadonlySet<string>>(() =>
    new Set(this.profileOptions().find((option) => option.id === this.selectedProfileId())?.permissions ?? []));

  protected readonly form = this.formBuilder.nonNullable.group({
    username: ['', [Validators.required, Validators.maxLength(60)]],
    fullName: ['', [Validators.required, Validators.maxLength(120)]],
    password: ['', [Validators.required, Validators.minLength(6), Validators.maxLength(72), passwordByteLengthValidator]],
    profileId: [null as number | null, [Validators.required]],
    active: [true]
  });

  constructor() {
    this.searchChanges.pipe(
      debounceTime(SEARCH_DEBOUNCE_MS),
      filter((kind) => kind === 'search'),
      takeUntilDestroyed(this.destroyRef)
    ).subscribe(() => this.userList.firstPage());
    this.form.controls.profileId.valueChanges.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((id) => this.selectProfile(id));
    this.loadUsers();
    this.loadSummary();
    // O cache de opções vale o app inteiro: a tela começa com a lista atual de perfis.
    this.profileService.invalidateOptions();
    this.loadProfileOptions();
  }

  protected get hasActiveFilters(): boolean {
    return Boolean(this.searchTerm().trim()) || this.profileFilter() !== null || this.statusFilter() !== 'all';
  }

  protected updateSearch(value: string): void {
    this.searchTerm.set(value);
    this.searchChanges.next('search');
  }

  protected clearFilters(): void {
    this.searchChanges.next('cancel');
    this.searchTerm.set('');
    this.profileFilter.set(null);
    this.statusFilter.set('all');
    this.userList.firstPage();
  }

  protected retryLoad(): void {
    this.userList.reload();
  }

  protected updateProfileFilter(value: number | '' | null): void {
    this.profileFilter.set(typeof value === 'number' ? value : null);
    this.userList.firstPage();
  }

  protected updateStatusFilter(value: UserStatusFilter): void {
    this.statusFilter.set(value);
    this.userList.firstPage();
  }

  protected goToPage(page: number): void {
    this.userList.goToPage(page);
  }

  protected changePageSize(size: number): void {
    this.userList.changeSize(size);
  }

  protected openCreateModal(): void {
    this.editingUserSignal.set(null);
    this.configurePasswordValidation(true);
    this.form.reset(emptyUserForm());
    this.extras.set(new Set());
    this.extrasOpen.set(false);
    this.activeModal.set('create');
    this.clearMessages();
    this.loadAccessSources();
  }

  protected openEditModal(user: UserAccountResponse): void {
    this.editingUserSignal.set(user);
    this.configurePasswordValidation(false);
    this.form.reset({
      username: user.username,
      fullName: user.fullName,
      password: '',
      profileId: user.profile.id,
      active: user.active
    });
    this.extras.set(new Set(user.extraPermissions.filter(isPermission)));
    this.extrasOpen.set(user.extraPermissions.filter(isPermission).length > 0);
    this.selectProfile(user.profile.id);
    this.activeModal.set('edit');
    this.clearMessages();
    this.loadAccessSources();
  }

  protected closeModal(): void {
    if (this.submitting()) {
      return;
    }

    this.resetModal();
  }

  protected saveUser(): void {
    if (!this.accessReady() || this.submitting()) {
      return;
    }

    if (this.form.invalid) {
      this.form.markAllAsTouched();
      this.modalErrorMessage.set('Revise os campos destacados antes de salvar o usuário.');
      return;
    }

    const rawValue = this.form.getRawValue();
    const extraPermissions = PERMISSIONS.filter((code) => this.extras().has(code) && !this.profilePermissions().has(code));
    const currentUser = this.editingUserSignal();
    const request$: Observable<UserAccountResponse> = currentUser
      ? this.catalogService.updateUser(currentUser.id, buildUserUpdatePayload(rawValue, extraPermissions))
      : this.catalogService.createUser(buildUserPayload(rawValue, extraPermissions));

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
        this.resetModal();
        this.loadUsers();
        this.loadSummary();
        // O usuário pode ter mudado o próprio perfil ou as próprias extras.
        this.authService.refreshSession().subscribe();
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
        this.loadUsers();
        this.loadSummary();
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

  protected deleteBlockedReason(user: UserAccountResponse): string | null {
    return this.isCurrentUser(user) ? 'Você não pode excluir a própria conta.' : null;
  }

  protected extrasLabel(user: UserAccountResponse): string {
    const count = user.extraPermissions.filter(isPermission).length;
    return count === 0 ? '' : count === 1 ? '+1 extra' : `+${count} extras`;
  }

  protected includedInProfile(code: string): boolean {
    return this.profilePermissions().has(code);
  }

  protected isExtraChecked(code: string): boolean {
    return this.includedInProfile(code) || (isPermission(code) && this.extras().has(code));
  }

  protected toggleExtra(code: string, checked: boolean): void {
    if (!isPermission(code) || this.includedInProfile(code)) {
      return;
    }
    const next = new Set(this.extras());
    if (checked) next.add(code); else next.delete(code);
    this.extras.set(next);
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
    this.errorMessage.set('');
    this.userList.reload();
  }

  /** Troca de perfil: as extras ficam guardadas; o envio deixa de fora as que o perfil escolhido já inclui. */
  private selectProfile(id: number | null): void {
    this.selectedProfileId.set(id);
  }

  private loadProfileOptions(): void {
    this.profileOptionsState.set('loading');
    this.profileService.options().pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (options) => {
        this.profileOptions.set(options);
        this.profileOptionsState.set('ready');
      },
      error: () => this.profileOptionsState.set('failed')
    });
  }

  protected retryAccessSources(): void {
    this.loadAccessSources();
  }

  /** Opções e catálogo ficam guardados no serviço: só a primeira abertura (ou a seguinte a uma falha) os busca. */
  private loadAccessSources(): void {
    if (this.profileOptionsState() === 'failed') {
      this.loadProfileOptions();
    }
    if (this.catalogState() === 'ready') {
      return;
    }
    this.catalogState.set('loading');
    this.profileService.permissionCatalog().pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (catalog) => {
        this.catalog.set(catalog);
        this.catalogState.set('ready');
      },
      error: () => this.catalogState.set('failed')
    });
  }

  private loadSummary(): void {
    this.catalogService.getUserSummary().subscribe({
      next: (summary) => this.summarySignal.set(summary),
      error: () => undefined
    });
  }

  private clearMessages(): void {
    this.errorMessage.set('');
    this.modalErrorMessage.set('');
    this.deleteModalErrorMessage.set('');
    this.successMessage.set('');
  }

  private configurePasswordValidation(required: boolean): void {
    const validators = [Validators.minLength(6), Validators.maxLength(72), passwordByteLengthValidator];
    this.form.controls.password.setValidators(required ? [Validators.required, ...validators] : validators);
    this.form.controls.password.updateValueAndValidity({ emitEvent: false });
  }

  private resetModal(): void {
    this.activeModal.set(null);
    this.modalErrorMessage.set('');
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
    profileId: null,
    active: true
  };
}

function buildUserPayload(raw: ReturnType<UsersComponent['form']['getRawValue']>, extraPermissions: Permission[]): UserAccountRequest {
  return {
    username: raw.username.trim(),
    fullName: raw.fullName.trim(),
    password: raw.password,
    profileId: raw.profileId!,
    extraPermissions,
    active: raw.active
  };
}

function buildUserUpdatePayload(
  raw: ReturnType<UsersComponent['form']['getRawValue']>,
  extraPermissions: Permission[]
): UserAccountUpdateRequest {
  return {
    username: raw.username.trim(),
    fullName: raw.fullName.trim(),
    password: raw.password || null,
    profileId: raw.profileId!,
    extraPermissions,
    active: raw.active
  };
}

const STATUS_FILTER_OPTIONS: ReadonlyArray<CustomSelectOption<UserStatusFilter>> = [
  { value: 'all', label: 'Todos' },
  { value: 'active', label: 'Ativos' },
  { value: 'inactive', label: 'Inativos' }
];
