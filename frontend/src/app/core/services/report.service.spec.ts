import { HttpResponse, provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { filenameFromDisposition } from '../utils/download';
import { ReportService } from './report.service';

describe('ReportService', () => {
  let service: ReportService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    service = TestBed.inject(ReportService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('sends only the filled filters plus the page to the list', () => {
    service.list({ entryFrom: '2026-10-01', clientId: 2 }, 1, 50).subscribe();
    const request = http.expectOne((candidate) => candidate.url === '/api/reports/rmas');
    expect(request.request.params.keys().sort()).toEqual(['clientId', 'entryFrom', 'page', 'size']);
    expect(request.request.params.get('page')).toBe('1');
    expect(request.request.params.get('size')).toBe('50');
    request.flush({});
  });

  it('downloads CSV exports and the PDF as blobs with the response headers', () => {
    let response: HttpResponse<Blob> | undefined;
    service.exportSummary({ status: 'RECEIVED' }).subscribe((value) => response = value);
    const summary = http.expectOne((candidate) => candidate.url === '/api/reports/rmas/summary/export.csv');
    expect(summary.request.responseType).toBe('blob');
    expect(summary.request.params.get('status')).toBe('RECEIVED');
    summary.flush(new Blob(['x']), { headers: { 'Content-Disposition': 'attachment; filename="resumo.csv"' } });
    expect(response?.headers.get('Content-Disposition')).toContain('resumo.csv');

    service.exportRmas({}).subscribe();
    expect(http.expectOne('/api/reports/rmas/export.csv').request.responseType).toBe('blob');
    service.downloadTechnicalReport(7).subscribe();
    expect(http.expectOne('/api/rmas/7/report.pdf').request.responseType).toBe('blob');
  });

  it('reads plain and encoded file names from Content-Disposition', () => {
    expect(filenameFromDisposition('attachment; filename="laudo-RMA-1.pdf"', 'x.pdf')).toBe('laudo-RMA-1.pdf');
    expect(filenameFromDisposition("attachment; filename*=UTF-8''rmas%20out.csv", 'x.csv')).toBe('rmas out.csv');
    expect(filenameFromDisposition(null, 'x.csv')).toBe('x.csv');
  });
});
