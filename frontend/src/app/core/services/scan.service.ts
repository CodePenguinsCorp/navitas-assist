import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { RmaResponse, ScanCodeResponse, ScanStatusChangeRequest } from '../models';

@Injectable({ providedIn: 'root' })
export class ScanService {
  private readonly http = inject(HttpClient);

  issue(rmaId: number): Observable<ScanCodeResponse> {
    return this.http.post<ScanCodeResponse>(`/api/rmas/${rmaId}/scan-code`, {});
  }

  revoke(rmaId: number): Observable<void> {
    return this.http.post<void>(`/api/rmas/${rmaId}/scan-code/revoke`, {});
  }

  resolve(code: string): Observable<RmaResponse> {
    return this.http.get<RmaResponse>(`/api/scan/${encodeURIComponent(code.trim())}`);
  }

  changeStatus(code: string, payload: ScanStatusChangeRequest): Observable<RmaResponse> {
    return this.http.post<RmaResponse>(`/api/scan/${encodeURIComponent(code.trim())}/status`, payload);
  }

  /** Same-origin image URLs; the token in the query only busts the cache after a revocation. */
  imageUrl(scanCode: ScanCodeResponse, format: 'qr' | 'barcode'): string {
    return `/api/rmas/${scanCode.rmaId}/scan-code/${format}.svg?v=${scanCode.token}`;
  }
}
