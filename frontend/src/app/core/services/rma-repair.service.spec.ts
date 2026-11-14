import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { RmaRepairService } from './rma-repair.service';

describe('RmaRepairService', () => {
  it('reads repair and external components and posts the structured payloads', () => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    const service = TestBed.inject(RmaRepairService);
    const http = TestBed.inject(HttpTestingController);
    service.getRepair(7).subscribe();
    http.expectOne('/api/rmas/7/repair').flush({ interventions: [], totalServiceHours: 0 });
    service.listExternalComponents(7).subscribe();
    http.expectOne('/api/rmas/7/repair/external-components').flush([]);
    const external = { code: null, description: 'Conector', quantity: 1, unit: 'un', componentBatch: null, replacementReason: 'Oxidação' };
    service.addExternalComponent(7, external).subscribe();
    const externalRequest = http.expectOne('/api/rmas/7/repair/external-components');
    expect(externalRequest.request.method).toBe('POST');
    expect(externalRequest.request.body).toEqual(external);
    externalRequest.flush({});
    const intervention = { type: 'CLEANING' as const, description: 'Limpeza dos contatos', performedOn: '2026-11-12', hours: 0.5 };
    service.addIntervention(7, intervention).subscribe();
    const request = http.expectOne('/api/rmas/7/repair/interventions');
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual(intervention);
    request.flush({});
    http.verify();
  });
});
