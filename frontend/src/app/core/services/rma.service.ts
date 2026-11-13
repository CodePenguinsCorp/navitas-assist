import { HttpClient, HttpContext } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import {
  CreateRmaRequest,
  DiagnosisRequest,
  PageQuery,
  PageResponse,
  RmaAssigneeUpdateRequest,
  RmaBlockRequest,
  RmaBlockResolveRequest,
  RmaResponse,
  RmaItemWarrantyRequest,
  RmaSummaryResponse,
  RmaPriority,
  RmaStatus,
  RmaStatusUpdateRequest,
  UpdateRmaDueDateRequest
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

  getById(id: number, context?: HttpContext): Observable<RmaResponse> {
    return this.http.get<RmaResponse>(`/api/rmas/${id}`, { context });
  }

  create(payload: CreateRmaRequest): Observable<RmaResponse> {
    return this.http.post<RmaResponse>('/api/rmas', payload);
  }

  updateStatus(id: number, payload: RmaStatusUpdateRequest): Observable<RmaResponse> {
    return this.http.patch<RmaResponse>(`/api/rmas/${id}/status`, payload);
  }

  updatePriority(id: number, priority: RmaPriority): Observable<RmaResponse> {
    return this.http.put<RmaResponse>(`/api/rmas/${id}`, { priority });
  }

  /** A null date removes the due date with `clearDueDate`; a null `dueDate` would mean "unchanged". */
  updateDueDate(id: number, dueDate: string | null): Observable<RmaResponse> {
    const payload: UpdateRmaDueDateRequest = dueDate ? { dueDate } : { clearDueDate: true };
    return this.http.put<RmaResponse>(`/api/rmas/${id}`, payload);
  }

  updateWarranty(rmaId: number, itemId: number, payload: RmaItemWarrantyRequest): Observable<RmaResponse> {
    return this.http.put<RmaResponse>(`/api/rmas/${rmaId}/items/${itemId}/warranty`, payload);
  }

  updateAssignee(id: number, payload: RmaAssigneeUpdateRequest): Observable<RmaResponse> {
    return this.http.patch<RmaResponse>(`/api/rmas/${id}/assignee`, payload);
  }

  block(id: number, payload: RmaBlockRequest): Observable<RmaResponse> {
    return this.http.post<RmaResponse>(`/api/rmas/${id}/blocks`, payload);
  }

  resolveBlock(id: number, blockId: number, payload: RmaBlockResolveRequest): Observable<RmaResponse> {
    return this.http.patch<RmaResponse>(`/api/rmas/${id}/blocks/${blockId}`, payload);
  }

  upsertDiagnosis(id: number, payload: DiagnosisRequest): Observable<RmaResponse> {
    return this.http.put<RmaResponse>(`/api/rmas/${id}/diagnosis`, payload);
  }
}
