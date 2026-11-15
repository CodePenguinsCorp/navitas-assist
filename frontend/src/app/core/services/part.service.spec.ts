import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { PartMovementRequest, PartUsageRequest } from '../models';
import { PartService } from './part.service';

describe('PartService', () => {
  let service: PartService;
  let httpTesting: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(PartService);
    httpTesting = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpTesting.verify());

  it('uses the minimal catalog endpoint for the OS selector', () => {
    service.listOptions().subscribe();
    const request = httpTesting.expectOne('/api/parts/options');
    expect(request.request.method).toBe('GET');
    request.flush([{ id: 1, code: 'P1', name: 'Peça', unit: 'un', active: true }]);
  });

  it('trims the search query and omits it when blank', () => {
    service.list('  PCA  ').subscribe();
    const search = httpTesting.expectOne((candidate) => candidate.url === '/api/parts');
    expect(search.request.params.get('query')).toBe('PCA');
    search.flush([]);

    service.list('   ').subscribe();
    const all = httpTesting.expectOne((candidate) => candidate.url === '/api/parts');
    expect(all.request.params.has('query')).toBe(false);
    all.flush([]);
  });

  it('posts manual movements and reversals to the part endpoints', () => {
    const payload: PartMovementRequest = { type: 'ADJUSTMENT', quantity: -2, reason: 'Inventário' };
    service.registerMovement(4, payload).subscribe();
    const movement = httpTesting.expectOne('/api/parts/4/movements');
    expect(movement.request.method).toBe('POST');
    expect(movement.request.body).toEqual(payload);
    movement.flush({});

    service.reverseMovement(9, 'Lançamento duplicado').subscribe();
    const reversal = httpTesting.expectOne('/api/parts/movements/9/reversal');
    expect(reversal.request.method).toBe('POST');
    expect(reversal.request.body).toEqual({ reason: 'Lançamento duplicado' });
    reversal.flush({});
  });

  it('uses parts and reverses usages under the OS resource', () => {
    const payload: PartUsageRequest = { partId: 4, quantity: 1, notes: null, replacementReason: "Falha", componentBatch: null };
    service.use(7, payload).subscribe();
    const usage = httpTesting.expectOne('/api/rmas/7/parts/usages');
    expect(usage.request.method).toBe('POST');
    expect(usage.request.body).toEqual(payload);
    usage.flush({});

    service.undoUse(7, 3, 'Erro').subscribe();
    const cancel = httpTesting.expectOne('/api/rmas/7/parts/usages/3/reversal');
    expect(cancel.request.method).toBe('POST');
    expect(cancel.request.body).toEqual({ reason: 'Erro' });
    cancel.flush({});
  });
});
