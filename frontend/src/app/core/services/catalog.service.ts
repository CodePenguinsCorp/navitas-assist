import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import {
  ClientRequest,
  ClientResponse,
  ProductRequest,
  ProductResponse,
  UserAccountRequest,
  UserAccountResponse,
  UserAccountUpdateRequest
} from '../models';

@Injectable({ providedIn: 'root' })
export class CatalogService {
  private readonly http = inject(HttpClient);

  listClients(): Observable<ClientResponse[]> {
    return this.http.get<ClientResponse[]>('/api/clients');
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

  listProducts(): Observable<ProductResponse[]> {
    return this.http.get<ProductResponse[]>('/api/products');
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

  listUsers(): Observable<UserAccountResponse[]> {
    return this.http.get<UserAccountResponse[]>('/api/users');
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
