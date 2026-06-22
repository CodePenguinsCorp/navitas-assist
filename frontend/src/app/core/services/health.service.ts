import { HttpClient } from '@angular/common/http';
import { Injectable, inject, signal } from '@angular/core';
import { EMPTY } from 'rxjs';
import { catchError, take } from 'rxjs/operators';
import { HealthState } from '../models';

@Injectable({ providedIn: 'root' })
export class HealthService {
  private readonly http = inject(HttpClient);

  private readonly statusSignal = signal<HealthState>('checking');
  private readonly messageSignal = signal('Verificação pendente.');
  private readonly checkedAtSignal = signal<Date | null>(null);

  readonly status = this.statusSignal.asReadonly();
  readonly message = this.messageSignal.asReadonly();
  readonly checkedAt = this.checkedAtSignal.asReadonly();

  refresh(): void {
    this.statusSignal.set('checking');
    this.messageSignal.set('Verificando disponibilidade do sistema...');

    this.http.get('/health', { responseType: 'text' }).pipe(
      take(1),
      catchError(() => {
        this.statusSignal.set('offline');
        this.messageSignal.set('Servidor indisponível no momento.');
        this.checkedAtSignal.set(new Date());
        return EMPTY;
      })
    ).subscribe((message) => {
      this.statusSignal.set('online');
      this.messageSignal.set(message || 'Sistema operacional.');
      this.checkedAtSignal.set(new Date());
    });
  }
}
