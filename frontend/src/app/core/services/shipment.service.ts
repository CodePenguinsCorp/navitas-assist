import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import {
  CreateShipmentRequest,
  ManualShipmentEventRequest,
  ShipmentDetailResponse,
  ShipmentResponse,
  ShipmentStatus,
  UpdateShipmentRequest
} from '../models';

@Injectable({ providedIn: 'root' })
export class ShipmentService {
  private readonly http = inject(HttpClient);

  list(filters: { rmaId?: number | null; status?: ShipmentStatus | null } = {}): Observable<ShipmentResponse[]> {
    let params = new HttpParams();
    if (filters.rmaId) {
      params = params.set('rmaId', filters.rmaId);
    }
    if (filters.status) {
      params = params.set('status', filters.status);
    }
    return this.http.get<ShipmentResponse[]>('/api/shipments', { params });
  }

  getDetail(id: number): Observable<ShipmentDetailResponse> {
    return this.http.get<ShipmentDetailResponse>(`/api/shipments/${id}`);
  }

  create(payload: CreateShipmentRequest): Observable<ShipmentDetailResponse> {
    return this.http.post<ShipmentDetailResponse>('/api/shipments', payload);
  }

  update(id: number, payload: UpdateShipmentRequest): Observable<ShipmentDetailResponse> {
    return this.http.put<ShipmentDetailResponse>(`/api/shipments/${id}`, payload);
  }

  addManualEvent(id: number, payload: ManualShipmentEventRequest): Observable<ShipmentDetailResponse> {
    return this.http.post<ShipmentDetailResponse>(`/api/shipments/${id}/events`, payload);
  }

  sync(id: number): Observable<ShipmentDetailResponse> {
    return this.http.post<ShipmentDetailResponse>(`/api/shipments/${id}/sync`, null);
  }
}
