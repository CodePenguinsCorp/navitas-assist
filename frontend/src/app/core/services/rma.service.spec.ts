import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { CreateRmaRequest } from '../models';
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

  it('trims search text and preserves the selected status', () => {
    service.list({ query: '  RMA-1  ', status: 'TRIAGE' }).subscribe();

    const request = httpTesting.expectOne((candidate) => candidate.url === '/api/rmas');
    expect(request.request.method).toBe('GET');
    expect(request.request.params.get('query')).toBe('RMA-1');
    expect(request.request.params.get('status')).toBe('TRIAGE');
    request.flush([]);
  });

  it('posts the complete RMA payload unchanged', () => {
    const payload: CreateRmaRequest = {
      clientId: 3,
      items: [
        { productId: 5, batchNumber: null, serialNumber: 'SER-1', manufacturedAt: '2026-01-01' },
      ],
      purchaseDate: '2026-02-01',
      purchaseDateUnknown: false,
      entryDate: '2026-10-20',
      invoiceNumber: null,
      invoiceFileName: null,
      receivedBy: 'Tester',
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
