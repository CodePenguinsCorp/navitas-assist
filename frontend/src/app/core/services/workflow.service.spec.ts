import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { WorkflowService } from './workflow.service';
import { OperationsService } from './operations.service';

describe('Workflow and operations HTTP contracts', () => {
  let http: HttpTestingController;
  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => http.verify());
  it('preserves revision on save, publish and discard', () => {
    const service = TestBed.inject(WorkflowService);
    const definition = { name: 'Fluxo', initialStatus: 'NEW', statuses: [], transitions: [] };
    service.save(7, definition).subscribe();
    let req = http.expectOne('/api/workflows/draft');
    expect(req.request.body).toEqual({ expectedRevision: 7, definition });
    req.flush({});
    service.publish(8).subscribe();
    req = http.expectOne('/api/workflows/publish');
    expect(req.request.body).toEqual({ expectedRevision: 8 });
    req.flush({});
    service.discard(8).subscribe();
    req = http.expectOne('/api/workflows/draft?revision=8');
    expect(req.request.method).toBe('DELETE');
    req.flush(null);
  });
  it('preserves template version, execution and approval revisions', () => {
    const service = TestBed.inject(OperationsService);
    service.updateItem(1, 2, 'INSPECT', { checked: true, note: 'Validado', expectedRevision: 3 }).subscribe();
    let req = http.expectOne('/api/rmas/1/checklists/2/items/INSPECT');
    expect(req.request.body.expectedRevision).toBe(3);
    req.flush({});
    service.decide(1, 4, { status: 'APPROVED', note: 'Conferido', expectedRevision: 5 }).subscribe();
    req = http.expectOne('/api/rmas/1/approvals/4');
    expect(req.request.body).toEqual({ status: 'APPROVED', note: 'Conferido', expectedRevision: 5 });
    req.flush({});
    service
      .saveTemplate({ code: 'QUALITY', name: 'Qualidade', active: false, items: [], expectedVersion: 6 }, 7)
      .subscribe();
    req = http.expectOne('/api/checklist-templates/7');
    expect(req.request.method).toBe('PUT');
    expect(req.request.body.expectedVersion).toBe(6);
    req.flush({});
  });
});
