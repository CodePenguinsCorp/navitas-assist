import { Component, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Observable, Subject, debounceTime, finalize } from 'rxjs';
import { ClientRequest, ClientResponse, ClientSummaryResponse } from '../../core/models';
import { CatalogService } from '../../core/services/catalog.service';
import {
  extractHttpErrorMessage,
  formatDateTime,
  PRESENCE_FILTER_OPTIONS,
  PresenceFilter,
  normalizeOptionalText
} from '../../core/utils/catalog-ui';
import { PagedList } from '../../core/utils/paged-list';
import { SEARCH_DEBOUNCE_MS, presenceToFlag } from '../../core/utils/pagination';
import { CustomSelectComponent } from '../../shared/form-controls/custom-select/custom-select.component';
import { PaginationComponent } from '../../shared/pagination/pagination.component';

type ClientModalMode = 'create' | 'edit';
type ClientFormControlName =
  | 'legalName'
  | 'tradeName'
  | 'documentNumber'
  | 'contactName'
  | 'email'
  | 'phone'
  | 'address'
  | 'notes';

@Component({
  selector: 'app-clients',
  imports: [ReactiveFormsModule, CustomSelectComponent, PaginationComponent],
  templateUrl: './clients.component.html',
  styles: [`
    :host { display: block; }

    .client-actions { display: flex; gap: 0.45rem; }

    .button-secondary--danger { border-color: #efc7cf; color: var(--danger-text); }
    .button-secondary--danger:hover { background: var(--danger-bg); }
    .button-primary--danger { background: var(--danger-text); }
    .button-primary--danger:hover { background: #7f3441; }

    .delete-confirmation { margin: 0 0 1.25rem; color: var(--muted); line-height: 1.55; }
    .delete-confirmation strong { color: var(--brand-blue-deep); }
    .modal-feedback { margin-bottom: 1rem; }
  `]
})
export class ClientsComponent {
  private readonly formBuilder = inject(FormBuilder);
  private readonly catalogService = inject(CatalogService);

  private readonly destroyRef = inject(DestroyRef);

  protected readonly submitting = signal(false);
  protected readonly deletingClientId = signal<number | null>(null);
  protected readonly errorMessage = signal('');
  protected readonly modalErrorMessage = signal('');
  protected readonly deleteModalErrorMessage = signal('');
  protected readonly successMessage = signal('');
  protected readonly searchTerm = signal('');
  protected readonly documentFilter = signal<PresenceFilter>('all');
  protected readonly emailFilter = signal<PresenceFilter>('all');
  protected readonly presenceFilterOptions = PRESENCE_FILTER_OPTIONS;
  protected readonly activeModal = signal<ClientModalMode | null>(null);

  private readonly searchChanges = new Subject<void>();
  private readonly clientList = new PagedList<ClientResponse>(
    (pageQuery) => this.catalogService.listClients({
      ...pageQuery,
      query: this.searchTerm(),
      hasDocument: presenceToFlag(this.documentFilter()),
      hasEmail: presenceToFlag(this.emailFilter())
    }),
    (error) => this.errorMessage.set(extractHttpErrorMessage(error, 'Não foi possível carregar os clientes.'))
  );
  private readonly summarySignal = signal<ClientSummaryResponse>({ total: 0, withContact: 0, withDocument: 0, withEmail: 0 });
  private readonly editingClientSignal = signal<ClientResponse | null>(null);
  private readonly deletingClientSignal = signal<ClientResponse | null>(null);

  protected readonly clients = this.clientList.items;
  protected readonly loading = this.clientList.loading;
  protected readonly page = this.clientList.page;
  protected readonly pageSize = this.clientList.size;
  protected readonly totalElements = this.clientList.totalElements;
  protected readonly totalPages = this.clientList.totalPages;
  protected readonly summary = this.summarySignal.asReadonly();
  protected readonly editingClient = this.editingClientSignal.asReadonly();
  protected readonly deletingClient = this.deletingClientSignal.asReadonly();

  protected readonly form = this.formBuilder.nonNullable.group({
    legalName: ['', [Validators.required, Validators.pattern(/^(?:[\s\p{Pd}]*[^\s\p{Pd}]){0,120}[\s\p{Pd}]*$/u)]],
    tradeName: ['', [Validators.maxLength(120)]],
    documentNumber: ['', [Validators.maxLength(18)]],
    contactName: ['', [Validators.maxLength(120)]],
    email: ['', [Validators.email, Validators.maxLength(120)]],
    phone: ['', [Validators.maxLength(30)]],
    address: ['', [Validators.maxLength(255)]],
    notes: ['', [Validators.maxLength(1000)]]
  });

  protected get hasActiveFilters(): boolean {
    return Boolean(this.searchTerm().trim()) || this.documentFilter() !== 'all' || this.emailFilter() !== 'all';
  }

  constructor() {
    this.searchChanges.pipe(
      debounceTime(SEARCH_DEBOUNCE_MS),
      takeUntilDestroyed(this.destroyRef)
    ).subscribe(() => this.clientList.firstPage());
    this.loadClients();
    this.loadSummary();
  }

