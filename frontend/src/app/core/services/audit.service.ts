import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { AuditEventResponse, AuditQuery, PageResponse } from '../models';
import { buildPageParams } from '../utils/pagination';

@Injectable({ providedIn: 'root' })
export class AuditService {
  private readonly http = inject(HttpClient);

  search(query: AuditQuery = {}) {
    const { page = 0, size = 20, ...filters } = query;
    return this.http.get<PageResponse<AuditEventResponse>>('/api/audit-events', {
      params: buildPageParams({ page, size }, filters)
    });
  }
}
