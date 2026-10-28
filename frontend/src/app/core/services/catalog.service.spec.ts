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

    service.updateClient(7, payload).subscribe();
    const update = httpTesting.expectOne('/api/clients/7');
    expect(update.request.method).toBe('PUT');
    expect(update.request.body).toEqual(payload);
    expect(update.request.body).not.toHaveProperty('contactName');
    update.flush({});

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
});
