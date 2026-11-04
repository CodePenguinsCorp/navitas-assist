import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { ScanService } from './scan.service';

describe('ScanService', () => {
  let service: ScanService;
  let httpTesting: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(ScanService);
    httpTesting = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpTesting.verify());

  it('resolves trimmed, URL-encoded codes', () => {
    service.resolve('  ABC/DEF ').subscribe();
    const request = httpTesting.expectOne('/api/scan/ABC%2FDEF');
    expect(request.request.method).toBe('GET');
    request.flush({});
  });

  it('sends quick status changes with explicit confirmation', () => {
    const payload = { expectedStatus: 'RECEIVED', status: 'TRIAGE', note: null, source: 'CAMERA', confirmed: true } as const;
    service.changeStatus('TOKEN', payload).subscribe();
    const request = httpTesting.expectOne('/api/scan/TOKEN/status');
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual(payload);
    request.flush({});
  });

  it('issues and revokes codes under the RMA resource and builds same-origin image URLs', () => {
    service.issue(7).subscribe();
    httpTesting.expectOne('/api/rmas/7/scan-code').flush({});
    service.revoke(7).subscribe();
    const revoke = httpTesting.expectOne('/api/rmas/7/scan-code/revoke');
    expect(revoke.request.method).toBe('POST');
    revoke.flush(null);

    const code = { rmaId: 7, rmaCode: 'RMA-1', token: 'ABC', createdAt: '', createdBy: 'x' };
    expect(service.imageUrl(code, 'qr')).toBe('/api/rmas/7/scan-code/qr.svg?v=ABC');
    expect(service.imageUrl(code, 'barcode')).toBe('/api/rmas/7/scan-code/barcode.svg?v=ABC');
  });
});
