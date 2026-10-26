import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { CreateShipmentRequest, ManualShipmentEventRequest } from '../models';
import { ShipmentService } from './shipment.service';

describe('ShipmentService', () => {
  let service: ShipmentService;
  let httpTesting: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(ShipmentService);
    httpTesting = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpTesting.verify());

  it('filters the shipment list only when filters are informed', () => {
    service.list().subscribe();
    const all = httpTesting.expectOne((request) => request.url === '/api/shipments');
    expect(all.request.params.keys()).toEqual([]);
    all.flush([]);

    service.list({ rmaId: 3, status: 'EXCEPTION' }).subscribe();
    const filtered = httpTesting.expectOne((request) => request.url === '/api/shipments');
    expect(filtered.request.params.get('rmaId')).toBe('3');
    expect(filtered.request.params.get('status')).toBe('EXCEPTION');
    filtered.flush([]);
  });

  it('uses the shipment write endpoints', () => {
    const payload: CreateShipmentRequest = { rmaId: 3, type: 'PICKUP', originName: 'Cliente', originAddress: null, destinationName: 'Lab',
      destinationAddress: null, volumes: 1, carrier: 'Correios', serviceName: null, trackingCode: null, labelReference: null, cost: '10.50' };
    service.create(payload).subscribe();
    const create = httpTesting.expectOne('/api/shipments');
    expect(create.request.method).toBe('POST');
    expect(create.request.body).toEqual(payload);
    create.flush({});

    const event: ManualShipmentEventRequest = { status: 'DELIVERED', description: null, proofReference: 'AR-1', occurredAt: null, justification: 'Confirmado' };
    service.addManualEvent(7, event).subscribe();
    const manual = httpTesting.expectOne('/api/shipments/7/events');
    expect(manual.request.method).toBe('POST');
    expect(manual.request.body).toEqual(event);
    manual.flush({});

    service.sync(7).subscribe();
    const sync = httpTesting.expectOne('/api/shipments/7/sync');
    expect(sync.request.method).toBe('POST');
    sync.flush({});
  });
});
