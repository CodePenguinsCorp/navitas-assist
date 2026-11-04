import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { RmaReportFilters, RmaReportResponse } from '../models';

@Injectable({ providedIn: 'root' })
export class ReportService {
  private readonly http = inject(HttpClient);

  list(filters: RmaReportFilters): Observable<RmaReportResponse> {
    let params = new HttpParams();
    if (filters.entryFrom) params = params.set('entryFrom', filters.entryFrom);
    if (filters.entryTo) params = params.set('entryTo', filters.entryTo);
    if (filters.status) params = params.set('status', filters.status);
    if (filters.clientId != null) params = params.set('clientId', filters.clientId);
    return this.http.get<RmaReportResponse>('/api/reports/rmas', { params });
  }
}
