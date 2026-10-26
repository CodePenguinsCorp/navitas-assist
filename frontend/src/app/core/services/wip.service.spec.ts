import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { WipService } from './wip.service';

describe('WIP service contract', () => {
  it('loads global counts and updates a single column with no owner supplied by the client', () => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    const service = TestBed.inject(WipService), http = TestBed.inject(HttpTestingController);
    service.list().subscribe();
    const list = http.expectOne('/api/kanban-wip');
    expect(list.request.method).toBe('GET');
    list.flush([]);
    service.update('TRIAGE', { maxItems: 2, blocking: true }).subscribe();
    const update = http.expectOne('/api/kanban-wip/TRIAGE');
    expect(update.request.method).toBe('PUT');
    expect(update.request.body).toEqual({ maxItems: 2, blocking: true });
    update.flush({ status: 'TRIAGE', maxItems: 2, blocking: true, currentCount: 1 });
    http.verify();
  });
});
