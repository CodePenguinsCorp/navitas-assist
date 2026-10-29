import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { PublishedWorkflow, WorkflowDraft, WorkflowDefinition } from '../models';
@Injectable({ providedIn: 'root' })
export class WorkflowService {
  private readonly http = inject(HttpClient);
  published() {
    return this.http.get<PublishedWorkflow>('/api/workflows');
  }
  draft() {
    return this.http.get<WorkflowDraft>('/api/workflows/draft');
  }
  start() {
    return this.http.post<WorkflowDraft>('/api/workflows/draft', {});
  }
  save(expectedRevision: number, definition: WorkflowDefinition) {
    return this.http.put<WorkflowDraft>('/api/workflows/draft', { expectedRevision, definition });
  }
  publish(expectedRevision: number) {
    return this.http.post<PublishedWorkflow>('/api/workflows/publish', { expectedRevision });
  }
  discard(revision: number) {
    return this.http.delete<void>('/api/workflows/draft', { params: { revision } });
  }
}
