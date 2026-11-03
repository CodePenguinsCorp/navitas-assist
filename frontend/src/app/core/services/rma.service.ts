import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import {
  CreateRmaRequest,
  DiagnosisRequest,
  PageQuery,
  PageResponse,
  RmaAssigneeUpdateRequest,
  RmaBulkStatusUpdateRequest,
  RmaResponse,
  RmaSummaryResponse,
  RmaPriority,
  RmaStatus,
  RmaStatusUpdateRequest
} from '../models';
import { buildPageParams } from '../utils/pagination';

export interface RmaFilters extends PageQuery {
  query?: string;
  status?: RmaStatus;
}

@Injectable({ providedIn: 'root' })
export class RmaService {
  private readonly http = inject(HttpClient);

  list(filters: RmaFilters = {}): Observable<PageResponse<RmaResponse>> {
    const params = buildPageParams(filters, { query: filters.query, status: filters.status });
    return this.http.get<PageResponse<RmaResponse>>('/api/rmas', { params });
  }

  getSummary(filters: Pick<RmaFilters, 'query' | 'status'> = {}): Observable<RmaSummaryResponse> {
    const params = buildPageParams({}, { query: filters.query, status: filters.status });
    return this.http.get<RmaSummaryResponse>('/api/rmas/summary', { params });
  }

  listBoard(filters: Pick<RmaFilters, 'query' | 'status'> = {}): Observable<RmaResponse[]> {
    const params = buildPageParams({}, { query: filters.query, status: filters.status });
    return this.http.get<RmaResponse[]>('/api/rmas/board', { params });
  }

  getById(id: number): Observable<RmaResponse> {
    return this.http.get<RmaResponse>(`/api/rmas/${id}`);
  }

  history(filters: { batchNumber?: string; serialNumber?: string }): Observable<RmaResponse[]> {
    let params = new HttpParams();

    if (filters.batchNumber?.trim()) {
      params = params.set('batchNumber', filters.batchNumber.trim());
    }

    if (filters.serialNumber?.trim()) {
      params = params.set('serialNumber', filters.serialNumber.trim());
    }

    return this.http.get<RmaResponse[]>('/api/rmas/history', { params });
  }

  create(payload: CreateRmaRequest): Observable<RmaResponse> {
    return this.http.post<RmaResponse>('/api/rmas', payload);
  }

  updateStatus(id: number, payload: RmaStatusUpdateRequest): Observable<RmaResponse> {
    return this.http.patch<RmaResponse>(`/api/rmas/${id}/status`, payload);
  }

  updateStatusInBulk(id: number, payload: RmaBulkStatusUpdateRequest): Observable<RmaResponse> {
    return this.http.patch<RmaResponse>(`/api/rmas/${id}/bulk-status`, payload);
  }

  updatePriority(id: number, priority: RmaPriority): Observable<RmaResponse> {
    return this.http.put<RmaResponse>(`/api/rmas/${id}`, { priority });
  }

  updateAssignee(id: number, payload: RmaAssigneeUpdateRequest): Observable<RmaResponse> {
    return this.http.patch<RmaResponse>(`/api/rmas/${id}/assignee`, payload);
  }

  upsertDiagnosis(id: number, payload: DiagnosisRequest): Observable<RmaResponse> {
    return this.http.put<RmaResponse>(`/api/rmas/${id}/diagnosis`, payload);
  }
}
