import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { CustodyMovementRequest, StorageLocationRequest } from '../models';
import { CustodyService } from './custody.service';

describe('CustodyService', () => {
  let service: CustodyService;
  let httpTesting: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(CustodyService);
    httpTesting = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpTesting.verify());

  it('uses the location collection and resource endpoints', () => {
    const payload: StorageLocationRequest = { code: 'BANC-01', name: 'Bancada 1', type: 'BENCH', parentId: null, description: null, active: true };

    service.createLocation(payload).subscribe();
    const create = httpTesting.expectOne('/api/locations');
    expect(create.request.method).toBe('POST');
    expect(create.request.body).toEqual(payload);
    create.flush({});

    service.updateLocation(3, { ...payload, active: false }).subscribe();
    const update = httpTesting.expectOne('/api/locations/3');
    expect(update.request.method).toBe('PUT');
    expect(update.request.body.active).toBe(false);
    update.flush({});
  });

  it('searches by area and flag only when filters are informed', () => {
    service.search().subscribe();
    const all = httpTesting.expectOne((request) => request.url === '/api/custody');
    expect(all.request.params.keys()).toEqual([]);
    all.flush([]);

    service.search({ locationId: 5, flag: 'STALE' }).subscribe();
    const filtered = httpTesting.expectOne((request) => request.url === '/api/custody');
    expect(filtered.request.params.get('locationId')).toBe('5');
    expect(filtered.request.params.get('flag')).toBe('STALE');
    filtered.flush([]);
  });

  it('posts movements to the RMA custody endpoint', () => {
    const payload: CustodyMovementRequest = { type: 'TRANSFER', toLocationId: 2, custodianId: null, reason: 'Reparo' };

    service.move(9, payload).subscribe();
    const move = httpTesting.expectOne('/api/custody/rmas/9/movements');
    expect(move.request.method).toBe('POST');
    expect(move.request.body).toEqual(payload);
    move.flush({});

    service.getDetail(9).subscribe();
    httpTesting.expectOne('/api/custody/rmas/9').flush({});
  });
});
