import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import {
  ChecklistTemplate,
  ChecklistTemplateRequest,
  RmaChecklistExecution,
  ChecklistItemUpdateRequest,
  RmaApproval,
  RelatedRmaRequest,
  RmaResponse,
} from '../models';
@Injectable({ providedIn: 'root' })
export class OperationsService {
  private readonly http = inject(HttpClient);
  templates() {
    return this.http.get<ChecklistTemplate[]>('/api/checklist-templates');
  }
  saveTemplate(body: ChecklistTemplateRequest, id?: number) {
    return id
      ? this.http.put<ChecklistTemplate>(`/api/checklist-templates/${id}`, body)
      : this.http.post<ChecklistTemplate>('/api/checklist-templates', body);
  }
  executions(id: number) {
    return this.http.get<RmaChecklistExecution[]>(`/api/rmas/${id}/checklists`);
  }
  start(id: number, templateId: number) {
    return this.http.post<RmaChecklistExecution>(`/api/rmas/${id}/checklists`, { templateId });
  }
  updateItem(id: number, executionId: number, itemCode: string, body: ChecklistItemUpdateRequest) {
    return this.http.patch<RmaChecklistExecution>(
      `/api/rmas/${id}/checklists/${executionId}/items/${encodeURIComponent(itemCode)}`,
      body,
    );
  }
  approvals(id: number) {
    return this.http.get<RmaApproval[]>(`/api/rmas/${id}/approvals`);
  }
  request(id: number, body: { code: string; justification: string }) {
    return this.http.post<RmaApproval>(`/api/rmas/${id}/approvals`, body);
  }
  decide(
    id: number,
    approvalId: number,
    body: { status: 'APPROVED' | 'REJECTED'; note: string; expectedRevision: number },
  ) {
    return this.http.patch<RmaApproval>(`/api/rmas/${id}/approvals/${approvalId}`, body);
  }
  relate(id: number, body: RelatedRmaRequest) {
    return this.http.patch<RmaResponse>(`/api/rmas/${id}/related-rma`, body);
  }
}
