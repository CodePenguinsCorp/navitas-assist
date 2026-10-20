import { Injectable, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { interval } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class SlaClockService {
  private readonly nowSignal = signal(Date.now());
  readonly now = this.nowSignal.asReadonly();

  constructor() {
    interval(30_000).pipe(takeUntilDestroyed()).subscribe(() => this.nowSignal.set(Date.now()));
  }
}
