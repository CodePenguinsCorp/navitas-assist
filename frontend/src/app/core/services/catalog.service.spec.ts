import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { ClientRequest, ProductRequest } from '../models';
import { CatalogService } from './catalog.service';

describe('CatalogService', () => {
  let service: CatalogService;
  let httpTesting: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(CatalogService);
    httpTesting = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpTesting.verify());

  it('uses the client collection and resource endpoints with the supplied payload', () => {
    const payload: ClientRequest = {
      legalName: 'Cliente Teste',
      tradeName: null,
      documentNumber: null,
      contactName: null,
      email: null,
      phone: null,
      address: null,
      notes: null,
    };

    service.createClient(payload).subscribe();
    const create = httpTesting.expectOne('/api/clients');
    expect(create.request.method).toBe('POST');
    expect(create.request.body).toEqual(payload);
    create.flush({});

    service.deleteClient(7).subscribe();
    const remove = httpTesting.expectOne('/api/clients/7');
    expect(remove.request.method).toBe('DELETE');
    remove.flush(null);
  });

  it('uses the product resource endpoint when updating', () => {
    const payload: ProductRequest = {
      sku: 'SKU-1',
      name: 'Produto',
      category: null,
      hardwareVersion: null,
      firmwareVersion: null,
      defaultWarrantyMonths: 12,
      technicalNotes: null,
    };

    service.updateProduct(9, payload).subscribe();
    const request = httpTesting.expectOne('/api/products/9');
    expect(request.request.method).toBe('PUT');
    expect(request.request.body).toEqual(payload);
    request.flush({});
  });

  it('loads only assignable users from the dedicated endpoint', () => {
    service.listAssignableUsers().subscribe();
    const request = httpTesting.expectOne('/api/users/assignable');
    expect(request.request.method).toBe('GET');
    request.flush([]);
  });

  it('sends pagination and boolean filters to the clients endpoint', () => {
    service.listClients({ page: 1, size: 10, query: '  acme ', hasDocument: true, hasEmail: false }).subscribe();

    const request = httpTesting.expectOne((candidate) => candidate.url === '/api/clients');
    expect(request.request.params.get('page')).toBe('1');
    expect(request.request.params.get('size')).toBe('10');
    expect(request.request.params.get('query')).toBe('acme');
    expect(request.request.params.get('hasDocument')).toBe('true');
    expect(request.request.params.get('hasEmail')).toBe('false');
    request.flush({ content: [], page: 1, size: 10, totalElements: 0, totalPages: 0 });
  });

  it('omits empty filters from the product and user requests', () => {
    service.listProducts({ query: '   ', category: '' }).subscribe();
    const products = httpTesting.expectOne((candidate) => candidate.url === '/api/products');
    expect(products.request.params.keys()).toEqual([]);
    products.flush({ content: [], page: 0, size: 20, totalElements: 0, totalPages: 0 });

    service.listUsers({ role: 'ADMIN', active: false }).subscribe();
    const users = httpTesting.expectOne((candidate) => candidate.url === '/api/users');
    expect(users.request.params.get('role')).toBe('ADMIN');
    expect(users.request.params.get('active')).toBe('false');
    users.flush({ content: [], page: 0, size: 20, totalElements: 0, totalPages: 0 });
  });

  it('uses dedicated endpoints for selector options and summaries', () => {
    service.listClientOptions().subscribe();
    httpTesting.expectOne('/api/clients/options').flush([]);
    service.listProductOptions().subscribe();
    httpTesting.expectOne('/api/products/options').flush([]);
    service.getClientSummary().subscribe();
    httpTesting.expectOne('/api/clients/summary').flush({});
    service.getProductSummary().subscribe();
    httpTesting.expectOne('/api/products/summary').flush({});
    service.getUserSummary().subscribe();
    httpTesting.expectOne('/api/users/summary').flush({});
  });
});
