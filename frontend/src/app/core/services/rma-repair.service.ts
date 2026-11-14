import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { ExternalComponentRequest, ExternalComponentResponse, InterventionRequest, InterventionResponse, RmaRepairResponse } from '../models';

@Injectable({ providedIn: 'root' })
export class RmaRepairService {
  private readonly http = inject(HttpClient);

  getRepair(rmaId: number): Observable<RmaRepairResponse> {
    return this.http.get<RmaRepairResponse>(`/api/rmas/${rmaId}/repair`);
  }

  listExternalComponents(rmaId: number): Observable<ExternalComponentResponse[]> {
    return this.http.get<ExternalComponentResponse[]>(`/api/rmas/${rmaId}/repair/external-components`);
  }

  addExternalComponent(rmaId: number, payload: ExternalComponentRequest): Observable<ExternalComponentResponse> {
    return this.http.post<ExternalComponentResponse>(`/api/rmas/${rmaId}/repair/external-components`, payload);
  }

  addIntervention(rmaId: number, payload: InterventionRequest): Observable<InterventionResponse> {
    return this.http.post<InterventionResponse>(`/api/rmas/${rmaId}/repair/interventions`, payload);
  }
  updateExternalComponent(rmaId: number, id: number, payload: ExternalComponentRequest): Observable<ExternalComponentResponse> {
    return this.http.put<ExternalComponentResponse>(`/api/rmas/${rmaId}/repair/external-components/${id}`, payload);
  }

  voidExternalComponent(rmaId: number, id: number, reason: string): Observable<ExternalComponentResponse> {
    return this.http.post<ExternalComponentResponse>(`/api/rmas/${rmaId}/repair/external-components/${id}/void`, { reason });
  }

  updateIntervention(rmaId: number, id: number, payload: InterventionRequest): Observable<InterventionResponse> {
    return this.http.put<InterventionResponse>(`/api/rmas/${rmaId}/repair/interventions/${id}`, payload);
  }

  voidIntervention(rmaId: number, id: number, reason: string): Observable<InterventionResponse> {
    return this.http.post<InterventionResponse>(`/api/rmas/${rmaId}/repair/interventions/${id}/void`, { reason });
  }
}
