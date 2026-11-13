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
}
