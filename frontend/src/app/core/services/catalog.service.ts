import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import {
  AssignableUserResponse,
  ClientRequest,
  ClientResponse,
  ClientSummaryResponse,
  PageQuery,
  PageResponse,
  ProductRequest,
  ProductResponse,
  ProductSummaryResponse,
  UserAccountRequest,
  UserAccountResponse,
  UserAccountUpdateRequest,
  UserRole,
  UserSummaryResponse
} from '../models';
import { buildPageParams } from '../utils/pagination';

export interface ClientFilters extends PageQuery {
  query?: string;
  hasDocument?: boolean;
  hasEmail?: boolean;
}

export interface ProductFilters extends PageQuery {
  query?: string;
  category?: string;
  hasFirmware?: boolean;
}

export interface UserFilters extends PageQuery {
  query?: string;
  role?: UserRole;
  active?: boolean;
}

@Injectable({ providedIn: 'root' })
export class CatalogService {
  private readonly http = inject(HttpClient);

  listClients(filters: ClientFilters = {}): Observable<PageResponse<ClientResponse>> {
    const params = buildPageParams(filters, {
      query: filters.query,
      hasDocument: filters.hasDocument,
      hasEmail: filters.hasEmail
    });
    return this.http.get<PageResponse<ClientResponse>>('/api/clients', { params });
  }

  listClientOptions(): Observable<ClientResponse[]> {
    return this.http.get<ClientResponse[]>('/api/clients/options');
  }

  getClientSummary(): Observable<ClientSummaryResponse> {
    return this.http.get<ClientSummaryResponse>('/api/clients/summary');
  }

  createClient(payload: ClientRequest): Observable<ClientResponse> {
    return this.http.post<ClientResponse>('/api/clients', payload);
  }

  updateClient(id: number, payload: ClientRequest): Observable<ClientResponse> {
    return this.http.put<ClientResponse>(`/api/clients/${id}`, payload);
  }

  deleteClient(id: number): Observable<void> {
    return this.http.delete<void>(`/api/clients/${id}`);
  }

  listProducts(filters: ProductFilters = {}): Observable<PageResponse<ProductResponse>> {
    const params = buildPageParams(filters, {
      query: filters.query,
      category: filters.category,
      hasFirmware: filters.hasFirmware
    });
    return this.http.get<PageResponse<ProductResponse>>('/api/products', { params });
  }

  listProductOptions(): Observable<ProductResponse[]> {
    return this.http.get<ProductResponse[]>('/api/products/options');
  }

  getProductSummary(): Observable<ProductSummaryResponse> {
    return this.http.get<ProductSummaryResponse>('/api/products/summary');
  }

  createProduct(payload: ProductRequest): Observable<ProductResponse> {
    return this.http.post<ProductResponse>('/api/products', payload);
  }

  updateProduct(id: number, payload: ProductRequest): Observable<ProductResponse> {
    return this.http.put<ProductResponse>(`/api/products/${id}`, payload);
  }

  deleteProduct(id: number): Observable<void> {
    return this.http.delete<void>(`/api/products/${id}`);
  }

  listUsers(filters: UserFilters = {}): Observable<PageResponse<UserAccountResponse>> {
    const params = buildPageParams(filters, {
      query: filters.query,
      role: filters.role,
      active: filters.active
    });
    return this.http.get<PageResponse<UserAccountResponse>>('/api/users', { params });
  }

  getUserSummary(): Observable<UserSummaryResponse> {
    return this.http.get<UserSummaryResponse>('/api/users/summary');
  }

  listAssignableUsers(): Observable<AssignableUserResponse[]> {
    return this.http.get<AssignableUserResponse[]>('/api/users/assignable');
  }

  createUser(payload: UserAccountRequest): Observable<UserAccountResponse> {
    return this.http.post<UserAccountResponse>('/api/users', payload);
  }

  updateUser(id: number, payload: UserAccountUpdateRequest): Observable<UserAccountResponse> {
    return this.http.put<UserAccountResponse>(`/api/users/${id}`, payload);
  }

  deleteUser(id: number): Observable<void> {
    return this.http.delete<void>(`/api/users/${id}`);
  }
}
