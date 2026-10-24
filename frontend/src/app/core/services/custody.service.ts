import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import {
  AssignableUserResponse,
  CustodyFlag,
  CustodyMovementRequest,
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

  search(filters: { locationId?: number | null; flag?: CustodyFlag | null } = {}): Observable<RmaCustodyResponse[]> {
    let params = new HttpParams();
    if (filters.locationId) {
      params = params.set('locationId', filters.locationId);
    }
    if (filters.flag) {
      params = params.set('flag', filters.flag);
    }
    return this.http.get<RmaCustodyResponse[]>('/api/custody', { params });
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
