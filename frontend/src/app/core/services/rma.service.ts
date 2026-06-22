import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import {
  CreateRmaRequest,
  DiagnosisRequest,
  RmaResponse,
  RmaStatus,
  RmaStatusUpdateRequest
} from '../models';

@Injectable({ providedIn: 'root' })
export class RmaService {
  private readonly http = inject(HttpClient);

  list(filters?: { query?: string; status?: RmaStatus }): Observable<RmaResponse[]> {
    let params = new HttpParams();

    if (filters?.query?.trim()) {
      params = params.set('query', filters.query.trim());
    }

    if (filters?.status) {
      params = params.set('status', filters.status);
    }

    return this.http.get<RmaResponse[]>('/api/rmas', { params });
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

  upsertDiagnosis(id: number, payload: DiagnosisRequest): Observable<RmaResponse> {
    return this.http.put<RmaResponse>(`/api/rmas/${id}/diagnosis`, payload);
  }
}
