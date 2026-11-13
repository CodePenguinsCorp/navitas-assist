import { HttpClient, HttpParams, HttpResponse } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { RmaReportFilters, RmaReportPageResponse, RmaReportSummaryResponse } from '../models';

@Injectable({ providedIn: 'root' })
export class ReportService {
  private readonly http = inject(HttpClient);

  summary(filters: RmaReportFilters): Observable<RmaReportSummaryResponse> {
    return this.http.get<RmaReportSummaryResponse>('/api/reports/rmas/summary', { params: filterParams(filters) });
  }

  list(filters: RmaReportFilters, page: number, size: number): Observable<RmaReportPageResponse> {
    return this.http.get<RmaReportPageResponse>('/api/reports/rmas', { params: filterParams(filters).set('page', page).set('size', size) });
  }

  exportRmas(filters: RmaReportFilters): Observable<HttpResponse<Blob>> {
    return this.http.get('/api/reports/rmas/export.csv', { params: filterParams(filters), observe: 'response', responseType: 'blob' });
  }

  exportSummary(filters: RmaReportFilters): Observable<HttpResponse<Blob>> {
    return this.http.get('/api/reports/rmas/summary/export.csv', { params: filterParams(filters), observe: 'response', responseType: 'blob' });
  }

  downloadTechnicalReport(rmaId: number): Observable<HttpResponse<Blob>> {
    return this.http.get(`/api/rmas/${rmaId}/report.pdf`, { observe: 'response', responseType: 'blob' });
  }
}

function filterParams(filters: RmaReportFilters): HttpParams {
  let params = new HttpParams();
  if (filters.entryFrom) params = params.set('entryFrom', filters.entryFrom);
  if (filters.entryTo) params = params.set('entryTo', filters.entryTo);
  if (filters.status) params = params.set('status', filters.status);
  if (filters.clientId != null) params = params.set('clientId', filters.clientId);
  return params;
}
