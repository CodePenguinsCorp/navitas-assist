import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import {
  AssignableUserResponse,
  CustodyFlag,
  CustodyMovementRequest,
  CustodySummaryResponse,
  PageResponse,
  RmaCustodyDetailResponse,
  RmaCustodyResponse,
  StorageLocationRequest,
  StorageLocationResponse
} from '../models';

@Injectable({ providedIn: 'root' })
export class CustodyService {
  private readonly http = inject(HttpClient);

  listLocations(): Observable<StorageLocationResponse[]> {
    return this.http.get<StorageLocationResponse[]>('/api/locations');
  }

  createLocation(payload: StorageLocationRequest): Observable<StorageLocationResponse> {
    return this.http.post<StorageLocationResponse>('/api/locations', payload);
  }

  updateLocation(id: number, payload: StorageLocationRequest): Observable<StorageLocationResponse> {
    return this.http.put<StorageLocationResponse>(`/api/locations/${id}`, payload);
  }

  search(filters: { locationId?: number | null; flag?: CustodyFlag | null; query?: string; page?: number; size?: number } = {}): Observable<PageResponse<RmaCustodyResponse>> {
    let params = new HttpParams();
    if (filters.locationId) {
      params = params.set('locationId', filters.locationId);
    }
    if (filters.flag) {
      params = params.set('flag', filters.flag);
    }
    if (filters.query?.trim()) {
      params = params.set('query', filters.query.trim());
    }
    if (filters.page !== undefined) {
      params = params.set('page', filters.page);
    }
    if (filters.size !== undefined) {
      params = params.set('size', filters.size);
    }
    return this.http.get<PageResponse<RmaCustodyResponse>>('/api/custody', { params });
  }

  summary(locationId: number | null = null): Observable<CustodySummaryResponse> {
    const params = locationId ? new HttpParams().set('locationId', locationId) : new HttpParams();
    return this.http.get<CustodySummaryResponse>('/api/custody/summary', { params });
  }

  listCustodians(): Observable<AssignableUserResponse[]> {
    return this.http.get<AssignableUserResponse[]>('/api/custody/custodians');
  }

  getDetail(rmaId: number): Observable<RmaCustodyDetailResponse> {
    return this.http.get<RmaCustodyDetailResponse>(`/api/custody/rmas/${rmaId}`);
  }

  // Ponto de extensão da leitura de etiqueta (NAV-43): o leitor resolve o RMA pelo código e usa este mesmo método.
  move(rmaId: number, payload: CustodyMovementRequest): Observable<RmaCustodyDetailResponse> {
    return this.http.post<RmaCustodyDetailResponse>(`/api/custody/rmas/${rmaId}/movements`, payload);
  }
}
