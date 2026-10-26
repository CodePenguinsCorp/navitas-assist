import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import {
  PartMovementRequest,
  PartMovementResponse,
  PartReplenishmentResponse,
  PartRequest,
  PartReservationRequest,
  PartReservationResponse,
  PartResponse,
  RmaPartsResponse
} from '../models';

export type PartReservationAction = 'allocate' | 'consume' | 'cancel';

@Injectable({ providedIn: 'root' })
export class PartService {
  private readonly http = inject(HttpClient);

  list(query?: string): Observable<PartResponse[]> {
    let params = new HttpParams();
    if (query?.trim()) {
      params = params.set('query', query.trim());
    }

    return this.http.get<PartResponse[]>('/api/parts', { params });
  }

  create(payload: PartRequest): Observable<PartResponse> {
    return this.http.post<PartResponse>('/api/parts', payload);
  }

  update(id: number, payload: PartRequest): Observable<PartResponse> {
    return this.http.put<PartResponse>(`/api/parts/${id}`, payload);
  }

  listMovements(partId: number): Observable<PartMovementResponse[]> {
    return this.http.get<PartMovementResponse[]>(`/api/parts/${partId}/movements`);
  }

  registerMovement(partId: number, payload: PartMovementRequest): Observable<PartMovementResponse> {
    return this.http.post<PartMovementResponse>(`/api/parts/${partId}/movements`, payload);
  }

  reverseMovement(movementId: number, reason: string): Observable<PartMovementResponse> {
    return this.http.post<PartMovementResponse>(`/api/parts/movements/${movementId}/reversal`, { reason });
  }

  listPending(): Observable<PartReservationResponse[]> {
    return this.http.get<PartReservationResponse[]>('/api/parts/pending');
  }

  listReplenishment(): Observable<PartReplenishmentResponse[]> {
    return this.http.get<PartReplenishmentResponse[]>('/api/parts/replenishment');
  }

  getRmaParts(rmaId: number): Observable<RmaPartsResponse> {
    return this.http.get<RmaPartsResponse>(`/api/rmas/${rmaId}/parts`);
  }

  reserve(rmaId: number, payload: PartReservationRequest): Observable<PartReservationResponse> {
    return this.http.post<PartReservationResponse>(`/api/rmas/${rmaId}/parts`, payload);
  }

  updateReservation(rmaId: number, reservationId: number, action: PartReservationAction): Observable<PartReservationResponse> {
    return this.http.post<PartReservationResponse>(`/api/rmas/${rmaId}/parts/${reservationId}/${action}`, {});
  }
}
