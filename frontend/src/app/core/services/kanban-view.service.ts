import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { KanbanViewRequest, KanbanViewResponse } from '../models';

@Injectable({ providedIn: 'root' })
export class KanbanViewService {
  private readonly http = inject(HttpClient);

  list(): Observable<KanbanViewResponse[]> {
    return this.http.get<KanbanViewResponse[]>('/api/kanban-views');
  }

  create(payload: KanbanViewRequest): Observable<KanbanViewResponse> {
    return this.http.post<KanbanViewResponse>('/api/kanban-views', payload);
  }

  update(id: number, payload: KanbanViewRequest): Observable<KanbanViewResponse> {
    return this.http.put<KanbanViewResponse>(`/api/kanban-views/${id}`, payload);
  }

  setDefault(id: number): Observable<KanbanViewResponse> {
    return this.http.patch<KanbanViewResponse>(`/api/kanban-views/${id}/default`, {});
  }

  delete(id: number): Observable<void> {
    return this.http.delete<void>(`/api/kanban-views/${id}`);
  }
}
