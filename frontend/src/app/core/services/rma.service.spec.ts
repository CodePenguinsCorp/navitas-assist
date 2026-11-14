import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { CreateRmaRequest, WarrantyStatus } from '../models';
import { RmaService } from './rma.service';

describe('RmaService', () => {
  let service: RmaService;
  let httpTesting: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(RmaService);
    httpTesting = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpTesting.verify());

  it('envia o ajuste de garantia por item e preserva a resposta do backend', () => {
    const payload = { override: WarrantyStatus.IN_WARRANTY, reason: 'Cortesia' } as const;
    let result: unknown;
    service.updateWarranty(4, 9, payload).subscribe((rma) => result = rma);
    const request = httpTesting.expectOne('/api/rmas/4/items/9/warranty');
    expect(request.request.method).toBe('PUT');
    expect(request.request.body).toEqual(payload);
    const response = { id: 4, items: [], warrantyHistory: [] };
    request.flush(response);
    expect(result).toEqual(response);
  });

  it('remove o ajuste enviando override e motivo nulos', () => {
    service.updateWarranty(4, 9, { override: null, reason: null }).subscribe();
    const request = httpTesting.expectOne('/api/rmas/4/items/9/warranty');
    expect(request.request.method).toBe('PUT');
    expect(request.request.body).toEqual({ override: null, reason: null });
    request.flush({});
  });

  it('trims search text and preserves the selected status', () => {
    service.list({ query: '  OS-1  ', status: 'TRIAGE' }).subscribe();

    const request = httpTesting.expectOne((candidate) => candidate.url === '/api/rmas');
    expect(request.request.method).toBe('GET');
    expect(request.request.params.get('query')).toBe('OS-1');
    expect(request.request.params.get('status')).toBe('TRIAGE');
    request.flush({ content: [], page: 0, size: 20, totalElements: 0, totalPages: 0 });
  });

  it('sends the page and size to the paged endpoint', () => {
    service.list({ page: 2, size: 50 }).subscribe();

    const request = httpTesting.expectOne((candidate) => candidate.url === '/api/rmas');
    expect(request.request.params.get('page')).toBe('2');
    expect(request.request.params.get('size')).toBe('50');
    expect(request.request.params.has('query')).toBe(false);
    request.flush({ content: [], page: 2, size: 50, totalElements: 0, totalPages: 0 });
  });

  it('loads the complete board list without pagination parameters', () => {
    service.listBoard({ query: ' OS ', status: 'TRIAGE' }).subscribe();

    const request = httpTesting.expectOne((candidate) => candidate.url === '/api/rmas/board');
    expect(request.request.params.has('page')).toBe(false);
    expect(request.request.params.has('size')).toBe(false);
    expect(request.request.params.get('query')).toBe('OS');
    expect(request.request.params.get('status')).toBe('TRIAGE');
    request.flush([]);
  });

  it('loads summary totals with the same filters as the list', () => {
    service.getSummary({ query: ' OS ', status: 'TRIAGE' }).subscribe();

    const request = httpTesting.expectOne((candidate) => candidate.url === '/api/rmas/summary');
    expect(request.request.params.has('page')).toBe(false);
    expect(request.request.params.get('query')).toBe('OS');
    expect(request.request.params.get('status')).toBe('TRIAGE');
    request.flush({ total: 3, ongoing: 2, highPriority: 1 });
  });

  it('starts and resolves a specific blockage through dedicated endpoints', () => {
    service.block(11, { reason: 'Peça pendente', category: null }).subscribe();
    const start = httpTesting.expectOne('/api/rmas/11/blocks');
    expect(start.request.method).toBe('POST');
    expect(start.request.body).toEqual({ reason: 'Peça pendente', category: null });
    start.flush({});
    service.resolveBlock(11, 9, { resolutionNote: 'Peça recebida' }).subscribe();
    const resolve = httpTesting.expectOne('/api/rmas/11/blocks/9');
    expect(resolve.request.method).toBe('PATCH');
    expect(resolve.request.body).toEqual({ resolutionNote: 'Peça recebida' });
    resolve.flush({});
  });

  it('posts the complete OS payload unchanged', () => {
    const payload: CreateRmaRequest = {
      clientId: 3,
      items: [
        { productId: 5, batchNumber: null, serialNumber: 'SER-1', manufacturedAt: '2026-01-01' },
      ],
      purchaseDate: '2026-02-01',
      purchaseDateUnknown: false,
      entryDate: '2026-10-20',
      invoiceNumber: null,
      reportedFailure: 'Falha',
      receivedAccessories: null,
      physicalCondition: null,
      priority: 'HIGH',
      repairSummary: null,
      replacedPartsSummary: null,
      testSummary: null,
    };

    service.create(payload).subscribe();
    const request = httpTesting.expectOne('/api/rmas');
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual(payload);
    request.flush({});
  });

  it('updates only priority through the existing OS endpoint', () => {
    service.updatePriority(11, 'HIGH').subscribe();
    const request = httpTesting.expectOne('/api/rmas/11');
    expect(request.request.method).toBe('PUT');
    expect(request.request.body).toEqual({ priority: 'HIGH' });
    request.flush({});
  });

  it('sets the due date and clears it with clearDueDate, never with a null dueDate', () => {
    service.updateDueDate(11, '2026-11-30').subscribe();
    const set = httpTesting.expectOne('/api/rmas/11');
    expect(set.request.method).toBe('PUT');
    expect(set.request.body).toEqual({ dueDate: '2026-11-30' });
    set.flush({});

    service.updateDueDate(11, null).subscribe();
    const clear = httpTesting.expectOne('/api/rmas/11');
    expect(clear.request.body).toEqual({ clearDueDate: true });
    clear.flush({});
  });

  it('patches status and assignee through their dedicated endpoints', () => {
    service.updateStatus(11, { status: 'IN_REPAIR', note: 'Iniciar' }).subscribe();
    const status = httpTesting.expectOne('/api/rmas/11/status');
    expect(status.request.method).toBe('PATCH');
    expect(status.request.body).toEqual({ status: 'IN_REPAIR', note: 'Iniciar' });
    status.flush({});

    service.updateAssignee(11, { assigneeId: 4 }).subscribe();
    const assignee = httpTesting.expectOne('/api/rmas/11/assignee');
    expect(assignee.request.method).toBe('PATCH');
    expect(assignee.request.body).toEqual({ assigneeId: 4 });
    assignee.flush({});
  });
});
