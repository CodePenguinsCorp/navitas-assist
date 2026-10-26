import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { RmaStatus, WipLimit } from '../models';

@Injectable({ providedIn: 'root' })
export class WipService {
  private readonly http = inject(HttpClient);
  list() { return this.http.get<WipLimit[]>('/api/kanban-wip'); }
  update(status: RmaStatus, request: { maxItems: number | null; blocking: boolean }) {
    return this.http.put<WipLimit>('/api/kanban-wip/' + status, request);
  }
}
