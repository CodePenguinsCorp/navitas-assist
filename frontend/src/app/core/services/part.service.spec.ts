import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { PartMovementRequest, PartReservationRequest } from '../models';
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

  it('reserves parts and runs reservation actions under the RMA resource', () => {
    const payload: PartReservationRequest = { partId: 4, quantity: 1, note: null };
    service.reserve(7, payload).subscribe();
    const reserve = httpTesting.expectOne('/api/rmas/7/parts');
    expect(reserve.request.method).toBe('POST');
    expect(reserve.request.body).toEqual(payload);
    reserve.flush({});

    service.updateReservation(7, 3, 'cancel').subscribe();
    const cancel = httpTesting.expectOne('/api/rmas/7/parts/3/cancel');
    expect(cancel.request.method).toBe('POST');
    cancel.flush({});
  });
});
