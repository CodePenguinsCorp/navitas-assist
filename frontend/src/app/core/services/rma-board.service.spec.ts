import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { SKIP_GLOBAL_LOADING } from '../interceptors/loading.interceptor';
import { RmaService } from './rma.service';

describe('Transporte do Kanban paginado', () => {
  let service: RmaService;
  let http: HttpTestingController;
  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    service = TestBed.inject(RmaService);
    http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => http.verify());

  it('envia os filtros e exclui o loading global somente nas páginas incrementais', () => {
    const api = service as any;
    for (const page of [0, 1]) {
      api.listBoardColumn({ status: 'TRIAGE', query: ' Série ', warranty: 'IN_WARRANTY', blocked: false,
        deadline: 'OVERDUE', assigneeId: 9, entryFrom: '2026-01-01', updatedTo: '2026-11-15' }, page).subscribe();
      const request = http.expectOne(r => r.url === '/api/rmas/board/column');
      expect(request.request.params.get('status')).toBe('TRIAGE');
      expect(request.request.params.get('query')).toBe('Série');
      expect(request.request.params.get('blocked')).toBe('false');
      expect(request.request.params.get('assigneeId')).toBe('9');
      expect(request.request.params.get('warranty')).toBe('IN_WARRANTY');
      expect(request.request.params.get('deadline')).toBe('OVERDUE');
      expect(request.request.params.get('entryFrom')).toBe('2026-01-01');
      expect(request.request.params.get('updatedTo')).toBe('2026-11-15');
      expect(request.request.params.get('page')).toBe(String(page));
      expect(request.request.params.get('size')).toBe('20');
      expect(request.request.context.get(SKIP_GLOBAL_LOADING)).toBe(page > 0);
      request.flush({ cards: [], total: 0, hasMore: false, page, size: 20 });
    }
  });

  it('lê agregações com filtro e envia vizinhos na escrita', () => {
    const api = service as any;
    api.getBoardCounts({ query: 'abc', unassignedOnly: true }).subscribe();
    const counts = http.expectOne(r => r.url === '/api/rmas/board/counts');
    expect(counts.request.params.get('unassignedOnly')).toBe('true');
    expect(counts.request.context.get(SKIP_GLOBAL_LOADING)).toBe(false);
    counts.flush({});
    const payload = { status: 'TRIAGE', afterId: 1, beforeId: 3 };
    api.updateBoardPosition(2, payload).subscribe();
    const write = http.expectOne('/api/rmas/2/board-position');
    expect(write.request.method).toBe('PUT');
    expect(write.request.body).toEqual(payload);
    write.flush({ id: 2 });
  });
});