  protected updateSearch(value: string): void {
    this.searchTerm.set(value);
    this.searchChanges.next();
  }

  protected updateDocumentFilter(value: PresenceFilter): void {
    this.documentFilter.set(value);
    this.clientList.firstPage();
  }

  protected updateEmailFilter(value: PresenceFilter): void {
    this.emailFilter.set(value);
    this.clientList.firstPage();
  }

  protected goToPage(page: number): void {
    this.clientList.goToPage(page);
  }

  protected changePageSize(size: number): void {
    this.clientList.changeSize(size);
  }

  protected limitLegalName(event: Event): void {
    const input = event.target as HTMLInputElement;
    let count = 0;
    let limitedValue = '';

    for (const character of input.value) {
      if (!/[\s\p{Pd}]/u.test(character) && ++count > 120) {
        break;
      }
      limitedValue += character;
    }

    if (input.value !== limitedValue) {
      input.value = limitedValue;
      this.form.controls.legalName.setValue(limitedValue);
    }
  }

  protected openCreateModal(): void {
    this.editingClientSignal.set(null);
    this.form.reset(emptyClientForm());
    this.activeModal.set('create');
    this.clearMessages();
  }

  protected openEditModal(client: ClientResponse): void {
    this.editingClientSignal.set(client);
    this.form.reset({
      legalName: client.legalName,
      tradeName: client.tradeName ?? '',
      documentNumber: client.documentNumber ?? '',
      contactName: client.contactName ?? '',
      email: client.email ?? '',
      phone: client.phone ?? '',
      address: client.address ?? '',
      notes: client.notes ?? ''
    });
    this.activeModal.set('edit');
    this.clearMessages();
  }

  protected closeModal(): void {
    this.activeModal.set(null);
    this.modalErrorMessage.set('');
  }

  protected saveClient(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      this.modalErrorMessage.set('Revise os campos destacados antes de salvar o cliente.');
      return;
    }

    const payload = buildClientPayload(this.form.getRawValue());
    const currentClient = this.editingClientSignal();
    const request$: Observable<ClientResponse> = currentClient
      ? this.catalogService.updateClient(currentClient.id, payload)
      : this.catalogService.createClient(payload);

    this.submitting.set(true);
    this.clearMessages();

    request$.pipe(
      finalize(() => this.submitting.set(false))
    ).subscribe({
      next: (client) => {
        this.successMessage.set(
          currentClient
            ? `Cliente ${client.legalName} atualizado com sucesso.`
            : `Cliente ${client.legalName} cadastrado com sucesso.`
        );
        this.closeModal();
        this.loadClients();
        this.loadSummary();
      },
      error: (error) => {
        this.modalErrorMessage.set(
          extractHttpErrorMessage(error, 'Não foi possível salvar o cliente agora.')
        );
      }
    });
  }

  protected openDeleteModal(client: ClientResponse): void {
    this.deletingClientSignal.set(client);
    this.clearMessages();
  }

  protected closeDeleteModal(): void {
    if (this.deletingClientId() !== null) {
      return;
    }

    this.resetDeleteModal();
  }

  protected confirmDeleteClient(): void {
    const client = this.deletingClientSignal();

    if (!client || this.deletingClientId() !== null) {
      return;
    }

    this.deletingClientId.set(client.id);
    this.clearMessages();

    this.catalogService.deleteClient(client.id).pipe(
      finalize(() => this.deletingClientId.set(null))
    ).subscribe({
      next: () => {
        this.loadClients();
        this.loadSummary();
        this.successMessage.set(`Cliente ${client.legalName} excluído com sucesso.`);
        this.resetDeleteModal();
      },
      error: (error) => {
        this.deleteModalErrorMessage.set(
          extractHttpErrorMessage(error, 'Não foi possível excluir o cliente agora.')
        );
      }
    });
  }

  protected hasError(controlName: ClientFormControlName): boolean {
    const control = this.form.controls[controlName];
    return control.invalid && (control.dirty || control.touched);
  }

  protected updatedAtLabel(client: ClientResponse): string {
    return formatDateTime(client.updatedAt);
  }

  private loadClients(): void {
    this.errorMessage.set('');
    this.clientList.reload();
  }

  private loadSummary(): void {
    this.catalogService.getClientSummary().subscribe({
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

  private resetDeleteModal(): void {
    this.deletingClientSignal.set(null);
    this.deleteModalErrorMessage.set('');
  }
}

function emptyClientForm() {
  return {
    legalName: '',
    tradeName: '',
    documentNumber: '',
    contactName: '',
    email: '',
    phone: '',
    address: '',
    notes: ''
  };
}

function buildClientPayload(raw: ReturnType<ClientsComponent['form']['getRawValue']>): ClientRequest {
  return {
    legalName: raw.legalName.trim(),
    tradeName: normalizeOptionalText(raw.tradeName),
    documentNumber: normalizeOptionalText(raw.documentNumber),
    contactName: normalizeOptionalText(raw.contactName),
    email: normalizeOptionalText(raw.email),
    phone: normalizeOptionalText(raw.phone),
    address: normalizeOptionalText(raw.address),
    notes: normalizeOptionalText(raw.notes)
  };
}
