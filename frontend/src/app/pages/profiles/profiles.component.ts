import { Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { AbstractControl, FormBuilder, ReactiveFormsModule, ValidationErrors, Validators } from '@angular/forms';
import { Observable, Subject, debounceTime, filter, finalize } from 'rxjs';
import { PermissionModuleResponse, ProfileRequest, ProfileResponse } from '../../core/models';
import { PERMISSIONS, Permission, isPermission } from '../../core/permissions';
import { AuthService } from '../../core/services/auth.service';
import { ProfileService } from '../../core/services/profile.service';
import { extractHttpErrorMessage, formatDateTime } from '../../core/utils/catalog-ui';
import { PagedList } from '../../core/utils/paged-list';
import { SEARCH_DEBOUNCE_MS } from '../../core/utils/pagination';
import { IconComponent } from '../../shared/icon/icon.component';
import { ModalFocusDirective } from '../../shared/modal-focus/modal-focus.directive';
import { PageHeaderComponent } from '../../shared/page-header/page-header.component';
import { PaginationComponent } from '../../shared/pagination/pagination.component';
import { PermissionPickerComponent } from '../../shared/permission-picker/permission-picker.component';
import { RowActionComponent } from '../../shared/row-action/row-action.component';

type ProfileModalMode = 'create' | 'edit' | 'duplicate';
type CatalogState = 'loading' | 'ready' | 'failed';

const NAME_MAX_LENGTH = 60;
const DUPLICATE_PREFIX = 'Cópia de ';
const DUPLICATE_NAME_MESSAGE = /^Já existe um perfil com o nome /;

/** Só espaços conta como vazio: o backend apara o nome. */
const trimmedRequired = (control: AbstractControl<string>): ValidationErrors | null =>
  control.value.trim() ? null : { required: true };

@Component({
  selector: 'app-profiles',
  imports: [IconComponent, ReactiveFormsModule, ModalFocusDirective, PaginationComponent, PageHeaderComponent, PermissionPickerComponent, RowActionComponent],
  templateUrl: './profiles.component.html',
  styles: [`
    :host { display: block; }

    .profile-form-modal { width: min(100%, 860px); }

    .catalog-pending { min-height: 4rem; grid-column: 1 / -1; }
  `]
})
export class ProfilesComponent {
  private readonly formBuilder = inject(FormBuilder);
  private readonly profileService = inject(ProfileService);
  private readonly authService = inject(AuthService);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly totalPermissions = PERMISSIONS.length;
  protected readonly nameMaxLength = NAME_MAX_LENGTH;
  protected readonly searchTerm = signal('');
  protected readonly loadFailed = signal(false);
  protected readonly errorMessage = signal('');
  protected readonly successMessage = signal('');
  protected readonly modalErrorMessage = signal('');
  protected readonly nameServerError = signal('');
  protected readonly deleteModalErrorMessage = signal('');
  protected readonly submitting = signal(false);
  protected readonly submitAttempted = signal(false);
  protected readonly deletingProfileId = signal<number | null>(null);
  protected readonly activeModal = signal<ProfileModalMode | null>(null);
  protected readonly catalog = signal<PermissionModuleResponse[]>([]);
  protected readonly catalogState = signal<CatalogState>('loading');
  protected readonly selected = signal<ReadonlySet<Permission>>(new Set());

  private readonly searchChanges = new Subject<'search' | 'cancel'>();
  private readonly profileList = new PagedList<ProfileResponse>(
    (pageQuery) => this.profileService.list({ ...pageQuery, query: this.searchTerm() }),
    (error) => {
      this.loadFailed.set(true);
      this.errorMessage.set(extractHttpErrorMessage(error, 'Não foi possível carregar os perfis.'));
    },
    () => this.loadFailed.set(false)
  );
  private readonly editingProfileSignal = signal<ProfileResponse | null>(null);
  private readonly deletingProfileSignal = signal<ProfileResponse | null>(null);

  protected readonly profiles = this.profileList.items;
  protected readonly loading = this.profileList.loading;
  protected readonly page = this.profileList.page;
  protected readonly pageSize = this.profileList.size;
  protected readonly totalElements = this.profileList.totalElements;
  protected readonly totalPages = this.profileList.totalPages;
  protected readonly hasLoaded = computed(() => this.profileList.result() !== null);
  protected readonly deletingProfile = this.deletingProfileSignal.asReadonly();
  protected readonly modalTitle = computed(() =>
    this.activeModal() === 'edit' ? 'Editar perfil' : this.activeModal() === 'duplicate' ? 'Duplicar perfil' : 'Novo perfil');

  protected readonly form = this.formBuilder.nonNullable.group({
    name: ['', [trimmedRequired, Validators.maxLength(NAME_MAX_LENGTH)]]
  });

  constructor() {
    this.searchChanges.pipe(
      debounceTime(SEARCH_DEBOUNCE_MS),
      filter((kind) => kind === 'search'),
      takeUntilDestroyed(this.destroyRef)
    ).subscribe(() => this.profileList.firstPage());
    // O erro do servidor sobre o nome vale para o valor enviado; editar o campo o descarta.
    this.form.controls.name.valueChanges.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => this.nameServerError.set(''));
    this.profileList.reload();
  }

  protected get hasSearch(): boolean {
    return Boolean(this.searchTerm().trim());
  }

  protected updateSearch(value: string): void {
    this.searchTerm.set(value);
    this.searchChanges.next('search');
  }

  protected clearSearch(): void {
    this.searchChanges.next('cancel');
    this.searchTerm.set('');
    this.profileList.firstPage();
  }

  protected retryLoad(): void {
    this.profileList.reload();
  }

  protected goToPage(page: number): void {
    this.profileList.goToPage(page);
  }

  protected changePageSize(size: number): void {
    this.profileList.changeSize(size);
  }

  protected openCreateModal(): void {
    this.openModal('create', null, '', []);
  }

  protected openEditModal(profile: ProfileResponse): void {
    this.openModal('edit', profile, profile.name, profile.permissions);
  }

  protected openDuplicateModal(profile: ProfileResponse): void {
    this.openModal('duplicate', null, (DUPLICATE_PREFIX + profile.name).slice(0, NAME_MAX_LENGTH), profile.permissions);
  }

  protected closeModal(): void {
    if (this.submitting()) {
      return;
    }
    this.activeModal.set(null);
    this.modalErrorMessage.set('');
    this.nameServerError.set('');
  }

  protected nameError(): string {
    const control = this.form.controls.name;
    if (this.nameServerError()) return this.nameServerError();
    if (!control.invalid || !(control.dirty || control.touched || this.submitAttempted())) return '';
    return control.hasError('required') ? 'Informe o nome do perfil.' : `Use até ${NAME_MAX_LENGTH} caracteres.`;
  }

  protected saveProfile(): void {
    this.submitAttempted.set(true);
    if (this.catalogState() !== 'ready' || this.submitting()) {
      return;
    }
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    const payload: ProfileRequest = {
      name: this.form.controls.name.value.trim(),
      permissions: PERMISSIONS.filter((code) => this.selected().has(code))
    };
    const editing = this.activeModal() === 'edit' ? this.editingProfileSignal() : null;
    const request$: Observable<ProfileResponse> = editing
      ? this.profileService.update(editing.id, payload)
      : this.profileService.create(payload);

    this.submitting.set(true);
    this.modalErrorMessage.set('');
    this.nameServerError.set('');
    this.successMessage.set('');
    request$.pipe(finalize(() => this.submitting.set(false))).subscribe({
      next: (profile) => {
        this.successMessage.set(`Perfil ${profile.name} ${editing ? 'atualizado' : 'cadastrado'} com sucesso.`);
        this.activeModal.set(null);
        this.afterChange();
        // As permissões do próprio usuário podem ter mudado com o perfil.
        this.authService.refreshSession().subscribe();
      },
      error: (error) => {
        const message = extractHttpErrorMessage(error, 'Não foi possível salvar o perfil agora.');
        if (DUPLICATE_NAME_MESSAGE.test(message)) {
          this.nameServerError.set(message);
        } else {
          this.modalErrorMessage.set(message);
        }
      }
    });
  }

  protected deleteBlockedReason(profile: ProfileResponse): string | null {
    return profile.userCount > 0 ? 'Perfil com usuários vinculados não pode ser excluído.' : null;
  }

  protected openDeleteModal(profile: ProfileResponse): void {
    if (this.deleteBlockedReason(profile)) {
      return;
    }
    this.deletingProfileSignal.set(profile);
    this.deleteModalErrorMessage.set('');
    this.successMessage.set('');
  }

  protected closeDeleteModal(): void {
    if (this.deletingProfileId() !== null) {
      return;
    }
    this.deletingProfileSignal.set(null);
    this.deleteModalErrorMessage.set('');
  }

  protected confirmDelete(): void {
    const profile = this.deletingProfileSignal();
    if (!profile || this.deletingProfileId() !== null) {
      return;
    }
    this.deletingProfileId.set(profile.id);
    this.deleteModalErrorMessage.set('');
    this.profileService.delete(profile.id).pipe(finalize(() => this.deletingProfileId.set(null))).subscribe({
      next: () => {
        this.successMessage.set(`Perfil ${profile.name} excluído com sucesso.`);
        this.deletingProfileSignal.set(null);
        this.afterChange();
      },
      error: (error) => this.deleteModalErrorMessage.set(extractHttpErrorMessage(error, 'Não foi possível excluir o perfil agora.'))
    });
  }

  protected permissionCount(profile: ProfileResponse): string {
    return `${profile.permissions.filter(isPermission).length} de ${this.totalPermissions}`;
  }

  protected updatedAtLabel(profile: ProfileResponse): string {
    return formatDateTime(profile.updatedAt);
  }

  private openModal(mode: ProfileModalMode, editing: ProfileResponse | null, name: string, permissions: string[]): void {
    this.editingProfileSignal.set(editing);
    this.form.reset({ name });
    this.selected.set(new Set(permissions.filter(isPermission)));
    this.submitAttempted.set(false);
    this.modalErrorMessage.set('');
    this.nameServerError.set('');
    this.successMessage.set('');
    this.activeModal.set(mode);
    this.loadCatalog();
  }

  protected retryCatalog(): void {
    this.loadCatalog();
  }

  /** O serviço guarda o catálogo: só a primeira abertura (ou a seguinte a uma falha) faz a requisição. */
  private loadCatalog(): void {
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

  private afterChange(): void {
    this.profileService.invalidateOptions();
    this.errorMessage.set('');
    this.profileList.reload();
  }
}
