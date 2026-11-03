import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FormGroup } from '@angular/forms';
import { of } from 'rxjs';
import { ClientRequest, ClientResponse, PageResponse } from '../../core/models';
import { CatalogService, ClientFilters } from '../../core/services/catalog.service';
import { PresenceFilter } from '../../core/utils/catalog-ui';
import { ClientsComponent } from './clients.component';

function client(id: number, legalName: string): ClientResponse {
  return {
    id, legalName, tradeName: null, documentNumber: null, email: null,
    phone: null, address: null, notes: null,
    createdAt: '2026-10-20T12:00:00Z', updatedAt: '2026-10-20T12:00:00Z'
  };
}

function page(content: ClientResponse[], pageNumber = 0, size = 20, totalElements = content.length): PageResponse<ClientResponse> {
  return { content, page: pageNumber, size, totalElements, totalPages: Math.ceil(totalElements / size) };
}

describe('ClientsComponent pagination', () => {
  let component: ClientsHarness;
  let fixture: ComponentFixture<ClientsComponent>;
  let listClients: ReturnType<typeof vi.fn>;
  let getClientSummary: ReturnType<typeof vi.fn>;
  let deleteClient: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    vi.useFakeTimers();
    listClients = vi.fn((filters: ClientFilters) => of(page([client(1, 'Alfa'), client(2, 'Beta')], filters.page, filters.size, 45)));
    getClientSummary = vi.fn(() => of({ total: 45, withPhone: 10, withDocument: 20, withEmail: 30 }));
    deleteClient = vi.fn(() => of(undefined));

    await TestBed.configureTestingModule({
      imports: [ClientsComponent],
      providers: [{ provide: CatalogService, useValue: {
        listClients,
        getClientSummary,
        deleteClient,
        createClient: (request: ClientRequest) => of({ ...client(9, request.legalName) }),
        updateClient: (id: number, request: ClientRequest) => of({ ...client(id, request.legalName) })
      } }]
    }).compileComponents();

    fixture = TestBed.createComponent(ClientsComponent);
    component = fixture.componentInstance as unknown as ClientsHarness;
    fixture.detectChanges();
  });

  afterEach(() => vi.useRealTimers());

  it('loads the first page with the default size and shows the total and summary', () => {
    expect(listClients).toHaveBeenLastCalledWith({ page: 0, size: 20, query: '', hasDocument: undefined, hasEmail: undefined });
    expect(fixture.nativeElement.textContent).toContain('45 registro(s)');
    expect(fixture.nativeElement.textContent).toContain('Página 1 de 3');
    expect(fixture.nativeElement.textContent).toContain('1–2 de 45');
    expect(getClientSummary).toHaveBeenCalledTimes(1);
  });

  it('navigates between pages and keeps the active filters', () => {
    component.updateDocumentFilter('with');
    component.goToPage(1);

    expect(listClients).toHaveBeenLastCalledWith({ page: 1, size: 20, query: '', hasDocument: true, hasEmail: undefined });
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Página 2 de 3');
  });

  it('returns to the first page when a filter or the page size changes', () => {
    component.goToPage(2);
    component.updateEmailFilter('without');
    expect(listClients).toHaveBeenLastCalledWith({ page: 0, size: 20, query: '', hasDocument: undefined, hasEmail: false });

    component.goToPage(1);
    component.changePageSize(50);
    expect(listClients).toHaveBeenLastCalledWith({ page: 0, size: 50, query: '', hasDocument: undefined, hasEmail: false });
  });

  it('debounces the text search and queries the backend from the first page', () => {
    component.goToPage(1);
    listClients.mockClear();

    component.updateSearch('al');
    component.updateSearch('alfa');
    expect(listClients).not.toHaveBeenCalled();

    vi.advanceTimersByTime(300);
    expect(listClients).toHaveBeenCalledTimes(1);
    expect(listClients).toHaveBeenLastCalledWith({ page: 0, size: 20, query: 'alfa', hasDocument: undefined, hasEmail: undefined });
  });

  it('shows the filtered empty state only when filters are active', () => {
    listClients.mockImplementation(() => of(page([])));
    component.updateDocumentFilter('without');
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('Nenhum resultado encontrado.');
    expect(fixture.nativeElement.textContent).toContain('0 registro(s)');
  });

  it('reloads the current page and the summary after deleting a client', () => {
    component.goToPage(1);
    listClients.mockClear();
    getClientSummary.mockClear();

    component.openDeleteModal(client(1, 'Alfa'));
    component.confirmDeleteClient();

    expect(deleteClient).toHaveBeenCalledWith(1);
    expect(listClients).toHaveBeenLastCalledWith({ page: 1, size: 20, query: '', hasDocument: undefined, hasEmail: undefined });
    expect(getClientSummary).toHaveBeenCalledTimes(1);
  });

  it('moves back to the last page when the current page becomes empty', () => {
    listClients.mockImplementation((filters: ClientFilters) =>
      of(filters.page === 2 ? page([], 2, 20, 40) : page([client(1, 'Alfa')], filters.page, filters.size, 40)));

    component.goToPage(2);

    expect(listClients).toHaveBeenLastCalledWith({ page: 1, size: 20, query: '', hasDocument: undefined, hasEmail: undefined });
  });
});

