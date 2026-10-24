import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { ProtocolItemResultRequest } from '../models';
import { ProtocolService } from './protocol.service';

describe('ProtocolService', () => {
  let service: ProtocolService;
  let httpTesting: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(ProtocolService);
    httpTesting = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpTesting.verify());

  it('starts executions and records item results on the execution endpoints', () => {
    service.startExecution(4, 2).subscribe();
    const start = httpTesting.expectOne('/api/protocols/rmas/4/executions');
    expect(start.request.method).toBe('POST');
    expect(start.request.body).toEqual({ templateId: 2 });
    start.flush({});

    const payload: ProtocolItemResultRequest = { outcome: 'PASSED', measuredValue: '12.50', textValue: null, evidence: null, justification: null, startedAt: null };
    service.recordResult(9, 21, payload).subscribe();
    const result = httpTesting.expectOne('/api/protocols/executions/9/items/21/results');
    expect(result.request.method).toBe('POST');
    expect(result.request.body).toEqual(payload);
    result.flush({});

    service.complete(9).subscribe();
    const complete = httpTesting.expectOne('/api/protocols/executions/9/complete');
    expect(complete.request.method).toBe('POST');
    complete.flush({});
  });

  it('publishes a new template version with PUT', () => {
    service.updateTemplate(2, { name: 'Bancada', productId: 1, category: null, active: true, blockedStatuses: ['IN_TESTS'], items: [] }).subscribe();
    const update = httpTesting.expectOne('/api/protocols/templates/2');
    expect(update.request.method).toBe('PUT');
    expect(update.request.body.blockedStatuses).toEqual(['IN_TESTS']);
    update.flush({});
  });
});
