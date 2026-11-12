import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, shareReplay } from 'rxjs';
import { PageQuery, PageResponse, PermissionModuleResponse, ProfileOption, ProfileRequest, ProfileResponse } from '../models';
import { buildPageParams } from '../utils/pagination';

export interface ProfileFilters extends PageQuery {
  query?: string;
}

@Injectable({ providedIn: 'root' })
export class ProfileService {
  private readonly http = inject(HttpClient);
  // Guardados para não abrir o pop-up global a cada diálogo. Uma falha não fica guardada: o shareReplay
  // refaz a requisição na próxima inscrição.
  private catalog$: Observable<PermissionModuleResponse[]> | null = null;
  private options$: Observable<ProfileOption[]> | null = null;

  list(filters: ProfileFilters = {}): Observable<PageResponse<ProfileResponse>> {
    const params = buildPageParams(filters, { query: filters.query });
    return this.http.get<PageResponse<ProfileResponse>>('/api/profiles', { params });
  }

  options(): Observable<ProfileOption[]> {
    this.options$ ??= this.http.get<ProfileOption[]>('/api/profiles/options').pipe(shareReplay({ bufferSize: 1, refCount: false }));
    return this.options$;
  }

  invalidateOptions(): void {
    this.options$ = null;
  }

  permissionCatalog(): Observable<PermissionModuleResponse[]> {
    this.catalog$ ??= this.http.get<PermissionModuleResponse[]>('/api/permissions').pipe(shareReplay({ bufferSize: 1, refCount: false }));
    return this.catalog$;
  }

  create(payload: ProfileRequest): Observable<ProfileResponse> {
    return this.http.post<ProfileResponse>('/api/profiles', payload);
  }

  update(id: number, payload: ProfileRequest): Observable<ProfileResponse> {
    return this.http.put<ProfileResponse>(`/api/profiles/${id}`, payload);
  }

  delete(id: number): Observable<void> {
    return this.http.delete<void>(`/api/profiles/${id}`);
  }
}