interface ClientsHarness {
  form: FormGroup;
  updateSearch(value: string): void;
  updateDocumentFilter(value: PresenceFilter): void;
  updateEmailFilter(value: PresenceFilter): void;
  goToPage(page: number): void;
  changePageSize(size: number): void;
  openDeleteModal(client: ClientResponse): void;
  confirmDeleteClient(): void;
}

describe('ClientsComponent registration form', () => {
  let component: ClientFormHarness;
  let fixture: ComponentFixture<ClientsComponent>;
  let lastPayload: ClientRequest | null;

  beforeEach(async () => {
    lastPayload = null;
    await TestBed.configureTestingModule({
      imports: [ClientsComponent],
      providers: [{ provide: CatalogService, useValue: {
        listClients: () => of(page([client(1, 'Alfa')])),
        getClientSummary: () => of({ total: 1, withPhone: 0, withDocument: 0, withEmail: 0 }),
        createClient: (request: ClientRequest) => { lastPayload = request; return of(client(9, request.legalName)); },
        updateClient: (id: number, request: ClientRequest) => { lastPayload = request; return of(client(id, request.legalName)); }
      } }]
    }).compileComponents();
    fixture = TestBed.createComponent(ClientsComponent);
    component = fixture.componentInstance as unknown as ClientFormHarness;
    fixture.detectChanges();
  });

  it('shows the phone card and omits the contact property from create and update payloads', () => {
    expect(fixture.nativeElement.textContent).toContain('Com telefone');
    expect(fixture.nativeElement.textContent).toContain('Com CPF/CNPJ');

    component.openCreateModal();
    component.form.patchValue({ legalName: ' Delta ', phone: ' 123 ', address: ' Rua A ' });
    component.saveClient();
    expect(lastPayload).toEqual({
      legalName: 'Delta', tradeName: null, documentNumber: null, email: null,
      phone: '123', address: 'Rua A', notes: null
    });

    component.openEditModal(client(1, 'Alfa'));
    component.form.patchValue({ legalName: 'Alfa atualizada' });
    component.saveClient();
    expect(lastPayload).toEqual({
      legalName: 'Alfa atualizada', tradeName: null, documentNumber: null, email: null,
      phone: null, address: null, notes: null
    });
  });

  it('labels the document as CPF/CNPJ and retains native phone and address limits', () => {
    component.openCreateModal();
    fixture.detectChanges();
    const element: HTMLElement = fixture.nativeElement;
    expect(element.textContent).toContain('CPF/CNPJ');
    expect(element.textContent).not.toContain('CNPJ/CPF');
    expect(element.querySelector('input[formControlName="contactName"]')).toBeNull();
    expect(element.querySelector<HTMLInputElement>('input[formControlName="phone"]')?.maxLength).toBe(30);
    expect(element.querySelector<HTMLInputElement>('input[formControlName="address"]')?.maxLength).toBe(255);
  });

  it('validates the agreed limits when values are assigned programmatically', () => {
    component.openCreateModal();
    component.form.patchValue({ legalName: 'A -–— '.repeat(119) + 'Z', phone: '1'.repeat(30), address: 'A'.repeat(255) });
    expect(component.form.valid).toBe(true);
    component.form.controls['phone'].setValue('1'.repeat(31));
    expect(component.form.controls['phone'].invalid).toBe(true);
    component.form.controls['phone'].setValue('');
    component.form.controls['address'].setValue('A'.repeat(256));
    expect(component.form.controls['address'].invalid).toBe(true);
    component.form.controls['address'].setValue('');
    component.form.controls['legalName'].setValue('A -'.repeat(121));
    expect(component.form.controls['legalName'].invalid).toBe(true);
  });

  it('limits pasted legal names by significant characters and still explains invalid values', () => {
    component.openCreateModal();
    fixture.detectChanges();
    const input = fixture.nativeElement.querySelector('input[formControlName="legalName"]') as HTMLInputElement;
    input.value = 'A -'.repeat(121);
    input.dispatchEvent(new Event('input', { bubbles: true }));
    expect(input.value).toBe('A -'.repeat(120));
    expect(component.form.controls['legalName'].value).toBe('A -'.repeat(120));
    component.form.controls['legalName'].setValue('A'.repeat(121));
    component.form.controls['legalName'].markAsTouched();
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Informe a razão social com até 120 caracteres');
  });
});

interface ClientFormHarness {
  form: FormGroup;
  openCreateModal(): void;
  openEditModal(client: ClientResponse): void;
  saveClient(): void;
}
