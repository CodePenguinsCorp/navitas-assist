import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { AuditService } from './audit.service';

describe('AuditService', () => {
  let service: AuditService;
  let http: HttpTestingController;
  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    service = TestBed.inject(AuditService);
    http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => http.verify());

  it('sends dates, actor, action, type and pagination without empty filters', () => {
    service.search({ page: 2, size: 50, from: '2026-11-01', to: '2026-11-13', actor: ' admin ', action: 'UPDATE', entityType: 'USER' }).subscribe();
    const request = http.expectOne(req => req.url === '/api/audit-events');
    expect(request.request.method).toBe('GET');
    expect(request.request.params.keys()).toEqual(['page', 'size', 'from', 'to', 'actor', 'action', 'entityType']);
    expect(Object.fromEntries(request.request.params.keys().map(key => [key, request.request.params.get(key)]))).toEqual({ page: '2', size: '50', from: '2026-11-01', to: '2026-11-13', actor: 'admin', action: 'UPDATE', entityType: 'USER' });
    request.flush({ content: [], page: 2, size: 50, totalElements: 0, totalPages: 0 });
  });

  it('uses the first page and twenty records by default', () => {
    service.search({ actor: ' ' }).subscribe();
    const request = http.expectOne('/api/audit-events?page=0&size=20');
    request.flush({ content: [], page: 0, size: 20, totalElements: 0, totalPages: 0 });
  });
});
