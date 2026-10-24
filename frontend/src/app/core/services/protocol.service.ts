import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import {
  ProtocolExecutionResponse,
  ProtocolItemResultRequest,
  ProtocolTemplateRequest,
  ProtocolTemplateResponse
} from '../models';

@Injectable({ providedIn: 'root' })
export class ProtocolService {
  private readonly http = inject(HttpClient);

  listTemplates(): Observable<ProtocolTemplateResponse[]> {
    return this.http.get<ProtocolTemplateResponse[]>('/api/protocols/templates');
  }

  createTemplate(payload: ProtocolTemplateRequest): Observable<ProtocolTemplateResponse> {
    return this.http.post<ProtocolTemplateResponse>('/api/protocols/templates', payload);
  }

  updateTemplate(id: number, payload: ProtocolTemplateRequest): Observable<ProtocolTemplateResponse> {
    return this.http.put<ProtocolTemplateResponse>(`/api/protocols/templates/${id}`, payload);
  }

  listExecutions(rmaId: number): Observable<ProtocolExecutionResponse[]> {
    return this.http.get<ProtocolExecutionResponse[]>(`/api/protocols/rmas/${rmaId}/executions`);
  }

  startExecution(rmaId: number, templateId: number): Observable<ProtocolExecutionResponse> {
    return this.http.post<ProtocolExecutionResponse>(`/api/protocols/rmas/${rmaId}/executions`, { templateId });
  }

  recordResult(executionId: number, itemId: number, payload: ProtocolItemResultRequest): Observable<ProtocolExecutionResponse> {
    return this.http.post<ProtocolExecutionResponse>(`/api/protocols/executions/${executionId}/items/${itemId}/results`, payload);
  }

  complete(executionId: number): Observable<ProtocolExecutionResponse> {
    return this.http.post<ProtocolExecutionResponse>(`/api/protocols/executions/${executionId}/complete`, null);
  }
}
