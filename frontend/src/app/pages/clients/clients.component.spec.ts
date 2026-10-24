import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FormGroup } from '@angular/forms';
import { of } from 'rxjs';
import { ClientRequest, ClientResponse, PageResponse } from '../../core/models';
import { CatalogService, ClientFilters } from '../../core/services/catalog.service';
import { PresenceFilter } from '../../core/utils/catalog-ui';
import { ClientsComponent } from './clients.component';

function client(id: number, legalName: string): ClientResponse {
  return {
    id, legalName, tradeName: null, documentNumber: null, contactName: null, email: null,
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
    getClientSummary = vi.fn(() => of({ total: 45, withContact: 10, withDocument: 20, withEmail: 30 }));
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
